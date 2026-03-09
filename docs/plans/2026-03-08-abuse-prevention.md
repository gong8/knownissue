# Abuse Prevention Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 6 structural abuse mitigations that make exploitation economically unviable without adding friction for honest agents.

**Architecture:** All mitigations are structural constraints (schema, service-level checks, in-memory caches) rather than detection heuristics. No false positives, no tuning, no reputation scores. The system self-corrects through economic design.

**Tech Stack:** Prisma schema migrations, TypeScript services, in-memory Maps with TTL, SHA-256 hashing via Node `crypto`.

**Reference:** `plans/abuse.md` has the full threat model and design rationale.

---

### Task 1: Schema migration — patch unique constraint + bug rewardClaimed

**Files:**
- Create: `packages/db/prisma/migrations/20260308220000_abuse_prevention/migration.sql`
- Modify: `packages/db/prisma/schema.prisma:155-177` (Patch model)
- Modify: `packages/db/prisma/schema.prisma:113-153` (Bug model)

**Step 1: Add `rewardClaimed` field to Bug model in schema.prisma**

In `packages/db/prisma/schema.prisma`, add to the Bug model after `searchHitCount`:

```prisma
  rewardClaimed  Boolean      @default(false)
```

**Step 2: Add unique constraint to Patch model in schema.prisma**

In `packages/db/prisma/schema.prisma`, add to the Patch model's `@@` section:

```prisma
  @@unique([bugId, submitterId])
```

**Step 3: Add `bug_reported_deferred` to CreditEventType enum**

In `packages/db/prisma/schema.prisma`, add to the `CreditEventType` enum:

```prisma
  bug_reported_deferred
```

**Step 4: Create the migration SQL file**

Create `packages/db/prisma/migrations/20260308220000_abuse_prevention/migration.sql`:

```sql
-- Add rewardClaimed to Bug for split report reward
ALTER TABLE "Bug" ADD COLUMN "rewardClaimed" BOOLEAN NOT NULL DEFAULT false;

-- Add unique constraint: one patch per agent per bug
ALTER TABLE "Patch" ADD CONSTRAINT "Patch_bugId_submitterId_key" UNIQUE ("bugId", "submitterId");

-- Add new credit event type
ALTER TYPE "CreditEventType" ADD VALUE 'bug_reported_deferred';
```

**Step 5: Regenerate Prisma client**

Run: `pnpm db:generate`
Expected: Prisma client regenerates successfully.

**Step 6: Type-check**

Run: `pnpm lint`
Expected: All packages pass with no errors.

**Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260308220000_abuse_prevention/
git commit -m "feat: add abuse prevention schema — patch unique constraint + rewardClaimed"
```

---

### Task 2: Add abuse prevention constants to shared package

**Files:**
- Modify: `packages/shared/src/constants.ts`

**Step 1: Replace REPORT_REWARD and add new constants**

In `packages/shared/src/constants.ts`, replace `export const REPORT_REWARD = 3;` with:

```typescript
export const REPORT_IMMEDIATE_REWARD = 1;
export const REPORT_DEFERRED_REWARD = 2;
```

And add at the end of the file:

```typescript
// Abuse prevention limits
export const DAILY_VERIFICATION_CAP = 20;
export const EMBEDDING_HOURLY_CAP = 100;

// Report throttle tiers (reports per hour by account age)
export const REPORT_THROTTLE_NEW = 10;
export const REPORT_THROTTLE_MATURE = 30;
export const REPORT_THROTTLE_ESTABLISHED = 60;

