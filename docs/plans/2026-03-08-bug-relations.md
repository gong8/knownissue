# Bug Relations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add relationship tracking between bugs so the system compounds — agents find not just one bug but the cluster around it.

**Architecture:** Join table (`BugRelation`) with typed enum (6 relationship types), dual creation (agent-reported + system-inferred), consumed inline in search/get_patch results. No new MCP tools.

**Tech Stack:** Prisma (schema + migration), TypeScript, pgvector (embedding similarity for inference), Zod (validator updates).

**Design doc:** `docs/plans/2026-03-08-bug-relations-design.md`

---

### Task 1: Prisma Schema — Add BugRelation model and enums

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Step 1: Add enums after existing enums (after line 76)**

```prisma
enum BugRelationType {
  same_root_cause
  version_regression
  cascading_dependency
  interaction_conflict
  shared_fix
  fix_conflict
}

enum RelationSource {
  agent
  system
}
```

**Step 2: Add BugRelation model after BugRevision model (after line 248)**

```prisma
model BugRelation {
  id          String          @id @default(uuid())
  type        BugRelationType
  source      RelationSource
  confidence  Float           @default(1.0)
  metadata    Json?

  sourceBugId String
  sourceBug   Bug    @relation("RelationsFrom", fields: [sourceBugId], references: [id], onDelete: Cascade)

  targetBugId String
  targetBug   Bug    @relation("RelationsTo", fields: [targetBugId], references: [id], onDelete: Cascade)

  createdById String?
  createdBy   User?  @relation(fields: [createdById], references: [id], onDelete: SetNull)

  createdAt   DateTime @default(now())

  @@unique([sourceBugId, targetBugId, type])
  @@index([sourceBugId])
  @@index([targetBugId])
  @@index([type])
}
```

**Step 3: Add relation fields to Bug model (inside Bug model, after `revisions BugRevision[]` on line 143)**

```prisma
  relationsFrom BugRelation[] @relation("RelationsFrom")
  relationsTo   BugRelation[] @relation("RelationsTo")
```

**Step 4: Add relation field to User model (inside User model, after `auditLogs AuditLog[]` on line 93)**

```prisma
  bugRelations BugRelation[]
```

**Step 5: Run migration**

Run: `cd packages/db && pnpm prisma migrate dev --name add-bug-relations`
Expected: Migration creates `BugRelation` table with enums, indexes, and unique constraint.

**Step 6: Regenerate Prisma client**

Run: `pnpm db:generate`
Expected: Prisma client regenerated with BugRelation type.

**Step 7: Commit**

```bash
git add packages/db/prisma/
git commit -m "feat: add BugRelation schema with 6 relationship types"
```

---

### Task 2: Shared package — Add types, validators, and constants

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/validators.ts`
- Modify: `packages/shared/src/constants.ts`

**Step 1: Add types to `packages/shared/src/types.ts` (after line 8, with the other type aliases)**

```typescript
export type BugRelationType = "same_root_cause" | "version_regression" | "cascading_dependency" | "interaction_conflict" | "shared_fix" | "fix_conflict";
export type RelationSource = "agent" | "system";
```

Add BugRelation interface (after Verification interface, after line 146):

```typescript
export interface BugRelation {
  id: string;
  type: BugRelationType;
  source: RelationSource;
  confidence: number;
  metadata: Record<string, unknown> | null;
  sourceBugId: string;
  targetBugId: string;
  createdById: string | null;
  createdAt: Date;
}
```

**Step 2: Add Zod schemas to `packages/shared/src/validators.ts` (after `bugCategorySchema` on line 12)**

```typescript
export const bugRelationTypeSchema = z.enum([
  "same_root_cause",
  "version_regression",
  "cascading_dependency",
  "interaction_conflict",
  "shared_fix",
  "fix_conflict",
]).describe("Type of relationship between two bugs");

export const patchRelationTypeSchema = z.enum(["shared_fix", "fix_conflict"])
  .describe("Relation types available when submitting a patch");
