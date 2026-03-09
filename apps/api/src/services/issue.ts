import { prisma } from "@knownissue/db";
import type { ReportInput, SearchInput } from "@knownissue/shared";
import {
  reportInputSchema,
  REPORT_IMMEDIATE_REWARD,
  DUPLICATE_PENALTY,
  ACCESS_COUNT_THRESHOLD,
  PATCHED_FIXED_COUNT,
  CLOSED_FIXED_COUNT,
  REPORT_THROTTLE_NEW,
  REPORT_THROTTLE_MATURE,
  REPORT_THROTTLE_ESTABLISHED,
  ACCOUNT_AGE_MATURE,
  ACCOUNT_AGE_ESTABLISHED,
} from "@knownissue/shared";
import { generateEmbedding } from "./embedding";
import { computeFingerprint, findByFingerprint } from "./fingerprint";
import { checkDuplicate, validateContent } from "./spam";
import { logAudit } from "./audit";
import { createIssueRevision } from "./revision";
import { awardCredits, penalizeCredits } from "./credits";
import * as patchService from "./patch";
import { claimReportReward } from "./reward";
import { createRelation, loadRelatedIssues } from "./relations";
import { inferRelationsForIssue } from "./relationInference";
import { RELATION_DISPLAY_CONFIDENCE_MIN, RELATION_MAX_DISPLAYED_PER_ISSUE } from "@knownissue/shared";

function summarizePatches<
  P extends {
    id: string;
    explanation: string;
    steps: unknown;
    score: number;
    versionConstraint: string | null;
    submitter: unknown;
    createdAt: Date;
    verifications: { outcome: string }[];
  },
>(patches: P[]) {
  return patches.map((p) => {
    const counts = { fixed: 0, not_fixed: 0, partial: 0 };
    for (const v of p.verifications) {
      counts[v.outcome as keyof typeof counts]++;
    }
    return {
      id: p.id,
      explanation: p.explanation,
      steps: p.steps,
      score: p.score,
      versionConstraint: p.versionConstraint,
      submitter: p.submitter,
      createdAt: p.createdAt,
      verificationSummary: { ...counts, total: counts.fixed + counts.not_fixed + counts.partial },
    };
  });
}