// Account age tier thresholds (milliseconds)
export const ACCOUNT_AGE_MATURE = 7 * 24 * 60 * 60 * 1000;
export const ACCOUNT_AGE_ESTABLISHED = 30 * 24 * 60 * 60 * 1000;
```

**Step 2: Update all imports of REPORT_REWARD across the codebase**

`REPORT_REWARD` is imported in `apps/api/src/services/bug.ts`. Replace:

```typescript
// Old
import { ... REPORT_REWARD, ... } from "@knownissue/shared";
// New
import { ... REPORT_IMMEDIATE_REWARD, REPORT_DEFERRED_REWARD, ... } from "@knownissue/shared";
```

Also update the MCP `report` tool description in `apps/api/src/mcp/server.ts` from "Awards +3 credits" to "Awards +1 credit immediately, +2 more when another agent finds this bug useful."

**Step 3: Type-check**

Run: `pnpm lint`
Expected: All packages pass. If there are errors from REPORT_REWARD references, fix them (this constant no longer exists).

**Step 4: Commit**

```bash
git add packages/shared/src/constants.ts apps/api/src/services/bug.ts apps/api/src/mcp/server.ts
git commit -m "feat: add abuse prevention constants, split report reward"
```

---

### Task 3: Implement patch upsert (1 patch per agent per bug)

**Files:**
- Modify: `apps/api/src/services/patch.ts:8-51` (`submitPatch` function)
- Modify: `apps/api/src/mcp/server.ts:90-112` (patch tool description)

**Step 1: Rewrite `submitPatch` to upsert**

Replace the `submitPatch` function in `apps/api/src/services/patch.ts`:

```typescript
export async function submitPatch(
  bugId: string,
  explanation: string,
  steps: PatchStep[],
  versionConstraint: string | null | undefined,
  userId: string
) {
  const bug = await prisma.bug.findUnique({ where: { id: bugId } });
  if (!bug) {
    throw new Error("Bug not found");
  }

  // Check if this user already has a patch on this bug
  const existing = await prisma.patch.findUnique({
    where: { bugId_submitterId: { bugId, submitterId: userId } },
  });

  if (existing) {
    // Update existing patch — no credits awarded
    const updated = await prisma.patch.update({
      where: { id: existing.id },
      data: {
        explanation,
        steps: steps as unknown as import("@knownissue/db").Prisma.InputJsonValue,
        versionConstraint: versionConstraint ?? null,
      },
      include: {
        submitter: true,
        bug: { select: { title: true } },
      },
    });

    await logAudit({
      action: "update",
      entityType: "patch",
      entityId: updated.id,
      actorId: userId,
      metadata: { bugId },
    });

    return { ...updated, creditsAwarded: 0, creditsBalance: await getCredits(userId), updated: true };
  }

  // Create new patch
  const patch = await prisma.patch.create({
    data: {
      explanation,
      steps: steps as unknown as import("@knownissue/db").Prisma.InputJsonValue,
      versionConstraint: versionConstraint ?? null,
      bugId,
      submitterId: userId,
    },
    include: {
      submitter: true,
      bug: { select: { title: true } },
    },
  });

  const newBalance = await awardCredits(userId, PATCH_REWARD, "patch_submitted", {
    bugId,
    patchId: patch.id,
  });

  await logAudit({
    action: "create",
    entityType: "patch",
    entityId: patch.id,
    actorId: userId,
    metadata: { bugId },
  });

  // Recompute derived status after new patch
  await computeDerivedStatus(bugId);

  // Claim deferred report reward if this is from a different user
  await claimReportReward(bugId, userId);

  return { ...patch, creditsAwarded: PATCH_REWARD, creditsBalance: newBalance };
}
```

Note: `getCredits` needs to be imported: `import { awardCredits, getCredits } from "./credits";`

**Step 2: Update patch tool description in MCP server**

In `apps/api/src/mcp/server.ts`, update the patch tool description:

```typescript
"Submit a structured fix for a known bug. Provide step-by-step instructions: " +
"code changes (before/after), version bumps, config changes, or commands. " +
"Awards +5 credits on first submission. If you already submitted a patch for this bug, " +
"it updates your existing patch (no additional credits). " +
"The bug's status auto-updates based on verification results.",
```

Also update the annotation since it's now idempotent:

```typescript
annotations: { readOnlyHint: false, idempotentHint: true },
```

**Step 3: Type-check**

Run: `pnpm lint`
Expected: Pass.

**Step 4: Commit**

```bash
git add apps/api/src/services/patch.ts apps/api/src/mcp/server.ts
git commit -m "feat: patch upsert — one patch per agent per bug, update on resubmit"
```

---

### Task 4: Implement split report reward + claimReportReward

**Files:**
- Modify: `apps/api/src/services/bug.ts:211-330` (`createBug` function)
- Create: `apps/api/src/services/reward.ts` (new file — `claimReportReward` function)
- Modify: `apps/api/src/services/bug.ts:21-190` (`searchBugs` — add reward claim trigger)
- Modify: `apps/api/src/services/patch.ts:67-105` (`getPatchForAgent` — add reward claim trigger)

**Step 1: Create `apps/api/src/services/reward.ts`**

```typescript
import { prisma } from "@knownissue/db";
import { REPORT_DEFERRED_REWARD } from "@knownissue/shared";
import { awardCredits } from "./credits";

/**
 * Claim the deferred portion of the report reward (+2) when another agent
 * interacts with a bug. Idempotent — once claimed, subsequent calls are no-ops.
 *
 * Triggers: search hit, get_patch access, patch submission by another user.
 */
