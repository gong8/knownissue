# my_activity MCP Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `my_activity` MCP tool that lets agents check their contribution history, stats, and actionable items.

**Architecture:** New Zod schema in shared package, new service file with parallel Prisma queries, registered as 6th MCP tool. No migration needed — all data already exists.

**Tech Stack:** TypeScript, Zod, Prisma, Hono MCP server

---

### Task 1: Add validator schema to shared package

**Files:**
- Modify: `packages/shared/src/validators.ts`

**Step 1: Add `myActivityInputSchema` after the existing `verificationInputSchema` block (after line 161)**

```typescript
export const myActivityInputSchema = z.object({
  type: z.enum(["bugs", "patches", "verifications"]).optional()
    .describe("Filter to a specific activity type. Omit to see all."),
  outcome: z.enum(["fixed", "not_fixed", "partial"]).optional()
    .describe("Filter patches by verification outcome they received"),
  limit: z.number().int().min(1).max(50).optional()
    .describe("Max recent items per category (default 10)"),
});
```

**Step 2: Add exported type in the Inferred Types section (after line 188)**

```typescript
export type MyActivityInput = z.infer<typeof myActivityInputSchema>;
```

**Step 3: Verify shared package builds**

Run: `pnpm --filter @knownissue/shared build` (or `pnpm lint` from root)
Expected: No type errors

**Step 4: Commit**

```bash
git add packages/shared/src/validators.ts
git commit -m "feat: add myActivityInputSchema to shared validators"
```

---

### Task 2: Create activity service

**Files:**
- Create: `apps/api/src/services/activity.ts`

**Step 1: Create the service file**

```typescript
import { prisma } from "@knownissue/db";

const DEFAULT_LIMIT = 10;

export async function getMyActivity(
  userId: string,
  filters: { type?: string; outcome?: string; limit?: number }
) {
  const limit = filters.limit ?? DEFAULT_LIMIT;
  const showBugs = !filters.type || filters.type === "bugs";
  const showPatches = !filters.type || filters.type === "patches";
  const showVerifications = !filters.type || filters.type === "verifications";

  const [
    summary,
    recentBugs,
    recentPatches,
    recentVerifications,
    actionablePatches,
    actionableBugs,
  ] = await Promise.all([
    // Summary: counts + credit totals
    getSummary(userId),
    // Recent bugs
    showBugs
      ? prisma.bug.findMany({
          where: { reporterId: userId },
          select: {
            id: true,
            title: true,
            library: true,
            version: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : Promise.resolve([]),
    // Recent patches (optionally filtered by verification outcome)
    showPatches ? getRecentPatches(userId, limit, filters.outcome) : Promise.resolve([]),
    // Recent verifications
    showVerifications
      ? prisma.verification.findMany({
          where: { verifierId: userId },
          select: {
            id: true,
            patchId: true,
            outcome: true,
            createdAt: true,
            patch: {
              select: {
                bug: { select: { title: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : Promise.resolve([]),
    // Actionable: patches that received not_fixed verifications
    showPatches ? getActionablePatches(userId) : Promise.resolve([]),
    // Actionable: bugs whose status changed from open
    showBugs ? getActionableBugs(userId) : Promise.resolve([]),
  ]);

  return {
    summary,
    recent: {
      ...(showBugs && { bugs: recentBugs }),
      ...(showPatches && {
        patches: recentPatches.map((p) => ({
          id: p.id,
          bugId: p.bugId,
          bugTitle: p.bug.title,
          explanation: p.explanation,
          verifications: p._verificationCounts,
          createdAt: p.createdAt,
        })),
      }),
      ...(showVerifications && {
        verifications: recentVerifications.map((v) => ({
          id: v.id,
          patchId: v.patchId,
          bugTitle: v.patch.bug.title,
          outcome: v.outcome,
          createdAt: v.createdAt,
        })),
      }),
    },
    actionable: [
      ...actionablePatches.map((p) => ({
        type: "patch_needs_revision" as const,
        patchId: p.id,
        bugTitle: p.bug.title,
        notFixedCount: p._notFixedCount,
        latestNote: p._latestNote,
      })),
      ...actionableBugs.map((b) => ({
        type: "bug_status_changed" as const,
        bugId: b.id,
        title: b.title,
        newStatus: b.status,
      })),
    ],
  };
}

async function getSummary(userId: string) {
  const [bugCount, patchCount, verificationCount, creditAggs, user] =
    await Promise.all([
      prisma.bug.count({ where: { reporterId: userId } }),
      prisma.patch.count({ where: { submitterId: userId } }),
      prisma.verification.count({ where: { verifierId: userId } }),
      prisma.creditTransaction.groupBy({
        by: ["userId"],
        where: { userId },
        _sum: { amount: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { credits: true },
      }),
    ]);

  // Split earned/spent from transactions
  const [earned, spent] = await Promise.all([
    prisma.creditTransaction.aggregate({
      where: { userId, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    prisma.creditTransaction.aggregate({
      where: { userId, amount: { lt: 0 } },
      _sum: { amount: true },
    }),
  ]);

  return {
    bugsReported: bugCount,
    patchesSubmitted: patchCount,
    verificationsGiven: verificationCount,
    creditsEarned: earned._sum.amount ?? 0,
    creditsSpent: Math.abs(spent._sum.amount ?? 0),
    currentBalance: user.credits,
  };
}

async function getRecentPatches(
  userId: string,
  limit: number,
  outcomeFilter?: string
) {
  const patches = await prisma.patch.findMany({
    where: {
      submitterId: userId,
      ...(outcomeFilter && {
        verifications: {
          some: { outcome: outcomeFilter as "fixed" | "not_fixed" | "partial" },
        },
      }),
    },
    select: {
      id: true,
      bugId: true,
      explanation: true,
      createdAt: true,
      bug: { select: { title: true } },
      verifications: {
        select: { outcome: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return patches.map((p) => {
    const counts = { fixed: 0, not_fixed: 0, partial: 0 };
    for (const v of p.verifications) {
      counts[v.outcome]++;
    }
    return { ...p, _verificationCounts: counts };
  });
}

async function getActionablePatches(userId: string) {
  const patches = await prisma.patch.findMany({
    where: {
      submitterId: userId,
      verifications: { some: { outcome: "not_fixed" } },
    },
    select: {
      id: true,
      bug: { select: { title: true } },
      verifications: {
        where: { outcome: "not_fixed" },
        select: { note: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return patches.map((p) => ({
    ...p,
    _notFixedCount: p.verifications.length,
    _latestNote: p.verifications[0]?.note ?? null,
  }));
}

async function getActionableBugs(userId: string) {
  return prisma.bug.findMany({
    where: {
      reporterId: userId,
      status: { not: "open" },
    },
    select: {
      id: true,
      title: true,
      status: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
}
```

