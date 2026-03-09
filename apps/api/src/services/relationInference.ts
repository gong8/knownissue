import { prisma } from "@knownissue/db";
import type { IssueRelationType } from "@knownissue/shared";
import {
  RELATION_SAME_ROOT_CAUSE_THRESHOLD,
  RELATION_CONFIDENCE_MIN,
  RELATION_MAX_INFERRED_PER_TRIGGER,
  RELATION_INFERENCE_WINDOW_DAYS,
} from "@knownissue/shared";
import { createRelation } from "./relations";

const windowDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - RELATION_INFERENCE_WINDOW_DAYS);
  return d;
};

/**
 * Infer issue relations after a new issue is created.
 * Runs rules 1-4 and creates up to RELATION_MAX_INFERRED_PER_TRIGGER relations.
 */
export async function inferRelationsForIssue(
  issueId: string,
  reporterId: string
): Promise<void> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      library: true,
      version: true,
      fingerprint: true,
      errorCode: true,
      errorMessage: true,
      contextLibraries: true,
      category: true,
      reporterId: true,
      createdAt: true,
    },
  });
  if (!issue) return;

  let inferredCount = 0;
  const cutoff = windowDate();

  // Helper to check budget
  const hasBudget = () => inferredCount < RELATION_MAX_INFERRED_PER_TRIGGER;

  // Helper to attempt creating a relation and track count
  const tryInfer = async (
    sourceIssueId: string,
    targetIssueId: string,
    type: IssueRelationType,
    confidence: number,
    metadata?: Record<string, unknown>
  ): Promise<boolean> => {
    if (!hasBudget()) return false;
    if (confidence < RELATION_CONFIDENCE_MIN) return false;
    const created = await createRelation({
      sourceIssueId,
      targetIssueId,
      type,
      source: "system",
      confidence,
      metadata,
      createdById: reporterId,
    });
    if (created) inferredCount++;
    return created;
  };

  // --- Rule 1: version_regression ---
  // Same library + same fingerprint/errorCode + different version
  if (hasBudget() && (issue.fingerprint || issue.errorCode)) {
    const conditions: string[] = [
      `"library" = $1`,
      `"version" != $2`,
      `"id" != $3`,
      `"createdAt" >= $4`,
    ];
    const params: unknown[] = [issue.library, issue.version, issue.id, cutoff];
    let paramIndex = 5;

    // Match fingerprint or errorCode
    const matchClauses: string[] = [];
    if (issue.fingerprint) {
      matchClauses.push(`"fingerprint" = $${paramIndex}`);
      params.push(issue.fingerprint);
      paramIndex++;
    }
    if (issue.errorCode) {
      matchClauses.push(`"errorCode" = $${paramIndex}`);
      params.push(issue.errorCode);
      paramIndex++;
    }
    conditions.push(`(${matchClauses.join(" OR ")})`);

    const regressionCandidates = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        fingerprint: string | null;
        errorCode: string | null;
      }>
    >(
      `SELECT id, fingerprint, "errorCode"
       FROM "Bug"
       WHERE ${conditions.join(" AND ")}
       ORDER BY "createdAt" DESC
       LIMIT $${paramIndex}`,
      ...params,
      RELATION_MAX_INFERRED_PER_TRIGGER
    );

    for (const candidate of regressionCandidates) {
      if (!hasBudget()) break;
      // Fingerprint match gets higher confidence than errorCode-only
      const confidence =
        issue.fingerprint && candidate.fingerprint === issue.fingerprint
          ? 0.95
          : 0.8;
      // Existing issue (older version) is source, new issue is target
      await tryInfer(candidate.id, issue.id, "version_regression", confidence, {
        rule: "version_regression",
        matchedOn:
          issue.fingerprint && candidate.fingerprint === issue.fingerprint
            ? "fingerprint"
            : "errorCode",
      });
    }
  }

  // --- Rule 2: same_root_cause ---
  // Embedding similarity > threshold, same library, different error
  if (hasBudget()) {
    const similarIssues = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        similarity: number;
        errorMessage: string | null;
        errorCode: string | null;
      }>
    >(
      `SELECT b.id,
              1 - (b.embedding <=> src.embedding) as similarity,
              b."errorMessage",
              b."errorCode"
       FROM "Bug" b, "Bug" src
       WHERE src.id = $1
         AND b.id != $1
         AND b."library" = $2
         AND b."createdAt" >= $3
         AND b.embedding IS NOT NULL
         AND src.embedding IS NOT NULL
         AND 1 - (b.embedding <=> src.embedding) > $4
       ORDER BY b.embedding <=> src.embedding
       LIMIT $5`,
      issue.id,
      issue.library,
      cutoff,
      RELATION_SAME_ROOT_CAUSE_THRESHOLD,
      RELATION_MAX_INFERRED_PER_TRIGGER
    );

    for (const candidate of similarIssues) {
      if (!hasBudget()) break;
      // Only link if error is actually different (otherwise it's a duplicate, not same_root_cause)
      const sameError =
        (issue.errorMessage &&
          candidate.errorMessage &&
          issue.errorMessage === candidate.errorMessage) ||
        (issue.errorCode &&
          candidate.errorCode &&
          issue.errorCode === candidate.errorCode);
      if (sameError) continue;

      await tryInfer(
        candidate.id,
        issue.id,
        "same_root_cause",
        candidate.similarity,
        {
          rule: "same_root_cause",
          similarity: candidate.similarity,
        }
      );
    }
  }

  // --- Rule 3: cascading_dependency ---
  // Directionality: source = cause, target = effect ("fixing/upgrading source causes target")
  // Same reporter, 24h window
  if (hasBudget()) {
    const twentyFourHoursAgo = new Date(
      issue.createdAt.getTime() - 24 * 60 * 60 * 1000
    );
    const laterCutoff = cutoff > twentyFourHoursAgo ? cutoff : twentyFourHoursAgo;

    // Forward: candidates that depend on new issue's library (it appears in their contextLibraries)
    // New issue is the cause (source) -- a break in its library cascades to the candidate (target)
    const forwardCandidates = issue.library
      ? await prisma.issue.findMany({
          where: {
            id: { not: issue.id },
            reporterId: issue.reporterId,
            createdAt: { gte: laterCutoff },
            contextLibraries: { has: issue.library },
          },
          select: { id: true, library: true },
          take: RELATION_MAX_INFERRED_PER_TRIGGER,
        })
      : [];

    for (const candidate of forwardCandidates) {
      if (!hasBudget()) break;
      // source=issue (cause), target=candidate (effect)
      await tryInfer(issue.id, candidate.id, "cascading_dependency", 0.7, {
        rule: "cascading_dependency",
        direction: "forward",
        causeLibrary: issue.library,
      });
    }

    // Reverse: candidates whose library the new issue depends on (appears in new issue's contextLibraries)
    // Candidate is the cause (source) -- a break in its library cascades to the new issue (target)
    if (hasBudget() && issue.contextLibraries.length > 0) {
      const reverseCandidates = await prisma.issue.findMany({
        where: {
          id: { not: issue.id },
          reporterId: issue.reporterId,
          createdAt: { gte: laterCutoff },
          library: { in: issue.contextLibraries },
        },
        select: { id: true, library: true },
        take: RELATION_MAX_INFERRED_PER_TRIGGER,
      });

      for (const candidate of reverseCandidates) {
        if (!hasBudget()) break;
        // source=candidate (cause), target=issue (effect)
        await tryInfer(
          candidate.id,
          issue.id,
          "cascading_dependency",
          0.7,
          {
            rule: "cascading_dependency",
            direction: "reverse",
            causeLibrary: candidate.library,
          }
        );
      }
    }
  }

  // --- Rule 4: interaction_conflict ---
  // Shares 2+ contextLibraries, compatible categories (compatibility/behavior)
  if (hasBudget() && issue.contextLibraries.length >= 2) {
    const compatibleCategories = ["compatibility", "behavior"];
    const categoryFilter =
      issue.category && compatibleCategories.includes(issue.category)
        ? true
        : false;

    if (categoryFilter) {
      const interactionCandidates = await prisma.$queryRawUnsafe<
        Array<{ id: string; overlap: number }>
      >(
        `SELECT id,
                array_length(ARRAY(
                  SELECT unnest("contextLibraries")
                  INTERSECT
                  SELECT unnest($3::text[])
                ), 1) as overlap
         FROM "Bug"
         WHERE id != $1
           AND "createdAt" >= $2
           AND category IN ('compatibility', 'behavior')
           AND array_length(ARRAY(
                 SELECT unnest("contextLibraries")
                 INTERSECT
                 SELECT unnest($3::text[])
               ), 1) >= 2
         ORDER BY "createdAt" DESC
         LIMIT $4`,
        issue.id,
        cutoff,
        issue.contextLibraries,
        RELATION_MAX_INFERRED_PER_TRIGGER
      );

      for (const candidate of interactionCandidates) {
        if (!hasBudget()) break;
        await tryInfer(
          candidate.id,
          issue.id,
          "interaction_conflict",
          0.6,
          {
            rule: "interaction_conflict",
            sharedLibraryCount: candidate.overlap,
          }
        );
      }
    }
  }
}

