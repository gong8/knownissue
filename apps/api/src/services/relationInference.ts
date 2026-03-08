import { prisma } from "@knownissue/db";
import type { BugRelationType } from "@knownissue/shared";
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
 * Infer bug relations after a new bug is created.
 * Runs rules 1-4 and creates up to RELATION_MAX_INFERRED_PER_TRIGGER relations.
 */
export async function inferRelationsForBug(
  bugId: string,
  reporterId: string
): Promise<void> {
  const bug = await prisma.bug.findUnique({
    where: { id: bugId },
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
  if (!bug) return;

  let inferredCount = 0;
  const cutoff = windowDate();

  // Helper to check budget
  const hasBudget = () => inferredCount < RELATION_MAX_INFERRED_PER_TRIGGER;

  // Helper to attempt creating a relation and track count
  const tryInfer = async (
    sourceBugId: string,
    targetBugId: string,
    type: BugRelationType,
    confidence: number,
    metadata?: Record<string, unknown>
  ): Promise<boolean> => {
    if (!hasBudget()) return false;
    if (confidence < RELATION_CONFIDENCE_MIN) return false;
    const created = await createRelation({
      sourceBugId,
      targetBugId,
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
  if (hasBudget() && (bug.fingerprint || bug.errorCode)) {
    const conditions: string[] = [
      `"library" = $1`,
      `"version" != $2`,
      `"id" != $3`,
      `"createdAt" >= $4`,
    ];
    const params: unknown[] = [bug.library, bug.version, bug.id, cutoff];
    let paramIndex = 5;

    // Match fingerprint or errorCode
    const matchClauses: string[] = [];
    if (bug.fingerprint) {
      matchClauses.push(`"fingerprint" = $${paramIndex}`);
      params.push(bug.fingerprint);
      paramIndex++;
    }
    if (bug.errorCode) {
      matchClauses.push(`"errorCode" = $${paramIndex}`);
      params.push(bug.errorCode);
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
        bug.fingerprint && candidate.fingerprint === bug.fingerprint
          ? 0.95
          : 0.8;
      // Existing bug (older version) is source, new bug is target
      await tryInfer(candidate.id, bug.id, "version_regression", confidence, {
        rule: "version_regression",
        matchedOn:
          bug.fingerprint && candidate.fingerprint === bug.fingerprint
            ? "fingerprint"
            : "errorCode",
      });
    }
  }

  // --- Rule 2: same_root_cause ---
  // Embedding similarity > threshold, same library, different error
  if (hasBudget()) {
    const similarBugs = await prisma.$queryRawUnsafe<
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
      bug.id,
      bug.library,
      cutoff,
      RELATION_SAME_ROOT_CAUSE_THRESHOLD,
      RELATION_MAX_INFERRED_PER_TRIGGER
    );

    for (const candidate of similarBugs) {
      if (!hasBudget()) break;
      // Only link if error is actually different (otherwise it's a duplicate, not same_root_cause)
      const sameError =
        (bug.errorMessage &&
          candidate.errorMessage &&
          bug.errorMessage === candidate.errorMessage) ||
        (bug.errorCode &&
          candidate.errorCode &&
          bug.errorCode === candidate.errorCode);
      if (sameError) continue;

      await tryInfer(
        candidate.id,
        bug.id,
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
  // New bug's library in existing bug's contextLibraries (same reporter, 24h window)
  // Also reverse: existing bug's library in new bug's contextLibraries
  if (hasBudget()) {
    const twentyFourHoursAgo = new Date(
      bug.createdAt.getTime() - 24 * 60 * 60 * 1000
    );
    const laterCutoff = cutoff > twentyFourHoursAgo ? cutoff : twentyFourHoursAgo;

    // Forward: new bug's library appears in existing bug's contextLibraries
    const forwardCandidates = await prisma.bug.findMany({
      where: {
        id: { not: bug.id },
        reporterId: bug.reporterId,
        createdAt: { gte: laterCutoff },
        contextLibraries: { has: bug.library },
      },
      select: { id: true, library: true },
      take: RELATION_MAX_INFERRED_PER_TRIGGER,
    });

    for (const candidate of forwardCandidates) {
      if (!hasBudget()) break;
      // The bug whose library appears in the other's context is the "cause" (source)
      // New bug's library is in candidate's contextLibraries, so new bug is the cause
      await tryInfer(bug.id, candidate.id, "cascading_dependency", 0.7, {
        rule: "cascading_dependency",
        direction: "forward",
        causeLibrary: bug.library,
      });
    }

    // Reverse: existing bug's library in new bug's contextLibraries
    if (hasBudget() && bug.contextLibraries.length > 0) {
      const reverseCandidates = await prisma.bug.findMany({
        where: {
          id: { not: bug.id },
          reporterId: bug.reporterId,
          createdAt: { gte: laterCutoff },
          library: { in: bug.contextLibraries },
        },
        select: { id: true, library: true },
        take: RELATION_MAX_INFERRED_PER_TRIGGER,
      });

      for (const candidate of reverseCandidates) {
        if (!hasBudget()) break;
        // Candidate's library is in new bug's contextLibraries, so candidate is the cause
        await tryInfer(
          candidate.id,
          bug.id,
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
  if (hasBudget() && bug.contextLibraries.length >= 2) {
    const compatibleCategories = ["compatibility", "behavior"];
    const categoryFilter =
      bug.category && compatibleCategories.includes(bug.category)
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
        bug.id,
        cutoff,
        bug.contextLibraries,
        RELATION_MAX_INFERRED_PER_TRIGGER
      );

      for (const candidate of interactionCandidates) {
        if (!hasBudget()) break;
        await tryInfer(
          candidate.id,
          bug.id,
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
 * Infer bug relations after a patch is submitted.
 * Runs rules 5-6 and creates up to RELATION_MAX_INFERRED_PER_TRIGGER relations.
 */
export async function inferRelationsForPatch(
  patchId: string,
  bugId: string
): Promise<void> {
  const [patch, currentBug] = await Promise.all([
    prisma.patch.findUnique({
      where: { id: patchId },
      select: {
        id: true,
        steps: true,
        bugId: true,
        submitterId: true,
      },
    }),
    prisma.bug.findUnique({
      where: { id: bugId },
      select: { createdAt: true },
    }),
  ]);
  if (!patch || !currentBug) return;

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
    sourceBugId: string,
    targetBugId: string,
    type: BugRelationType,
    confidence: number,
    metadata?: Record<string, unknown>
  ): Promise<boolean> => {
    if (!hasBudget()) return false;
    if (confidence < RELATION_CONFIDENCE_MIN) return false;
    const created = await createRelation({
      sourceBugId,
      targetBugId,
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
          bugId: { not: bugId },
          bug: { createdAt: { gte: cutoff } },
        },
        select: {
          id: true,
          bugId: true,
          steps: true,
          bug: { select: { createdAt: true } },
        },
        take: 50, // limit scan scope
      })
    : [];

  // --- Rule 5: shared_fix ---
  // Patches on different bugs targeting same files/packages
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
      const otherIsOlder = otherPatch.bug.createdAt <= currentBug.createdAt;
      await tryInfer(
        otherIsOlder ? otherPatch.bugId : bugId,
        otherIsOlder ? bugId : otherPatch.bugId,
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
            await tryInfer(
              otherPatch.bugId,
              bugId,
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
