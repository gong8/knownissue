import { prisma } from "@knownissue/db";
import type { BugUpdate, ReportInput, SearchInput } from "@knownissue/shared";
import type { Role } from "@knownissue/shared";
import {
  reportInputSchema,
  bugUpdateSchema,
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
import { createBugRevision } from "./revision";
import { awardCredits, penalizeCredits } from "./credits";
import * as patchService from "./patch";
import { claimReportReward } from "./reward";

export async function searchBugs(params: SearchInput & { limit?: number; offset?: number }, userId?: string) {
  const { query, library, version, errorCode, contextLibrary, limit = 10, offset = 0 } = params;

  // Tier 1: fingerprint match via errorCode
  if (errorCode && library) {
    const fingerprint = computeFingerprint(library, errorCode);
    if (fingerprint) {
      const bug = await findByFingerprint(fingerprint);
      if (bug) {
        return {
          bugs: [bug],
          total: 1,
          _meta: { matchTier: 1, confidence: 1.0 },
        };
      }
    }
  }

  // Tier 2: fingerprint match via normalized errorMessage in query
  if (library) {
    const fingerprint = computeFingerprint(library, null, query);
    if (fingerprint) {
      const bug = await findByFingerprint(fingerprint);
      if (bug) {
        return {
          bugs: [bug],
          total: 1,
          _meta: { matchTier: 2, confidence: 0.95 },
        };
      }
    }
  }

  // Tier 3: embedding/semantic search
  const embedding = await generateEmbedding(query);

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

    const [bugs, countResult] = await Promise.all([
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

    // Increment searchHitCount on returned bugs
    const bugIds = bugs.map((b) => b.id as string);
    if (bugIds.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Bug" SET "searchHitCount" = "searchHitCount" + 1 WHERE id = ANY($1::text[])`,
        bugIds
      );
    }

    // Trigger deferred report rewards for matched bugs
    if (userId && bugIds.length > 0) {
      await Promise.all(bugIds.map((id) => claimReportReward(id, userId)));
    }

    // Load patches for each bug
    const patchesByBug = bugIds.length > 0
      ? await prisma.patch.findMany({
          where: { bugId: { in: bugIds } },
          include: {
            submitter: true,
            verifications: { include: { verifier: true } },
          },
          orderBy: { score: "desc" },
        })
      : [];

    const bugsWithPatches = bugs.map((bug) => ({
      ...bug,
      patches: patchesByBug.filter((p) => p.bugId === bug.id),
    }));

    return {
      bugs: bugsWithPatches,
      total: countResult[0].count,
      _meta: { matchTier: 3 },
    };
  }

  // Fallback: text search
  const where: Record<string, unknown> = {};
  if (library) where.library = library;
  if (version) where.version = version;
  if (contextLibrary) where.contextLibraries = { has: contextLibrary };

  const [bugs, total] = await Promise.all([
    prisma.bug.findMany({
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
          orderBy: { score: "desc" },
        },
        _count: { select: { patches: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.bug.count({
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

  // Increment searchHitCount on returned bugs
  const bugIds = bugs.map((b) => b.id);
  if (bugIds.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Bug" SET "searchHitCount" = "searchHitCount" + 1 WHERE id = ANY($1::text[])`,
      bugIds
    );
  }

  // Trigger deferred report rewards for matched bugs
  if (userId && bugIds.length > 0) {
    await Promise.all(bugIds.map((id) => claimReportReward(id, userId)));
  }

  return { bugs, total, _meta: { matchTier: 3 } };
}

export async function getBugById(id: string) {
  return prisma.bug.findUnique({
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
        orderBy: { score: "desc" },
      },
    },
  });
}

export async function createBug(input: ReportInput, userId: string) {
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
  const recentReportCount = await prisma.bug.count({
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
        bugId: existing.id,
      });
      return {
        bug: existing,
        warning: "Duplicate detected via fingerprint match",
        creditsAwarded: -DUPLICATE_PENALTY,
        isDuplicate: true,
      };
    }
  }

  // Tier 2/3: embedding duplicate check
  const embeddingText = [displayTitle, displayDesc].filter(Boolean).join(" ");
  const dupCheck = await checkDuplicate(embeddingText, fingerprint);
  if (dupCheck.isDuplicate) {
    await penalizeCredits(userId, DUPLICATE_PENALTY, "duplicate_penalty");
    throw new Error(
      `Duplicate detected: ${dupCheck.warning}. Similar bugs: ${dupCheck.similarBugs?.map((b) => b.title).join(", ")}. You lost ${DUPLICATE_PENALTY} credits.`
    );
  }

  // Generate embedding
  const embedding = await generateEmbedding(embeddingText);

  // Denormalize context libraries
  const contextLibraries = parsed.context?.map((c) => c.name) ?? [];

  // Create bug
  const bug = await prisma.bug.create({
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
      bug.id
    );
  }

  // Audit + revision
  await Promise.all([
    createBugRevision(bug.id, "create", userId),
    logAudit({
      action: "create",
      entityType: "bug",
      entityId: bug.id,
      actorId: userId,
    }),
  ]);

  // Award credits for reporting (immediate portion; deferred +2 on first external interaction)
  let creditsAwarded = REPORT_IMMEDIATE_REWARD;
  await awardCredits(userId, REPORT_IMMEDIATE_REWARD, "bug_reported", { bugId: bug.id });

  // Handle inline patch
  let inlinePatchResult = undefined;
  if (parsed.patch) {
    inlinePatchResult = await patchService.submitPatch(
      bug.id,
      parsed.patch.explanation,
      parsed.patch.steps,
      null,
      userId
    );
    creditsAwarded += inlinePatchResult.creditsAwarded;
  }

  return {
    bug,
    warning: dupCheck.warning,
    creditsAwarded,
    inlinePatch: inlinePatchResult,
  };
}

export async function listBugs(params: {
  library?: string;
  version?: string;
  ecosystem?: string;
  status?: string[];
  severity?: string[];
  limit?: number;
  offset?: number;
}) {
  const { library, version, ecosystem, status, severity, limit = 20, offset = 0 } = params;

  const where: Record<string, unknown> = {};
  if (library) where.library = library;
  if (version) where.version = version;
  if (ecosystem) where.ecosystem = ecosystem;
  if (status && status.length > 0) {
    where.status = status.length === 1 ? status[0] : { in: status };
  }
  if (severity && severity.length > 0) {
    where.severity = severity.length === 1 ? severity[0] : { in: severity };
  }

  const [bugs, total] = await Promise.all([
    prisma.bug.findMany({
      where,
      include: {
        reporter: true,
        _count: { select: { patches: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.bug.count({ where }),
  ]);

  return { bugs, total };
}

export async function updateBug(id: string, input: BugUpdate, userId: string, userRole?: Role) {
  const parsed = bugUpdateSchema.parse(input);

  const bug = await prisma.bug.findUnique({ where: { id } });
  if (!bug) throw new Error("Bug not found");
  if (bug.reporterId !== userId && userRole !== "admin") {
    throw new Error("Only the reporter can edit this bug");
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) {
      const oldValue = bug[key as keyof typeof bug];
      if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
        changes[key] = { from: oldValue, to: value };
      }
    }
  }

  const updated = await prisma.bug.update({
    where: { id },
    data: parsed,
    include: { reporter: true },
  });

  await Promise.all([
    createBugRevision(id, "update", userId),
    logAudit({
      action: "update",
      entityType: "bug",
      entityId: id,
      actorId: userId,
      changes: Object.keys(changes).length > 0 ? changes : undefined,
    }),
  ]);

  return updated;
}

export async function deleteBug(id: string, userId: string, userRole?: Role) {
  const bug = await prisma.bug.findUnique({ where: { id } });
  if (!bug) throw new Error("Bug not found");
  if (bug.reporterId !== userId && userRole !== "admin") {
    throw new Error("Only the reporter can delete this bug");
  }

  await logAudit({
    action: "delete",
    entityType: "bug",
    entityId: id,
    actorId: userId,
    changes: {
      title: { from: bug.title, to: null },
      description: { from: bug.description, to: null },
      severity: { from: bug.severity, to: null },
      status: { from: bug.status, to: null },
    },
  });

  await prisma.bug.delete({ where: { id } });
}

export async function computeDerivedStatus(bugId: string) {
  const bug = await prisma.bug.findUnique({
    where: { id: bugId },
    include: {
      patches: {
        include: {
          verifications: { where: { outcome: "fixed" } },
        },
      },
    },
  });
  if (!bug) return;

  // Count total "fixed" verifications across all patches
  const fixedCount = bug.patches.reduce(
    (sum, patch) => sum + patch.verifications.length,
    0
  );

  let derivedStatus = bug.status;

  if (fixedCount >= CLOSED_FIXED_COUNT) {
    derivedStatus = "closed";
  } else if (fixedCount >= PATCHED_FIXED_COUNT) {
    derivedStatus = "patched";
  } else if (bug.accessCount >= ACCESS_COUNT_THRESHOLD) {
    derivedStatus = "confirmed";
  }

  if (derivedStatus !== bug.status) {
    await prisma.bug.update({
      where: { id: bugId },
      data: { status: derivedStatus },
    });
  }
}

export async function getUserBugs(userId: string) {
  return prisma.bug.findMany({
    where: { reporterId: userId },
    include: {
      _count: { select: { patches: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