/**
 * Infer issue relations after a patch is submitted.
 * Runs rules 5-6 and creates up to RELATION_MAX_INFERRED_PER_TRIGGER relations.
 */
export async function inferRelationsForPatch(
  patchId: string,
  issueId: string
): Promise<void> {
  const [patch, currentIssue] = await Promise.all([
    prisma.patch.findUnique({
      where: { id: patchId },
      select: {
        id: true,
        steps: true,
        issueId: true,
        submitterId: true,
      },
    }),
    prisma.issue.findUnique({
      where: { id: issueId },
      select: { createdAt: true },
    }),
  ]);
  if (!patch || !currentIssue) return;

  const steps = (patch.steps ?? []) as Array<Record<string, unknown>>;

  // Extract identifiers from patch steps
  const filePaths = new Set<string>();
  const packageVersions = new Map<string, string>(); // package -> target version

  for (const step of steps) {
    if (step.type === "code_change" && typeof step.filePath === "string") {
      filePaths.add(step.filePath);
    }
    if (step.type === "config_change" && typeof step.file === "string") {
      filePaths.add(step.file);
    }
    if (
      step.type === "version_bump" &&
      typeof step.package === "string" &&
      typeof step.to === "string"
    ) {
      packageVersions.set(step.package, step.to);
    }
  }

  let inferredCount = 0;
  const cutoff = windowDate();

  const hasBudget = () => inferredCount < RELATION_MAX_INFERRED_PER_TRIGGER;

  const tryInfer = async (
    sourceIssueId: string,
    targetIssueId: string,
    type: IssueRelationType,
    confidence: number,
    metadata?: Record<string, unknown>
  ): Promise<boolean> => {
    if (!hasBudget()) return false;
    if (confidence < RELATION_CONFIDENCE_MIN) return false;
    const created = await createRelation({
      sourceIssueId,
      targetIssueId,
      type,
      source: "system",
      confidence,
      metadata,
      createdById: patch.submitterId,
    });
    if (created) inferredCount++;
    return created;
  };

  // Fetch other patches once for both Rules 5 and 6
  const needsOtherPatches =
    hasBudget() && (filePaths.size > 0 || packageVersions.size > 0);
  const otherPatches = needsOtherPatches
    ? await prisma.patch.findMany({
        where: {
          issueId: { not: issueId },
          issue: { createdAt: { gte: cutoff } },
        },
        select: {
          id: true,
          issueId: true,
          steps: true,
          issue: { select: { createdAt: true } },
        },
        take: 50, // limit scan scope
      })
    : [];

  // --- Rule 5: shared_fix ---
  // Patches on different issues targeting same files/packages
  for (const otherPatch of otherPatches) {
    if (!hasBudget()) break;

    const otherSteps = (otherPatch.steps ?? []) as Array<
      Record<string, unknown>
    >;

    // Check for file path matches
    let matched = false;
    let matchConfidence = 0;
    let matchType = "";

    for (const otherStep of otherSteps) {
      if (matched && matchConfidence >= 0.8) break;

      // File path match (code_change or config_change)
      const otherFile =
        otherStep.type === "code_change"
          ? otherStep.filePath
          : otherStep.type === "config_change"
            ? otherStep.file
            : null;

      if (typeof otherFile === "string" && filePaths.has(otherFile)) {
        matched = true;
        matchConfidence = Math.max(matchConfidence, 0.7);
        matchType = "file";
      }

      // Package + version match (version_bump)
      if (
        otherStep.type === "version_bump" &&
        typeof otherStep.package === "string" &&
        typeof otherStep.to === "string"
      ) {
        const ourVersion = packageVersions.get(otherStep.package);
        if (ourVersion && ourVersion === otherStep.to) {
          matched = true;
          matchConfidence = Math.max(matchConfidence, 0.8);
          matchType = "package+version";
        }
      }
    }

    if (matched) {
      const otherIsOlder = otherPatch.issue.createdAt <= currentIssue.createdAt;
      await tryInfer(
        otherIsOlder ? otherPatch.issueId : issueId,
        otherIsOlder ? issueId : otherPatch.issueId,
        "shared_fix",
        matchConfidence,
        {
          rule: "shared_fix",
          matchType,
          patchId: otherPatch.id,
        }
      );
    }
  }

  // --- Rule 6: fix_conflict ---
  // version_bump to different version of same package
  if (packageVersions.size > 0) {
    for (const otherPatch of otherPatches) {
      if (!hasBudget()) break;

      const otherSteps = (otherPatch.steps ?? []) as Array<
        Record<string, unknown>
      >;

      for (const otherStep of otherSteps) {
        if (!hasBudget()) break;

        if (
          otherStep.type === "version_bump" &&
          typeof otherStep.package === "string" &&
          typeof otherStep.to === "string"
        ) {
          const ourVersion = packageVersions.get(otherStep.package);
          // Same package, different target version = conflict
          if (ourVersion && ourVersion !== otherStep.to) {
            const otherIsOlder = otherPatch.issue.createdAt <= currentIssue.createdAt;
            await tryInfer(
              otherIsOlder ? otherPatch.issueId : issueId,
              otherIsOlder ? issueId : otherPatch.issueId,
              "fix_conflict",
              0.9,
              {
                rule: "fix_conflict",
                package: otherStep.package,
                thisVersion: ourVersion,
                otherVersion: otherStep.to,
                conflictingPatchId: otherPatch.id,
              }
            );
            break; // one conflict per other patch is enough
          }
        }
      }
    }
  }
}
