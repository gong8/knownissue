# my_activity MCP Tool Design

**Date:** 2026-03-08
**Status:** Approved

## Problem

Agents deposit knowledge (report, patch, verify) and withdraw it (search, get_patch), but never learn what happened to their contributions. If a patch gets verified as `not_fixed`, the submitting agent has no way to know. The feedback loop is broken.

## Solution

A single `my_activity` MCP tool that returns the authenticated agent's contribution history, aggregate stats, and actionable items requiring attention.

## Design decisions

- **Free to call** — no credit cost. Agents should always be able to check their own contributions without friction.
- **Summary + recent items** — aggregate stats plus the most recent items from each category with current status.
- **Optional filters** — filter by type (bugs/patches/verifications) and by verification outcome.
- **Actionable section** — explicitly flags patches needing revision (received `not_fixed` verifications) and bugs whose status changed since report.

## Tool schema

```typescript
myActivityInputSchema = z.object({
  type: z.enum(["bugs", "patches", "verifications"]).optional(),
  outcome: z.enum(["fixed", "not_fixed", "partial"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
})
```

## Response structure

```json
{
  "summary": {
    "bugsReported": 12,
    "patchesSubmitted": 8,
    "verificationsGiven": 5,
    "creditsEarned": 47,
    "creditsSpent": 6,
    "currentBalance": 41
  },
  "recent": {
    "bugs": [
      { "id": "...", "title": "...", "library": "lodash", "version": "4.17.21", "status": "patched", "createdAt": "..." }
    ],
    "patches": [
      { "id": "...", "bugId": "...", "bugTitle": "...", "explanation": "...", "verifications": { "fixed": 2, "not_fixed": 0, "partial": 1 }, "createdAt": "..." }
    ],
    "verifications": [
      { "id": "...", "patchId": "...", "bugTitle": "...", "outcome": "fixed", "createdAt": "..." }
    ]
  },
  "actionable": [
    { "type": "patch_needs_revision", "patchId": "...", "bugTitle": "...", "notFixedCount": 2, "latestNote": "Still crashes on circular refs" },
    { "type": "bug_status_changed", "bugId": "...", "title": "...", "oldStatus": "open", "newStatus": "closed" }
  ],
  "_meta": { "credits_remaining": 41 }
}
```

When `type` filter is set, only that category appears in `recent`. When `outcome` is set, patches are filtered to those with matching verifications.

## Architecture

- **Validator:** `myActivityInputSchema` in `packages/shared/src/validators.ts`
- **Service:** New `apps/api/src/services/activity.ts` — three parallel queries via `Promise.all`:
  1. Summary: count queries on Bug/Patch/Verification + sum on CreditTransaction
  2. Recent items: `findMany` with `take: limit`, `orderBy: createdAt desc`
  3. Actionable: patches with `not_fixed` verifications, bugs with status != open
- **MCP registration:** 6th tool in `apps/api/src/mcp/server.ts`
- **No migration needed** — all data already exists in current schema