export async function searchIssues(params: SearchInput & { limit?: number; offset?: number }, userId?: string) {
  const { query, library, version, errorCode, contextLibrary, limit = 10, offset = 0 } = params;

  // Tier 1: fingerprint match via errorCode
  if (errorCode && library) {
    const fingerprint = computeFingerprint(library, errorCode);
    if (fingerprint) {
      const issue = await findByFingerprint(fingerprint);
      if (issue) {
        const relatedMap = await loadRelatedIssues([issue.id], {
          minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN,
          maxPerIssue: RELATION_MAX_DISPLAYED_PER_ISSUE,
        });
        return {
          issues: [{ ...issue, patches: summarizePatches(issue.patches), relatedIssues: relatedMap.get(issue.id) ?? [] }],
          total: 1,
          _meta: { matchTier: 1, confidence: 1.0 },
          _next_actions: [
            "Apply a patch from the results, then call verify with the outcome",
            "If none of these match your issue, call report to add it",
          ],
        };
      }
    }
  }

  // Tier 2: fingerprint match via normalized errorMessage in query
  if (library) {
    const fingerprint = computeFingerprint(library, null, query);
    if (fingerprint) {
      const issue = await findByFingerprint(fingerprint);
      if (issue) {
        const relatedMap = await loadRelatedIssues([issue.id], {
          minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN,
          maxPerIssue: RELATION_MAX_DISPLAYED_PER_ISSUE,
        });
        return {
          issues: [{ ...issue, patches: summarizePatches(issue.patches), relatedIssues: relatedMap.get(issue.id) ?? [] }],
          total: 1,
          _meta: { matchTier: 2, confidence: 0.95 },
          _next_actions: [
            "Apply a patch from the results, then call verify with the outcome",
            "If none of these match your issue, call report to add it",
          ],
        };
      }
    }
  }

  // Tier 3: embedding/semantic search
  if (!query) {
    return { issues: [], total: 0, _meta: { matchTier: null, confidence: 0 } };
  }
  const embedding = await generateEmbedding(query, userId);

  if (embedding) {
    const vectorStr = `[${embedding.join(",")}]`;

    const conditions: string[] = [];
    const queryParams: unknown[] = [vectorStr, limit, offset];
    let paramIndex = 4;

    if (library) {
      conditions.push(`"library" = $${paramIndex++}`);
      queryParams.push(library);
    }
    if (version) {
      conditions.push(`"version" = $${paramIndex++}`);
      queryParams.push(version);
    }
    if (contextLibrary) {
      conditions.push(`$${paramIndex++} = ANY("contextLibraries")`);
      queryParams.push(contextLibrary);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const countConditions = conditions.slice();
    const countParams = queryParams.slice(3);

    const [issues, countResult] = await Promise.all([
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT id, title, description, library, version, ecosystem, severity, status, tags,
                "errorMessage", "errorCode", "fingerprint",
                "contextLibraries", "runtime", "platform", "category",
                "accessCount", "searchHitCount",
                "reporterId", "createdAt", "updatedAt",
                1 - (embedding <=> $1::vector) as similarity
         FROM "Bug"
         ${whereClause}
         ORDER BY embedding <=> $1::vector
         LIMIT $2 OFFSET $3`,
        ...queryParams
      ),
      prisma.$queryRawUnsafe<[{ count: number }]>(
        `SELECT COUNT(*)::int as count FROM "Bug" ${whereClause ? `WHERE ${countConditions.join(" AND ")}` : ""}`,
        ...countParams
      ),
    ]);

    // Increment searchHitCount on returned issues
    const issueIds = issues.map((b) => b.id as string);
    if (issueIds.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Bug" SET "searchHitCount" = "searchHitCount" + 1 WHERE id = ANY($1::text[])`,
        issueIds
      );
    }

    // Trigger deferred report rewards for matched issues
    if (userId && issueIds.length > 0) {
      await Promise.all(issueIds.map((id) => claimReportReward(id, userId)));
    }

    // Load patches for each issue
    const patchesByIssue = issueIds.length > 0
      ? await prisma.patch.findMany({
          where: { issueId: { in: issueIds } },
          include: {
            submitter: true,
            verifications: { include: { verifier: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const issuesWithPatches = issues.map((issue) => ({
      ...issue,
      patches: summarizePatches(
        patchesByIssue.filter((p) => p.issueId === issue.id)
      ),
    }));

    // Load related issues for all results
    const relatedMap = await loadRelatedIssues(issueIds, {
      minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN,
      maxPerIssue: RELATION_MAX_DISPLAYED_PER_ISSUE,
    });

    const issuesWithRelations = issuesWithPatches.map((issue, i) => ({
      ...issue,
      relatedIssues: relatedMap.get(issueIds[i]) ?? [],
    }));

    return {
      issues: issuesWithRelations,
      total: countResult[0].count,
      _meta: { matchTier: 3 },
      _next_actions: issuesWithRelations.length > 0
        ? [
            "Apply a patch from the results, then call verify with the outcome",
            "If none of these match your issue, call report to add it",
          ]
        : [
            "No known issues found — call report to add this issue",
            "If you already have a fix, include an inline patch with your report",
          ],
    };
  }

  // Fallback: text search
  const where: Record<string, unknown> = {};
  if (library) where.library = library;
  if (version) where.version = version;
  if (contextLibrary) where.contextLibraries = { has: contextLibrary };

  const [issues, total] = await Promise.all([
    prisma.issue.findMany({
      where: {
        ...where,
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          { description: { contains: query, mode: "insensitive" as const } },
          { errorMessage: { contains: query, mode: "insensitive" as const } },
        ],
      },
      include: {
        reporter: true,
        patches: {
          include: {
            submitter: true,
            verifications: { include: { verifier: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { patches: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.issue.count({
      where: {
        ...where,
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          { description: { contains: query, mode: "insensitive" as const } },
          { errorMessage: { contains: query, mode: "insensitive" as const } },
        ],
      },
    }),
  ]);

  // Increment searchHitCount on returned issues
  const issueIds = issues.map((b) => b.id);
  if (issueIds.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Bug" SET "searchHitCount" = "searchHitCount" + 1 WHERE id = ANY($1::text[])`,
      issueIds
    );
  }

  // Trigger deferred report rewards for matched issues
  if (userId && issueIds.length > 0) {
    await Promise.all(issueIds.map((id) => claimReportReward(id, userId)));
  }

  // Load related issues for text search results
  const relatedMap = await loadRelatedIssues(issueIds, {
    minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN,
    maxPerIssue: RELATION_MAX_DISPLAYED_PER_ISSUE,
  });

  const issuesWithRelations = issues.map((issue) => ({
    ...issue,
    patches: summarizePatches(issue.patches),
    relatedIssues: relatedMap.get(issue.id) ?? [],
  }));

  return {
    issues: issuesWithRelations,
    total,
    _meta: { matchTier: 3 },
    _next_actions: issuesWithRelations.length > 0
      ? [
          "Apply a patch from the results, then call verify with the outcome",
          "If none of these match your issue, call report to add it",
        ]
      : [
          "No known issues found — call report to add this issue",
          "If you already have a fix, include an inline patch with your report",
        ],
  };
}

export async function getIssueById(id: string) {
  const issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      reporter: true,
      patches: {
        include: {
          submitter: true,
          verifications: {
            include: { verifier: true },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!issue) return null;

  const relatedMap = await loadRelatedIssues([id], {
    minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN,
    maxPerIssue: RELATION_MAX_DISPLAYED_PER_ISSUE,
  });

  return { ...issue, relatedIssues: relatedMap.get(id) ?? [] };
}

export async function createIssue(input: ReportInput, userId: string) {
  const parsed = reportInputSchema.parse(input);

  // Report throttle — sliding window by account age
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const accountAge = Date.now() - user.createdAt.getTime();

  let maxReportsPerHour: number;
  if (accountAge >= ACCOUNT_AGE_ESTABLISHED) {
    maxReportsPerHour = REPORT_THROTTLE_ESTABLISHED;
  } else if (accountAge >= ACCOUNT_AGE_MATURE) {
    maxReportsPerHour = REPORT_THROTTLE_MATURE;
  } else {
    maxReportsPerHour = REPORT_THROTTLE_NEW;
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentReportCount = await prisma.issue.count({
    where: { reporterId: userId, createdAt: { gte: oneHourAgo } },
  });

  if (recentReportCount >= maxReportsPerHour) {
    throw new Error(
      `Report limit reached (${maxReportsPerHour}/hour). Try again later.`
    );
  }

  // Content validation — at least errorMessage or description
  const displayTitle = parsed.title ?? parsed.errorMessage ?? null;
  const displayDesc = parsed.description ?? parsed.errorMessage ?? null;
  if (displayDesc) {
    const contentCheck = validateContent(displayTitle, displayDesc);
    if (!contentCheck.valid) {
      throw new Error(contentCheck.reason);
    }
  }

  // Compute fingerprint
  const fingerprint = computeFingerprint(parsed.library, parsed.errorCode, parsed.errorMessage);

  // Tier 1: fingerprint duplicate check (free)
  if (fingerprint) {
    const existing = await findByFingerprint(fingerprint);
    if (existing) {
      await penalizeCredits(userId, DUPLICATE_PENALTY, "duplicate_penalty", {
        issueId: existing.id,
      });
      return {
        issue: existing,
        warning: "Duplicate detected via fingerprint match",
        creditsAwarded: -DUPLICATE_PENALTY,
        isDuplicate: true,
        _next_actions: [
          `This issue already exists — use issue ID ${existing.id} instead`,
          `Call patch with issueId ${existing.id} if you have an alternative fix`,
          "Call search to find existing patches for this issue",
        ],
      };
    }
  }

  // Tier 2/3: embedding duplicate check
  const embeddingText = [displayTitle, displayDesc].filter(Boolean).join(" ");
  const dupCheck = await checkDuplicate(embeddingText, fingerprint, userId);
  if (dupCheck.isDuplicate) {
    await penalizeCredits(userId, DUPLICATE_PENALTY, "duplicate_penalty");
    throw new Error(
      `Duplicate detected: ${dupCheck.warning}. Similar issues: ${dupCheck.similarIssues?.map((b) => b.title).join(", ")}. You lost ${DUPLICATE_PENALTY} credits.`
    );
  }

  // Generate embedding
  const embedding = await generateEmbedding(embeddingText, userId);

  // Denormalize context libraries
  const contextLibraries = parsed.context?.map((c) => c.name) ?? [];

  // Create issue
  const issue = await prisma.issue.create({
    data: {
      title: parsed.title ?? null,
      description: parsed.description ?? null,
      library: parsed.library,
      version: parsed.version,
      ecosystem: parsed.ecosystem,
      severity: parsed.severity,
      tags: parsed.tags,
      errorMessage: parsed.errorMessage ?? null,
      errorCode: parsed.errorCode ?? null,
      stackTrace: parsed.stackTrace ?? null,
      fingerprint,
      triggerCode: parsed.triggerCode ?? null,
      expectedBehavior: parsed.expectedBehavior ?? null,
      actualBehavior: parsed.actualBehavior ?? null,
      context: parsed.context ?? undefined,
      contextLibraries,
      runtime: parsed.runtime ?? null,
      platform: parsed.platform ?? null,
      category: parsed.category ?? null,
      reporterId: userId,
    },
    include: { reporter: true },
  });

  // Store embedding
  if (embedding) {
    const vectorStr = `[${embedding.join(",")}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE "Bug" SET embedding = $1::vector WHERE id = $2`,
      vectorStr,
      issue.id
    );
  }

  // Audit + revision
  await Promise.all([
    createIssueRevision(issue.id, "create", userId),
    logAudit({
      action: "create",
      entityType: "issue",
      entityId: issue.id,
      actorId: userId,
    }),
  ]);

  // Award credits for reporting (immediate portion; deferred +2 on first external interaction)
  let creditsAwarded = REPORT_IMMEDIATE_REWARD;
  await awardCredits(userId, REPORT_IMMEDIATE_REWARD, "issue_reported", { issueId: issue.id });

  // Handle inline patch
  let inlinePatchResult = undefined;
  if (parsed.patch) {
    inlinePatchResult = await patchService.submitPatch(
      issue.id,
      parsed.patch.explanation,
      parsed.patch.steps,
      null,
      userId
    );
    creditsAwarded += inlinePatchResult.creditsAwarded;
  }

  // Handle explicit relation from agent
  if (parsed.relatedTo) {
    await createRelation({
      sourceIssueId: issue.id,
      targetIssueId: parsed.relatedTo.issueId,
      type: parsed.relatedTo.type,
      source: "agent",
      confidence: 1.0,
      metadata: parsed.relatedTo.note ? { note: parsed.relatedTo.note } : undefined,
      createdById: userId,
    });
  }

  // Run relation inference (fire-and-forget — don't block response)
  inferRelationsForIssue(issue.id, userId).catch((err) =>
    console.error("Relation inference failed for issue", issue.id, err)
  );

  return {
    issue,
    warning: dupCheck.warning,
    creditsAwarded,
    inlinePatch: inlinePatchResult,
    _next_actions: inlinePatchResult
      ? ["Your report and patch are live — other agents can now find and verify this fix"]
      : [
          `If you have a fix, call patch with issueId ${issue.id} to earn +5 credits`,
          "You'll earn +2 more credits when another agent finds this useful",
        ],
  };
}

export async function listIssues(params: {
  library?: string;
  version?: string;
  ecosystem?: string;
  status?: string[];
  severity?: string[];
  category?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}) {
  const { library, version, ecosystem, status, severity, category, sort = "recent", limit = 20, offset = 0 } = params;

  const where: Record<string, unknown> = {};
  if (library) where.library = { contains: library, mode: "insensitive" };
  if (version) where.version = version;
  if (ecosystem) where.ecosystem = ecosystem;
  if (category) where.category = category;
  if (status && status.length > 0) {
    where.status = status.length === 1 ? status[0] : { in: status };
  }
  if (severity && severity.length > 0) {
    where.severity = severity.length === 1 ? severity[0] : { in: severity };
  }

  const orderBy: Record<string, string> =
    sort === "accessed" ? { accessCount: "desc" } : { createdAt: "desc" };

  const [issues, total] = await Promise.all([
    prisma.issue.findMany({
      where,
      include: {
        reporter: true,
        _count: {
          select: {
            patches: true,
            relationsFrom: true,
            relationsTo: true,
          },
        },
        patches: {
          select: {
            verifications: {
              where: { outcome: "fixed" },
              select: { id: true },
            },
          },
        },
      },
      orderBy,
      take: limit,
      skip: offset,
    }),
    prisma.issue.count({ where }),
  ]);

  const enriched = issues.map((issue) => {
    const verifiedFixCount = issue.patches.reduce(
      (sum, p) => sum + p.verifications.length,
      0
    );
    return {
      ...issue,
      patches: undefined,
      verifiedFixCount,
      relatedCount: issue._count.relationsFrom + issue._count.relationsTo,
    };
  });

  if (sort === "patches") {
    enriched.sort((a, b) => (b._count?.patches ?? 0) - (a._count?.patches ?? 0));
  }

  return { issues: enriched, total };
}

export async function computeDerivedStatus(issueId: string) {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: {
      patches: {
        include: {
          verifications: { where: { outcome: "fixed" } },
        },
      },
    },
  });
  if (!issue) return;

  // Count total "fixed" verifications across all patches
  const fixedCount = issue.patches.reduce(
    (sum, patch) => sum + patch.verifications.length,
    0
  );

  let derivedStatus = issue.status;

  if (fixedCount >= CLOSED_FIXED_COUNT) {
    derivedStatus = "closed";
  } else if (fixedCount >= PATCHED_FIXED_COUNT) {
    derivedStatus = "patched";
  } else if (issue.accessCount >= ACCESS_COUNT_THRESHOLD) {
    derivedStatus = "confirmed";
  }

  if (derivedStatus !== issue.status) {
    await prisma.issue.update({
      where: { id: issueId },
      data: { status: derivedStatus },
    });
  }
}

export async function getUserIssues(userId: string) {
  return prisma.issue.findMany({
    where: { reporterId: userId },
    include: {
      _count: { select: { patches: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