```

**Step 3: Add `relatedTo` field to `reportInputSchema` (before the `.refine()` call, after line 125)**

Add before the closing `})` and before `.refine(`:

```typescript
  relatedTo: z.object({
    bugId: z.uuid(),
    type: bugRelationTypeSchema,
    note: z.string().optional(),
  }).optional()
    .describe("Link this bug to an existing bug. Use when you encountered this bug while working on another."),
```

**Step 4: Add `relatedTo` field to `patchInputSchema` (after `versionConstraint` on line 139)**

```typescript
  relatedTo: z.object({
    bugId: z.uuid(),
    type: patchRelationTypeSchema,
    note: z.string().optional(),
  }).optional()
    .describe("Link this patch's bug to another bug. Use 'shared_fix' if this patch also fixes the other bug, 'fix_conflict' if they can't coexist."),
```

**Step 5: Add inference constants to `packages/shared/src/constants.ts` (at end of file)**

```typescript
// Bug relation inference
export const RELATION_SAME_ROOT_CAUSE_THRESHOLD = 0.85;
export const RELATION_CONFIDENCE_MIN = 0.5;
export const RELATION_DISPLAY_CONFIDENCE_MIN = 0.7;
export const RELATION_MAX_INFERRED_PER_TRIGGER = 5;
export const RELATION_MAX_DISPLAYED_PER_BUG = 3;
export const RELATION_INFERENCE_WINDOW_DAYS = 180;
```

**Step 6: Build shared package to verify**

Run: `pnpm build --filter=@knownissue/shared`
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add packages/shared/
git commit -m "feat: add bug relation types, validators, and constants"
```

---

### Task 3: Relations service — Core CRUD and agent-reported creation

**Files:**
- Create: `apps/api/src/services/relations.ts`

**Step 1: Create the relations service**

```typescript
import { prisma } from "@knownissue/db";
import type { BugRelationType } from "@knownissue/shared";
import { logAudit } from "./audit";

const SYMMETRIC_TYPES: BugRelationType[] = [
  "same_root_cause",
  "interaction_conflict",
  "shared_fix",
  "fix_conflict",
];

/**
 * Create a bug relation. For symmetric types, source is always the older bug.
 * Idempotent — silently skips if the relation already exists.
 */
export async function createRelation(params: {
  sourceBugId: string;
  targetBugId: string;
  type: BugRelationType;
  source: "agent" | "system";
  confidence: number;
  metadata?: Record<string, unknown>;
  createdById?: string;
}): Promise<boolean> {
  let { sourceBugId, targetBugId } = params;

  // For symmetric types, enforce older bug = source
  if (SYMMETRIC_TYPES.includes(params.type)) {
    const [sourceBug, targetBug] = await Promise.all([
      prisma.bug.findUnique({ where: { id: sourceBugId }, select: { createdAt: true } }),
      prisma.bug.findUnique({ where: { id: targetBugId }, select: { createdAt: true } }),
    ]);
    if (!sourceBug || !targetBug) return false;
    if (sourceBug.createdAt > targetBug.createdAt) {
      [sourceBugId, targetBugId] = [targetBugId, sourceBugId];
    }
  }

  // Prevent self-relations
  if (sourceBugId === targetBugId) return false;

  try {
    await prisma.bugRelation.create({
      data: {
        type: params.type,
        source: params.source,
        confidence: params.confidence,
        metadata: params.metadata ?? undefined,
        sourceBugId,
        targetBugId,
        createdById: params.createdById ?? null,
      },
    });

    await logAudit({
      action: "create",
      entityType: "bug",
      entityId: sourceBugId,
      actorId: params.createdById ?? "system",
      metadata: {
        relationType: params.type,
        targetBugId,
        source: params.source,
        confidence: params.confidence,
      },
    });

    return true;
  } catch {
    // Unique constraint violation — relation already exists
    return false;
  }
}

/**
 * Load related bugs for a set of bugIds. Returns a map of bugId -> related bugs.
 * Used by search and get_patch to inline relations in responses.
 */
export async function loadRelatedBugs(
  bugIds: string[],
  options: { minConfidence?: number; maxPerBug?: number } = {}
): Promise<Map<string, Array<{
  bugId: string;
  title: string | null;
  library: string;
  version: string;
  relationType: BugRelationType;
  confidence: number;
  source: "agent" | "system";
  metadata: Record<string, unknown> | null;
}>>> {
  const { minConfidence = 0.7, maxPerBug = 3 } = options;

  if (bugIds.length === 0) return new Map();

  const relations = await prisma.bugRelation.findMany({
    where: {
      AND: [
        { confidence: { gte: minConfidence } },
        {
          OR: [
            { sourceBugId: { in: bugIds } },
            { targetBugId: { in: bugIds } },
          ],
        },
      ],
    },
    include: {
      sourceBug: { select: { id: true, title: true, library: true, version: true } },
      targetBug: { select: { id: true, title: true, library: true, version: true } },
    },
    orderBy: { confidence: "desc" },
  });

  const result = new Map<string, Array<{
    bugId: string;
    title: string | null;
    library: string;
    version: string;
    relationType: BugRelationType;
    confidence: number;
    source: "agent" | "system";
    metadata: Record<string, unknown> | null;
  }>>();

  for (const rel of relations) {
    // For each relation, determine which side is "ours" and which is "related"
    const sides: Array<{ ours: string; related: typeof rel.sourceBug }> = [];

    if (bugIds.includes(rel.sourceBugId)) {
      sides.push({ ours: rel.sourceBugId, related: rel.targetBug });
    }
    if (bugIds.includes(rel.targetBugId)) {
      sides.push({ ours: rel.targetBugId, related: rel.sourceBug });
    }

    for (const { ours, related } of sides) {
      const list = result.get(ours) ?? [];
      if (list.length >= maxPerBug) continue;
      list.push({
        bugId: related.id,
        title: related.title,
        library: related.library,
        version: related.version,
        relationType: rel.type as BugRelationType,
        confidence: rel.confidence,
        source: rel.source as "agent" | "system",
        metadata: rel.metadata as Record<string, unknown> | null,
      });
      result.set(ours, list);
    }
  }

  return result;
}
```

**Step 2: Build to verify**

Run: `pnpm build --filter=api`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add apps/api/src/services/relations.ts
git commit -m "feat: add relations service with CRUD and batch loading"
```

---

### Task 4: Relation inference service

**Files:**
- Create: `apps/api/src/services/relationInference.ts`

**Step 1: Create the inference service**

```typescript
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
 * Run after createBug. Infers relations from the new bug to existing bugs.
 * Uses the embedding that was already generated during bug creation.
 */
export async function inferRelationsForBug(bugId: string, reporterId: string) {
  const bug = await prisma.bug.findUnique({
    where: { id: bugId },
    select: {
      id: true,
      library: true,
      version: true,
      errorMessage: true,
      errorCode: true,
      fingerprint: true,
      contextLibraries: true,
      category: true,
      createdAt: true,
    },
  });
  if (!bug) return;

  let inferredCount = 0;
  const cutoff = windowDate();

  // Rule 1: version_regression — same library + same fingerprint/errorCode + different version
  if (bug.fingerprint || bug.errorCode) {
    const candidates = await prisma.bug.findMany({
      where: {
        id: { not: bugId },
        library: bug.library,
        version: { not: bug.version },
        createdAt: { gte: cutoff },
        OR: [
          ...(bug.fingerprint ? [{ fingerprint: bug.fingerprint }] : []),
          ...(bug.errorCode ? [{ errorCode: bug.errorCode }] : []),
        ],
      },
      select: { id: true, fingerprint: true },
      take: RELATION_MAX_INFERRED_PER_TRIGGER,
    });

    for (const candidate of candidates) {
      if (inferredCount >= RELATION_MAX_INFERRED_PER_TRIGGER) break;
      const confidence = candidate.fingerprint === bug.fingerprint ? 0.95 : 0.8;
      const created = await createRelation({
        sourceBugId: candidate.id, // older version is "source" (predecessor)
        targetBugId: bugId,
        type: "version_regression",
        source: "system",
        confidence,
        metadata: { inferenceMethod: "fingerprint_version_match" },
      });
      if (created) inferredCount++;
    }
  }

  // Rule 2: same_root_cause — embedding similarity > threshold, same library, different error
  // Uses raw SQL since embedding is an Unsupported pgvector column
  if (inferredCount < RELATION_MAX_INFERRED_PER_TRIGGER) {
    const remaining = RELATION_MAX_INFERRED_PER_TRIGGER - inferredCount;
    const candidates = await prisma.$queryRawUnsafe<
      Array<{ id: string; similarity: number; errorMessage: string | null; errorCode: string | null }>
    >(
      `SELECT b.id, b."errorMessage", b."errorCode",
              1 - (b.embedding <=> src.embedding) as similarity
       FROM "Bug" b, "Bug" src
       WHERE src.id = $1
         AND b.id != $1
         AND b.library = $2
         AND b."createdAt" >= $3
         AND b.embedding IS NOT NULL
         AND src.embedding IS NOT NULL
         AND 1 - (b.embedding <=> src.embedding) >= $4
       ORDER BY b.embedding <=> src.embedding
       LIMIT $5`,
      bugId,
      bug.library,
      cutoff,
      RELATION_SAME_ROOT_CAUSE_THRESHOLD,
      remaining
    );

    for (const candidate of candidates) {
      if (inferredCount >= RELATION_MAX_INFERRED_PER_TRIGGER) break;
      // Only link if the error is actually different (otherwise it's a duplicate, not same_root_cause)
      const sameError = candidate.errorMessage === bug.errorMessage && candidate.errorCode === bug.errorCode;
      if (sameError) continue;
      if (candidate.similarity < RELATION_CONFIDENCE_MIN) continue;

      const created = await createRelation({
        sourceBugId: bugId,
        targetBugId: candidate.id,
        type: "same_root_cause",
        source: "system",
        confidence: candidate.similarity,
        metadata: { inferenceMethod: "embedding_similarity", similarity: candidate.similarity },
      });
      if (created) inferredCount++;
    }
  }

  // Rule 3: cascading_dependency — bug's library in another bug's contextLibraries (same reporter, 24h)
  if (inferredCount < RELATION_MAX_INFERRED_PER_TRIGGER) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const candidates = await prisma.bug.findMany({
      where: {
        id: { not: bugId },
        reporterId: reporterId,
        createdAt: { gte: oneDayAgo },
        contextLibraries: { has: bug.library },
      },
      select: { id: true },
      take: RELATION_MAX_INFERRED_PER_TRIGGER - inferredCount,
    });

    for (const candidate of candidates) {
      if (inferredCount >= RELATION_MAX_INFERRED_PER_TRIGGER) break;
      const created = await createRelation({
        sourceBugId: candidate.id,
        targetBugId: bugId,
        type: "cascading_dependency",
        source: "system",
        confidence: 0.7,
        metadata: { inferenceMethod: "context_library_match", reporter: reporterId },
      });
      if (created) inferredCount++;
    }

    // Also check reverse: existing bug's library in new bug's contextLibraries
    if (bug.contextLibraries.length > 0 && inferredCount < RELATION_MAX_INFERRED_PER_TRIGGER) {
      const reverseCandidates = await prisma.bug.findMany({
        where: {
          id: { not: bugId },
          reporterId: reporterId,
          createdAt: { gte: oneDayAgo },
          library: { in: bug.contextLibraries },
        },
        select: { id: true },
        take: RELATION_MAX_INFERRED_PER_TRIGGER - inferredCount,
      });

      for (const candidate of reverseCandidates) {
        if (inferredCount >= RELATION_MAX_INFERRED_PER_TRIGGER) break;
        const created = await createRelation({
          sourceBugId: bugId,
          targetBugId: candidate.id,
          type: "cascading_dependency",
          source: "system",
          confidence: 0.7,
          metadata: { inferenceMethod: "reverse_context_library_match", reporter: reporterId },
        });
        if (created) inferredCount++;
      }
    }
  }

  // Rule 4: interaction_conflict — shares 2+ contextLibraries, compatible categories
  if (inferredCount < RELATION_MAX_INFERRED_PER_TRIGGER && bug.contextLibraries.length >= 2) {
    const compatibleCategories = ["compatibility", "behavior"];
    const isCompatibleCategory = bug.category && compatibleCategories.includes(bug.category);

    if (isCompatibleCategory) {
      // Find bugs that share at least 2 contextLibraries using raw SQL for array overlap
      const candidates = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "Bug"
         WHERE id != $1
           AND "createdAt" >= $2
           AND category IN ('compatibility', 'behavior')
           AND array_length(
             ARRAY(SELECT unnest("contextLibraries") INTERSECT SELECT unnest($3::text[])),
             1
           ) >= 2
         LIMIT $4`,
        bugId,
        cutoff,
        bug.contextLibraries,
        RELATION_MAX_INFERRED_PER_TRIGGER - inferredCount
      );

      for (const candidate of candidates) {
        if (inferredCount >= RELATION_MAX_INFERRED_PER_TRIGGER) break;
        const created = await createRelation({
          sourceBugId: bugId,
          targetBugId: candidate.id,
          type: "interaction_conflict",
          source: "system",
          confidence: 0.6,
          metadata: { inferenceMethod: "shared_context_libraries" },
        });
        if (created) inferredCount++;
      }
    }
  }
}

/**
 * Run after submitPatch. Infers shared_fix and fix_conflict relations.
 */
export async function inferRelationsForPatch(patchId: string, bugId: string) {
  const patch = await prisma.patch.findUnique({
    where: { id: patchId },
    select: { steps: true, bugId: true },
  });
  if (!patch) return;

  const steps = patch.steps as Array<Record<string, unknown>>;
  let inferredCount = 0;
  const cutoff = windowDate();

  // Extract target files and packages from patch steps
  const targetFiles = new Set<string>();
  const targetPackages = new Map<string, string>(); // package -> version

  for (const step of steps) {
    if (step.type === "code_change" && typeof step.filePath === "string") {
      targetFiles.add(step.filePath);
    }
    if (step.type === "version_bump" && typeof step.package === "string") {
      targetPackages.set(step.package, step.to as string);
    }
    if (step.type === "config_change" && typeof step.file === "string") {
      targetFiles.add(step.file);
    }
  }

  // Rule 5: shared_fix — patches on different bugs targeting same files/packages
  if (targetFiles.size > 0 || targetPackages.size > 0) {
    const otherPatches = await prisma.patch.findMany({
      where: {
        id: { not: patchId },
        bugId: { not: bugId },
        bug: { createdAt: { gte: cutoff } },
      },
      select: { id: true, bugId: true, steps: true },
    });

    for (const other of otherPatches) {
      if (inferredCount >= RELATION_MAX_INFERRED_PER_TRIGGER) break;
      const otherSteps = other.steps as Array<Record<string, unknown>>;

      let matchType: "file" | "package" | null = null;

      for (const otherStep of otherSteps) {
        if (otherStep.type === "code_change" && targetFiles.has(otherStep.filePath as string)) {
          matchType = "file";
          break;
        }
        if (otherStep.type === "config_change" && targetFiles.has(otherStep.file as string)) {
          matchType = "file";
          break;
        }
        if (otherStep.type === "version_bump" && targetPackages.has(otherStep.package as string)) {
          const ourVersion = targetPackages.get(otherStep.package as string);
          if (ourVersion === otherStep.to) {
            matchType = "package";
          }
          break;
        }
      }

      if (matchType) {
        const confidence = matchType === "package" ? 0.8 : 0.7;
        const created = await createRelation({
          sourceBugId: bugId,
          targetBugId: other.bugId,
          type: "shared_fix",
          source: "system",
          confidence,
          metadata: { inferenceMethod: `${matchType}_overlap`, patchId, otherPatchId: other.id },
        });
        if (created) inferredCount++;
      }
    }
  }

  // Rule 6: fix_conflict — version_bump to different version of same package
  if (targetPackages.size > 0) {
    const otherPatches = await prisma.patch.findMany({
      where: {
        id: { not: patchId },
        bugId: { not: bugId },
        bug: { createdAt: { gte: cutoff } },
      },
      select: { id: true, bugId: true, steps: true },
    });

    for (const other of otherPatches) {
      if (inferredCount >= RELATION_MAX_INFERRED_PER_TRIGGER) break;
      const otherSteps = other.steps as Array<Record<string, unknown>>;

      for (const otherStep of otherSteps) {
        if (otherStep.type === "version_bump" && targetPackages.has(otherStep.package as string)) {
          const ourVersion = targetPackages.get(otherStep.package as string);
          if (ourVersion !== otherStep.to) {
            const created = await createRelation({
              sourceBugId: bugId,
              targetBugId: other.bugId,
              type: "fix_conflict",
              source: "system",
              confidence: 0.9,
              metadata: {
                inferenceMethod: "version_bump_conflict",
                package: otherStep.package,
                ourVersion,
                theirVersion: otherStep.to,
                patchId,
                otherPatchId: other.id,
              },
            });
            if (created) inferredCount++;
            break;
          }
        }
      }
    }
  }
}
```

**Step 2: Build to verify**

Run: `pnpm build --filter=api`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add apps/api/src/services/relationInference.ts
git commit -m "feat: add relation inference engine with 6 detection rules"
```

---

### Task 5: Wire relations into createBug and submitPatch

**Files:**
- Modify: `apps/api/src/services/bug.ts:211-330` (createBug function)
- Modify: `apps/api/src/services/patch.ts:9-87` (submitPatch function)

**Step 1: Modify `createBug` in `apps/api/src/services/bug.ts`**

Add imports at top of file:

```typescript
import { createRelation } from "./relations";
import { inferRelationsForBug } from "./relationInference";
```

After the inline patch handling block (after line 322, before the `return` statement), add:

```typescript
  // Handle explicit relation from agent
  if (parsed.relatedTo) {
    await createRelation({
      sourceBugId: bug.id,
      targetBugId: parsed.relatedTo.bugId,
      type: parsed.relatedTo.type,
      source: "agent",
      confidence: 1.0,
      metadata: parsed.relatedTo.note ? { note: parsed.relatedTo.note } : undefined,
      createdById: userId,
    });
  }

  // Run relation inference (async, non-blocking — don't await)
  inferRelationsForBug(bug.id, userId).catch((err) =>
    console.error("Relation inference failed for bug", bug.id, err)
  );
```

**Step 2: Modify `submitPatch` in `apps/api/src/services/patch.ts`**

Add imports at top of file:

```typescript
import { createRelation } from "./relations";
import { inferRelationsForPatch } from "./relationInference";
```

The `submitPatch` function currently takes `(bugId, explanation, steps, versionConstraint, userId)`. We need to add a `relatedTo` parameter. Update the function signature on line 9:

```typescript
export async function submitPatch(
  bugId: string,
  explanation: string,
  steps: PatchStep[],
  versionConstraint: string | null | undefined,
  userId: string,
  relatedTo?: { bugId: string; type: "shared_fix" | "fix_conflict"; note?: string }
) {
```

After the audit log + computeDerivedStatus block for the **new patch** path (after line 84, `await claimReportReward(bugId, userId);`), add:

```typescript
  // Handle explicit relation from agent
  if (relatedTo) {
    await createRelation({
      sourceBugId: bugId,
      targetBugId: relatedTo.bugId,
      type: relatedTo.type,
      source: "agent",
      confidence: 1.0,
      metadata: relatedTo.note ? { note: relatedTo.note } : undefined,
      createdById: userId,
    });
  }

  // Run relation inference (async, non-blocking)
  inferRelationsForPatch(patch.id, bugId).catch((err) =>
    console.error("Relation inference failed for patch", patch.id, err)
  );
```

**Step 3: Update MCP server tool handler for `patch` in `apps/api/src/mcp/server.ts:100-110`**

Pass the new `relatedTo` param through:

```typescript
    (params) =>
      toolHandler(async () => {
        return patchService.submitPatch(
          params.bugId,
          params.explanation,
          params.steps,
          params.versionConstraint,
          userId,
          params.relatedTo
        );
      }, userId)
```

**Step 4: Update inline patch call in `createBug` (`apps/api/src/services/bug.ts:314-320`)**

The inline patch call also needs the extra param (undefined in this case):

```typescript
    inlinePatchResult = await patchService.submitPatch(
      bug.id,
      parsed.patch.explanation,
      parsed.patch.steps,
      null,
      userId,
      undefined
    );
```

**Step 5: Build to verify**

Run: `pnpm build --filter=api`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add apps/api/src/services/bug.ts apps/api/src/services/patch.ts apps/api/src/mcp/server.ts
git commit -m "feat: wire relation creation and inference into bug/patch flows"
```

---

### Task 6: Inline related bugs in search and get_patch responses

**Files:**
- Modify: `apps/api/src/services/bug.ts:21-189` (searchBugs function)
- Modify: `apps/api/src/services/patch.ts:103-144` (getPatchForAgent function)

**Step 1: Add import to `apps/api/src/services/bug.ts`**

```typescript
import { loadRelatedBugs } from "./relations";
import { RELATION_DISPLAY_CONFIDENCE_MIN, RELATION_MAX_DISPLAYED_PER_BUG } from "@knownissue/shared";
```

**Step 2: Modify the embedding search path in `searchBugs` (after `bugsWithPatches` is built, before the `return` on line 130)**

Replace the return statement in the embedding search path:

```typescript
    // Load related bugs for all results
    const relatedMap = await loadRelatedBugs(bugIds, {
      minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN,
      maxPerBug: RELATION_MAX_DISPLAYED_PER_BUG,
    });

    const bugsWithRelations = bugsWithPatches.map((bug) => ({
      ...bug,
      relatedBugs: relatedMap.get(bug.id as string) ?? [],
    }));

    return {
      bugs: bugsWithRelations,
      total: countResult[0].count,
      _meta: { matchTier: 3 },
    };
```

**Step 3: Do the same for the text search fallback path (before the return on line 189)**

After incrementing searchHitCount, before the return:

```typescript
  // Load related bugs for text search results
  const relatedMap = await loadRelatedBugs(bugIds, {
    minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN,
    maxPerBug: RELATION_MAX_DISPLAYED_PER_BUG,
  });

  const bugsWithRelations = bugs.map((bug) => ({
    ...bug,
    relatedBugs: relatedMap.get(bug.id) ?? [],
  }));

  return { bugs: bugsWithRelations, total, _meta: { matchTier: 3 } };
```

**Step 4: Add relations to `getPatchForAgent` in `apps/api/src/services/patch.ts`**

Add import:

```typescript
import { loadRelatedBugs } from "./relations";
import { RELATION_DISPLAY_CONFIDENCE_MIN, RELATION_MAX_DISPLAYED_PER_BUG } from "@knownissue/shared";
```

Before the `return patch;` at line 143, load and attach related bugs:

```typescript
  const relatedMap = await loadRelatedBugs([patch.bugId], {
    minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN,
    maxPerBug: RELATION_MAX_DISPLAYED_PER_BUG,
  });

  return {
    ...patch,
    relatedBugs: relatedMap.get(patch.bugId) ?? [],
  };
```

**Step 5: Also add relations to tier 1 and tier 2 search results in `searchBugs`**

For fingerprint match returns (lines 29-34 and lines 43-48), add related bugs loading before the return:

```typescript
    // After finding bug by fingerprint:
    const relatedMap = await loadRelatedBugs([bug.id], {
      minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN,
      maxPerBug: RELATION_MAX_DISPLAYED_PER_BUG,
    });
    return {
      bugs: [{ ...bug, relatedBugs: relatedMap.get(bug.id) ?? [] }],
      total: 1,
      _meta: { matchTier: N, confidence: X },
    };
```

**Step 6: Build to verify**

Run: `pnpm build --filter=api`
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add apps/api/src/services/bug.ts apps/api/src/services/patch.ts
git commit -m "feat: inline related bugs in search and get_patch responses"
```

---

### Task 7: Update MCP tool descriptions

**Files:**
- Modify: `apps/api/src/mcp/server.ts`

**Step 1: Update `report` tool description to mention `relatedTo`**

```typescript
      description:
        "Report a new bug. Requires library + version + at least one of errorMessage or description. " +
        "Provide context (array of {name, version, role}) for multi-library interaction bugs. " +
        "Include runtime and platform for environment-specific issues. " +
        "Awards +3 credits. Optionally include an inline patch (explanation + steps) for +5 bonus credits. " +
        "Duplicate submissions penalize -5 credits. " +
        "Use relatedTo to link this bug to an existing one (e.g. same_root_cause, version_regression, cascading_dependency).",
```

**Step 2: Update `patch` tool description to mention `relatedTo`**

```typescript
      description:
        "Submit a structured fix for a known bug. Provide step-by-step instructions: " +
        "code changes (before/after), version bumps, config changes, or commands. " +
        "Awards +5 credits. The bug's status auto-updates based on verification results. " +
        "Use relatedTo to link to another bug if this fix also applies there (shared_fix) or conflicts (fix_conflict).",
```

**Step 3: Update `search` tool description to mention related bugs in results**

```typescript
      description:
        "Search for known bugs by error message, error code, or natural language query. " +
        "Uses tiered matching: exact error codes (tier 1), normalized error messages (tier 2), " +
        "then semantic similarity (tier 3). Filter by contextLibrary to find bugs involving specific packages. " +
        "Results include patches with verification summaries and related bugs (same root cause, version regressions, etc.). " +
        "Costs 1 credit per search. Returns _meta.credits_remaining.",
```

**Step 4: Build to verify**

Run: `pnpm build --filter=api`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add apps/api/src/mcp/server.ts
git commit -m "feat: update MCP tool descriptions to document bug relations"
```

---

### Task 8: Update CLAUDE.md with bug relations documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add to Data model section (after the existing model descriptions)**

Add a bullet point about BugRelation:

```markdown
- `BugRelation` links two bugs with a typed relationship (`BugRelationType` enum: same_root_cause/version_regression/cascading_dependency/interaction_conflict/shared_fix/fix_conflict). `RelationSource` enum tracks whether the link was agent-reported or system-inferred. Confidence float (1.0 for agent, 0.0-1.0 for system). `@@unique([sourceBugId, targetBugId, type])`.
```

**Step 2: Add to MCP tools section**

Update the search and report/patch tool descriptions to mention relations.

**Step 3: Add a "Bug Relations" section after "Derived status logic"**

```markdown
## Bug Relations

6 relationship types between bugs, created by agents (explicit) or system inference (automatic):

- `same_root_cause` — different symptoms, same underlying fix
- `version_regression` — same bug reappears in newer version
- `cascading_dependency` — fixing/upgrading A causes bug B
- `interaction_conflict` — bug only appears when A + B used together
- `shared_fix` — different bugs solved by same patch approach
- `fix_conflict` — patch for A breaks patch for B

Directionality: source→target. For directional types (cascading_dependency, version_regression), source = cause. For symmetric types, source = older bug.

Inference runs as post-hook on `createBug`/`submitPatch`. Max 5 inferred per trigger, confidence >= 0.5 to store, >= 0.7 to display. Relations shown inline in search/get_patch results (max 3 per bug). No credit cost.
```

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add bug relations to CLAUDE.md"
```