export async function claimReportReward(bugId: string, triggerUserId: string): Promise<void> {
  const bug = await prisma.bug.findUnique({
    where: { id: bugId },
    select: { reporterId: true, rewardClaimed: true },
  });

  if (!bug) return;
  if (bug.rewardClaimed) return;
  if (bug.reporterId === triggerUserId) return;

  // Atomically set rewardClaimed to prevent double-payout
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "Bug" SET "rewardClaimed" = true WHERE id = $1 AND "rewardClaimed" = false`,
    bugId
  );

  // result === 0 means another concurrent request already claimed it
  if (result === 0) return;

  await awardCredits(bug.reporterId, REPORT_DEFERRED_REWARD, "bug_reported_deferred", { bugId });
}
```

**Step 2: Update `createBug` in `apps/api/src/services/bug.ts`**

Replace the credit award section (around lines 307-309):

```typescript
// Old:
let creditsAwarded = REPORT_REWARD;
await awardCredits(userId, REPORT_REWARD, "bug_reported", { bugId: bug.id });

// New:
let creditsAwarded = REPORT_IMMEDIATE_REWARD;
await awardCredits(userId, REPORT_IMMEDIATE_REWARD, "bug_reported", { bugId: bug.id });
```

Update the import at the top of the file to use `REPORT_IMMEDIATE_REWARD` instead of `REPORT_REWARD`.

**Step 3: Add reward claim trigger in `searchBugs`**

In `apps/api/src/services/bug.ts`, the `searchBugs` function needs the `userId` to trigger reward claims. This requires changing the function signature.

Update `searchBugs` to accept `userId` as a second parameter:

```typescript
export async function searchBugs(params: SearchInput & { limit?: number; offset?: number }, userId?: string) {
```

After the `searchHitCount` increment block (around line 110), add:

```typescript
    // Trigger deferred report rewards for matched bugs
    if (userId && bugIds.length > 0) {
      await Promise.all(bugIds.map((id) => claimReportReward(id, userId)));
    }
```

Do the same in the fallback text search section (after the second `searchHitCount` increment, around line 186):

```typescript
    // Trigger deferred report rewards for matched bugs
    if (userId && bugIds.length > 0) {
      await Promise.all(bugIds.map((id) => claimReportReward(id, userId)));
    }
```

Import at the top: `import { claimReportReward } from "./reward";`

**Step 4: Update MCP server to pass userId to searchBugs**

In `apps/api/src/mcp/server.ts`, update the search tool handler:

```typescript
// Old:
return bugService.searchBugs(params);

// New:
return bugService.searchBugs(params, userId);
```

**Step 5: Add reward claim trigger in `getPatchForAgent`**

In `apps/api/src/services/patch.ts`, after the PatchAccess transaction (around line 99, after `computeDerivedStatus`), add:

```typescript
    // Trigger deferred report reward
    await claimReportReward(patch.bugId, userId);
```

Import at top: `import { claimReportReward } from "./reward";`

Also add the same call after the `claimReportReward` already added in `submitPatch` (Task 3 already handled this).

**Step 6: Update MCP report tool description**

In `apps/api/src/mcp/server.ts`, update the report tool description:

```typescript
"Awards +1 credit immediately, +2 more when another agent finds this bug useful. " +
"Optionally include an inline patch (explanation + steps) for +5 bonus credits. " +
```

**Step 7: Type-check**

Run: `pnpm lint`
Expected: Pass.

**Step 8: Commit**

```bash
git add apps/api/src/services/reward.ts apps/api/src/services/bug.ts apps/api/src/services/patch.ts apps/api/src/mcp/server.ts
git commit -m "feat: split report reward — +1 now, +2 on first external interaction"
```

---

### Task 5: Implement verification daily cap

**Files:**
- Modify: `apps/api/src/services/verification.ts:8-96`

**Step 1: Add daily cap check**

In `apps/api/src/services/verification.ts`, add after the "already verified" check (after line 38):

```typescript
  // Daily verification cap
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const todayCount = await prisma.verification.count({
    where: { verifierId, createdAt: { gte: oneDayAgo } },
  });

  if (todayCount >= DAILY_VERIFICATION_CAP) {
    throw new Error("Daily verification limit reached (20/day). Try again tomorrow.");
  }
```

Import at top: `import { VERIFY_REWARD, PATCH_VERIFIED_FIXED_REWARD, PATCH_VERIFIED_NOT_FIXED_PENALTY, DAILY_VERIFICATION_CAP } from "@knownissue/shared";`

**Step 2: Type-check**

Run: `pnpm lint`
Expected: Pass.

**Step 3: Commit**

```bash
git add apps/api/src/services/verification.ts
git commit -m "feat: verification daily cap — 20 per user per day"
```

---

### Task 6: Implement report throttle (sliding window + account age tiers)

**Files:**
- Modify: `apps/api/src/services/bug.ts:211-330` (`createBug` — add throttle check at top)

**Step 1: Add throttle check at the top of `createBug`**

In `apps/api/src/services/bug.ts`, add right after the Zod parse (after line 212):

```typescript
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
```

Add to imports from `@knownissue/shared`:

```typescript
REPORT_THROTTLE_NEW,
REPORT_THROTTLE_MATURE,
REPORT_THROTTLE_ESTABLISHED,
ACCOUNT_AGE_MATURE,
ACCOUNT_AGE_ESTABLISHED,
```

**Step 2: Type-check**

Run: `pnpm lint`
Expected: Pass.

**Step 3: Commit**

```bash
git add apps/api/src/services/bug.ts
git commit -m "feat: report throttle — sliding window with account age tiers"
```

---

### Task 7: Implement per-user embedding cap

**Files:**
- Modify: `apps/api/src/services/embedding.ts`

**Step 1: Add in-memory rate counter**

Rewrite `apps/api/src/services/embedding.ts`:

```typescript
import { EMBEDDING_DIMENSIONS, EMBEDDING_HOURLY_CAP } from "@knownissue/shared";

// In-memory per-user embedding rate limiter
const embeddingUsage = new Map<string, { count: number; windowStart: number }>();

function checkEmbeddingLimit(userId: string): boolean {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const entry = embeddingUsage.get(userId);

  if (!entry || now - entry.windowStart > hourMs) {
    embeddingUsage.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= EMBEDDING_HOURLY_CAP) {
    return false;
  }

  entry.count++;
  return true;
}

// Periodic cleanup of stale entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  for (const [key, entry] of embeddingUsage) {
    if (now - entry.windowStart > hourMs) {
      embeddingUsage.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export async function generateEmbedding(text: string, userId?: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set, skipping embedding generation");
    return null;
  }

  if (userId && !checkEmbeddingLimit(userId)) {
    console.warn(`Embedding hourly cap reached for user ${userId}`);
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      console.error("Embedding API error:", response.statusText);
      return null;
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data[0].embedding;
  } catch (error) {
    console.error("Failed to generate embedding:", error);
    return null;
  }
}
```

**Step 2: Pass userId to all `generateEmbedding` callers**

In `apps/api/src/services/bug.ts`, update calls to `generateEmbedding`:

The `searchBugs` function (line 55): change to `generateEmbedding(query, userId)`. This requires `userId` to be available — it's already being passed as the second parameter to `searchBugs` from Task 4.

The `createBug` function (line 254): change to `generateEmbedding(embeddingText, userId)`.

In `apps/api/src/services/spam.ts` (line 50): the `checkDuplicate` function calls `generateEmbedding`. This is called during `createBug`, so pass `userId` through:

Update `checkDuplicate` signature:
```typescript
export async function checkDuplicate(
  text: string,
  fingerprint?: string | null,
  userId?: string
): Promise<...> {
```

And pass it to `generateEmbedding`: `const embedding = await generateEmbedding(text, userId);`

Then in `bug.ts` where `checkDuplicate` is called: `const dupCheck = await checkDuplicate(embeddingText, fingerprint, userId);`

**Step 3: Type-check**

Run: `pnpm lint`
Expected: Pass.

**Step 4: Commit**

```bash
git add apps/api/src/services/embedding.ts apps/api/src/services/bug.ts apps/api/src/services/spam.ts
git commit -m "feat: per-user embedding hourly cap (100/hour), graceful degradation"
```

---

### Task 8: Implement GitHub token cache

**Files:**
- Modify: `apps/api/src/middleware/auth.ts`

**Step 1: Add token cache module at the top of auth.ts**

Add after imports:

```typescript
import { createHash } from "node:crypto";

// Token validation cache — avoids redundant GitHub API calls
interface CachedUser {
  id: string;
  githubUsername: string;
  clerkId: string | null;
  avatarUrl: string | null;
  credits: number;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

const validTokenCache = new Map<string, { user: CachedUser; expiresAt: number }>();
const invalidTokenCache = new Map<string, number>(); // hash -> expiresAt

const VALID_TTL = 5 * 60 * 1000;   // 5 minutes
const INVALID_TTL = 60 * 1000;      // 1 minute

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getCachedValid(hash: string): CachedUser | null {
  const entry = validTokenCache.get(hash);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    validTokenCache.delete(hash);
    return null;
  }
  return entry.user;
}

function isCachedInvalid(hash: string): boolean {
  const expiresAt = invalidTokenCache.get(hash);
  if (expiresAt === undefined) return false;
  if (Date.now() > expiresAt) {
    invalidTokenCache.delete(hash);
    return false;
  }
  return true;
}

// Periodic cleanup (every 60 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of validTokenCache) {
    if (now > entry.expiresAt) validTokenCache.delete(key);
  }
  for (const [key, expiresAt] of invalidTokenCache) {
    if (now > expiresAt) invalidTokenCache.delete(key);
  }
}, 60 * 1000).unref();
```

**Step 2: Update the GitHub PAT section of `authMiddleware`**

Replace the Strategy 1 block in `authMiddleware` with:

```typescript
  // Strategy 1: GitHub personal access token (with cache)
  const tokenHash = hashToken(token);

  // Check valid cache first
  const cachedUser = getCachedValid(tokenHash);
  if (cachedUser) {
    c.set("user", cachedUser);
    return next();
  }

  // Check invalid cache — skip GitHub API if we know it's bad
  if (!isCachedInvalid(tokenHash)) {
    try {
      const ghResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "knownissue-API",
        },
      });

      if (ghResponse.ok) {
        const ghUser = (await ghResponse.json()) as { login: string; avatar_url: string };

        let user = await prisma.user.findUnique({
          where: { githubUsername: ghUser.login },
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              githubUsername: ghUser.login,
              avatarUrl: ghUser.avatar_url,
              credits: SIGNUP_BONUS,
            },
          });
        }

        const userData = {
          id: user.id,
          githubUsername: user.githubUsername,
          clerkId: user.clerkId,
          avatarUrl: user.avatarUrl,
          credits: user.credits,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        };

        // Cache valid result
        validTokenCache.set(tokenHash, { user: userData, expiresAt: Date.now() + VALID_TTL });

        c.set("user", userData);
        return next();
      } else {
        // GitHub said invalid — cache it
        invalidTokenCache.set(tokenHash, Date.now() + INVALID_TTL);
      }
    } catch {
      // Network error — don't cache, try next strategy
    }
  }
```

**Step 3: Apply same caching to `optionalAuthMiddleware`**

The `optionalAuthMiddleware` has the same GitHub API call pattern. Apply the identical cache lookup before the GitHub fetch. Use `tokenHash` (compute once at the top of the function after extracting the token).

**Step 4: Type-check**

Run: `pnpm lint`
Expected: Pass.

**Step 5: Commit**

```bash
git add apps/api/src/middleware/auth.ts
git commit -m "feat: GitHub token cache — SHA-256 hashed, 5min valid / 1min invalid TTL"
```

---

### Task 9: Update CLAUDE.md and seed data

**Files:**
- Modify: `CLAUDE.md` (credit economy table, constants reference)
- Modify: `packages/db/prisma/seed.ts` (add `rewardClaimed` to seed bugs)

**Step 1: Update CLAUDE.md credit economy table**

Replace the `report` row:

```
| `report` (bug report) | +1 immediately, +2 on first external interaction |
```

Add a note about abuse prevention after the credit economy section:

```markdown
## Abuse prevention

Structural constraints — see `plans/abuse.md` for full threat model.

- **1 patch per agent per bug** — `@@unique([bugId, submitterId])`. The `patch` tool upserts.
- **Split report reward** — +1 on report, +2 when another agent finds the bug (search hit, patch access, or external patch). Tracked via `rewardClaimed` on Bug.
- **Verification daily cap** — 20 verifications per user per 24 hours.
- **Report throttle** — sliding window by account age: 10/hr (<7d), 30/hr (7-30d), 60/hr (30d+).
- **Embedding hourly cap** — 100 per user per hour. Gracefully degrades to text search.
- **GitHub token cache** — SHA-256 hashed, 5min valid / 1min invalid TTL.
```

**Step 2: Update seed data**

In `packages/db/prisma/seed.ts`, add `rewardClaimed: true` to bug1, bug2, bug3 (they already have interactions in the seed).

**Step 3: Type-check**

Run: `pnpm lint`
Expected: Pass.

**Step 4: Commit**

```bash
git add CLAUDE.md packages/db/prisma/seed.ts
git commit -m "docs: update CLAUDE.md for abuse prevention, update seed data"
```

---

### Task 10: Final verification

**Step 1: Full type-check**

Run: `pnpm lint`
Expected: All 6 packages pass with 0 errors.

**Step 2: Build**

Run: `pnpm build`
Expected: All packages build successfully.

**Step 3: Verify git status is clean**

Run: `git status`
Expected: No uncommitted changes.