**Step 2: Verify it compiles**

Run: `pnpm lint` from repo root
Expected: No type errors

**Step 3: Commit**

```bash
git add apps/api/src/services/activity.ts
git commit -m "feat: add activity service for my_activity tool"
```

---

### Task 3: Register MCP tool

**Files:**
- Modify: `apps/api/src/mcp/server.ts`

**Step 1: Add import at top of file (after line 5)**

```typescript
import * as activityService from "../services/activity";
```

**Step 2: Add import of `myActivityInputSchema` (modify line 8-14)**

Update the import from `@knownissue/shared` to include `myActivityInputSchema`:

```typescript
import {
  searchInputSchema,
  reportInputSchema,
  patchInputSchema,
  getPatchInputSchema,
  verificationInputSchema,
  myActivityInputSchema,
  SEARCH_COST,
} from "@knownissue/shared";
```

**Step 3: Register the tool after the verify tool block (after line 156, before `return server`)**

```typescript
  // Tool: my_activity
  server.registerTool(
    "my_activity",
    {
      title: "My Activity",
      description:
        "Check your contribution history, stats, and items needing attention. " +
        "Returns: summary (counts, credits), recent activity (bugs reported, patches submitted, " +
        "verifications given), and actionable items (patches with not_fixed verifications, " +
        "bugs whose status changed). Free to call. " +
        "Use 'type' to filter to bugs/patches/verifications. " +
        "Use 'outcome' to filter patches by verification outcome.",
      inputSchema: myActivityInputSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    (params) =>
      toolHandler(async () => {
        return activityService.getMyActivity(userId, {
          type: params.type,
          outcome: params.outcome,
          limit: params.limit,
        });
      }, userId)
  );
```

**Step 4: Verify build**

Run: `pnpm lint` from repo root
Expected: No type errors

**Step 5: Commit**

```bash
git add apps/api/src/mcp/server.ts
git commit -m "feat: register my_activity as 6th MCP tool"
```

---

### Task 4: Manual smoke test

**Step 1: Start dev servers**

Run: `pnpm dev`

**Step 2: Test via MCP endpoint**

Use curl or an MCP client to call `my_activity` with a valid GitHub PAT:

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <GITHUB_PAT>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "my_activity",
      "arguments": {}
    }
  }'
```

Expected: JSON response with summary, recent, actionable sections.

**Step 3: Test with filters**

```bash
# Filter to patches only
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <GITHUB_PAT>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "my_activity",
      "arguments": { "type": "patches", "limit": 5 }
    }
  }'
```

Expected: Only `patches` key in `recent`, no `bugs` or `verifications`.

**Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address smoke test issues in my_activity"
```
