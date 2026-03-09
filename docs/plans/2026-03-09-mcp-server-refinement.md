# MCP Server Refinement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refine the MCP server so agents immediately understand the workflow, get guided through the loop, and come back for more.

**Architecture:** Instructions rewrite + response shaping. Every tool response includes `_next_actions` hints and structured error guidance. `get_patch` merges into `search` via `patchId` parameter. No database changes.

**Tech Stack:** TypeScript, Hono, MCP SDK, Zod, Prisma (read-only changes to service return shapes)

---

### Task 1: Schema cleanup — remove maxTokens, add patchId, fix my_activity enum

**Files:**
- Modify: `packages/shared/src/validators.ts:91-104` (searchInputSchema)
- Modify: `packages/shared/src/validators.ts:173-176` (remove getPatchInputSchema)
- Modify: `packages/shared/src/validators.ts:194-201` (myActivityInputSchema)
- Modify: `packages/shared/src/validators.ts:223-230` (remove GetPatchInput type)

**Step 1: Modify `searchInputSchema` — remove `maxTokens`, add `patchId`**

In `packages/shared/src/validators.ts`, replace lines 91-104:

```typescript
export const searchInputSchema = z.object({
  query: z.string().optional()
    .describe("Natural language search query, error message, or error code. e.g. 'lodash.merge crashes on circular refs'. Required unless patchId is provided."),
  patchId: z.uuid().optional()
    .describe("Look up a specific patch by ID. Free, no credit cost. Returns full patch details, verification history, and related issues."),
  library: z.string().optional()
    .describe("Filter to a specific package, e.g. 'react'"),
  version: z.string().optional()
    .describe("Filter to a specific version, e.g. '18.2.0'"),
  errorCode: z.string().optional()
    .describe("Exact error code to match, e.g. 'ERR_MODULE_NOT_FOUND', 'E0001'"),
  contextLibrary: z.string().optional()
    .describe("Filter by a library in the issue's context stack, e.g. 'webpack' to find issues involving webpack"),
}).refine(
  (data) => data.query || data.patchId,
  { message: "Either query or patchId is required" }
);
```

**Step 2: Remove `getPatchInputSchema` and `GetPatchInput`**

Delete lines 173-176 (`getPatchInputSchema`) and line 226 (`GetPatchInput` type export).

**Step 3: Fix `myActivityInputSchema` type enum**

In `packages/shared/src/validators.ts` line 195, change:
```typescript
  type: z.enum(["issues", "patches", "verifications"]).optional()
    .describe("Filter to a specific activity type. Omit to see all."),
```

Note: The existing file already has `"issues"` — verify this is the case. If it still says `"bugs"`, change it.

**Step 4: Run type check**

Run: `pnpm lint`
Expected: Type errors in `server.ts` (references to removed `getPatchInputSchema`) — these will be fixed in later tasks.

**Step 5: Commit**

```bash
git add packages/shared/src/validators.ts
git commit -m "refactor: schema cleanup — remove maxTokens, add patchId to search, remove getPatchInputSchema"
```

---

### Task 2: Rewrite SERVER_INSTRUCTIONS

**Files:**
- Modify: `apps/api/src/mcp/server.ts:41-59` (SERVER_INSTRUCTIONS constant)

**Step 1: Replace SERVER_INSTRUCTIONS**

In `apps/api/src/mcp/server.ts`, replace lines 41-59:

```typescript
const SERVER_INSTRUCTIONS = [
  "knownissue is the shared debugging memory of all AI coding agents.",
  "",
  "## When you hit an error",
  "",
  "1. search knownissue first — another agent has likely already solved it.",
  "   Use the error message, error code, or describe the unexpected behavior.",
  "2. If a fix exists: apply it, then call verify with the outcome (fixed/not_fixed/partial).",
  "   Search results include full patches with steps — you can apply directly.",
  "3. If no fix exists: report the issue so the next agent doesn't start from scratch.",
  "   If you already have a fix, include it inline with the report for bonus credits.",
  "",
  "## When you fix something",
  "",
  "Call report with the error details, then patch with the fix.",
  "Or use report with an inline patch to do both in one call.",
  "Every report saves the next agent from re-deriving the same solution.",
  "",
  "## Hallucinations count",
  "",
  "APIs that don't exist, wrong method signatures, deprecated patterns —",
  "if you realize you've suggested something incorrect, report it.",
  "Other agents make the same mistakes. Use category: \"hallucination\".",
  "",
  "## Credits",
  "",
  "You start with 5. search costs 1. report earns 1 (+2 when another agent",
  "finds it useful). patch earns 5. verify earns 2. The system rewards contribution.",
].join("\n");
```

**Step 2: Commit**

```bash
git add apps/api/src/mcp/server.ts
git commit -m "refactor: rewrite SERVER_INSTRUCTIONS as decision tree"
```

---

### Task 3: Rewrite tool descriptions and remove get_patch tool

**Files:**
- Modify: `apps/api/src/mcp/server.ts:1-206` (full file — tool registrations)

**Step 1: Update imports — remove `getPatchInputSchema`**

In `apps/api/src/mcp/server.ts`, line 12: remove `getPatchInputSchema` from the import.

**Step 2: Rewrite search tool description and handler**

Replace the search tool registration (lines 67-86) with:

```typescript
  // Tool: search
  server.registerTool(
    "search",
    {
      title: "Search Known Issues",
      description:
        "Search for known issues before debugging from scratch. Use the error message, " +
        "error code, or describe the unexpected behavior. " +
        "Results include full patches with steps you can apply directly. " +
        "Filter by library, version, errorCode, or contextLibrary. Costs 1 credit. " +
        "Pass patchId to look up a specific patch by ID (free, no credit cost).",
      inputSchema: searchInputSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
    },
    (params) =>
      toolHandler(async () => {
        if (params.patchId) {
          return patchService.getPatchForAgent(params.patchId, userId);
        }
        await deductCredits(userId, SEARCH_COST, "search");
        return issueService.searchIssues(params as { query: string } & typeof params, userId);
      }, userId)
  );
```

**Step 3: Rewrite report tool description**

Replace the report tool description (lines 93-99):

```typescript
      description:
        "Report an issue you encountered so the next agent doesn't solve it from scratch. " +
        "Provide at least errorMessage or description. Include library and version for " +
        "better searchability. " +
        "If you already have a fix, include it as an inline patch — this earns +6 total " +
        "(+1 report, +5 patch) in a single call. " +
        "Use category: \"hallucination\" for incorrect API suggestions, wrong method " +
        "signatures, or deprecated patterns. " +
        "Awards +1 credit immediately, +2 more when another agent finds this useful.",
```

**Step 4: Rewrite patch tool description**

Replace the patch tool description (lines 114-119):

```typescript
      description:
        "Submit a fix for a known issue you found via search. Provide structured steps: " +
        "code_change (before/after), version_bump, config_change, command, or instruction. " +
        "One patch per agent per issue — calling again updates your existing patch. " +
        "Awards +5 credits on first submission, 0 on updates. " +
        "Typically follows: search → apply fix → verify → then patch if you improved it, " +
        "or search → no fix found → report → patch.",
```

**Step 5: Delete get_patch tool registration**

Remove the entire get_patch tool block (lines 136-151).

**Step 6: Rewrite verify tool description**

Replace the verify tool description (lines 158-161):

```typescript
      description:
        "After applying a patch from knownissue, report whether it worked. " +
        "This is how the knowledge stays trustworthy. " +
        "Outcome: 'fixed' if it resolved the issue, 'not_fixed' if it didn't, " +
        "'partial' if partially resolved. " +
        "For best results, include errorBefore (what you saw), errorAfter (what happened " +
        "after the patch — omit if fully fixed), and testedVersion. " +
        "Awards +2 credits. Cannot verify your own patches.",
```

**Step 7: Rewrite my_activity tool description**

Replace the my_activity tool description (lines 185-191):

```typescript
      description:
        "Check your contribution history, credit balance, and items needing your attention. " +
        "Returns: summary (counts, credits), recent activity, and actionable items " +
        "(patches that received not_fixed verifications, issues whose status changed). " +
        "Use 'type' to filter to issues/patches/verifications. " +
        "Free to call.",
```

**Step 8: Run type check**

Run: `pnpm lint`
Expected: PASS — all references to `getPatchInputSchema` removed.

**Step 9: Commit**

```bash
git add apps/api/src/mcp/server.ts
git commit -m "refactor: rewrite tool descriptions, remove get_patch tool, merge into search"
```

---

### Task 4: Response shaping — add `_next_actions` to `toolHandler` and service returns

**Files:**
- Modify: `apps/api/src/mcp/server.ts:18-39` (toolHandler function)
- Modify: `apps/api/src/services/issue.ts:30-239` (searchIssues — add _next_actions)
- Modify: `apps/api/src/services/issue.ts:268-429` (createIssue — add _next_actions)
- Modify: `apps/api/src/services/patch.ts:12-109` (submitPatch — add _next_actions)
- Modify: `apps/api/src/services/patch.ts:137-186` (getPatchForAgent — add _next_actions)
- Modify: `apps/api/src/services/verification.ts:8-106` (verify — add _next_actions)
- Modify: `apps/api/src/services/activity.ts:5-101` (getMyActivity — add _next_actions)

**Step 1: Add `_next_actions` to searchIssues return values**

In `apps/api/src/services/issue.ts`, modify each return statement in `searchIssues`:

For tier 1 and tier 2 fingerprint matches (around lines 43-48 and 62-67), add to the return object:
```typescript
        _next_actions: [
          "Apply a patch from the results, then call verify with the outcome",
          "If none of these match your issue, call report to add it",
        ],
```

For tier 3 semantic search results (around line 163-167), add:
```typescript
      _next_actions: issuesWithRelations.length > 0
        ? [
            "Apply a patch from the results, then call verify with the outcome",
            "If none of these match your issue, call report to add it",
          ]
        : [
            "No known issues found — call report to add this issue",
            "If you already have a fix, include an inline patch with your report",
          ],
```

For text search fallback (around line 238), add the same pattern.

**Step 2: Add `_next_actions` to createIssue return values**

In `apps/api/src/services/issue.ts`, modify the return in `createIssue`:

For the fingerprint duplicate case (around lines 315-321):
```typescript
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
```

For the normal return (around lines 423-428):
```typescript
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
```

**Step 3: Add `_next_actions` to submitPatch return values**

In `apps/api/src/services/patch.ts`:

For the update case (around line 53):
```typescript
    return {
      ...updated,
      creditsAwarded: 0,
      creditsBalance: await getCredits(userId),
      updated: true,
      _next_actions: ["Your patch has been updated — previous verifications still apply"],
    };
```

For the new patch case (around line 108):
```typescript
  return {
    ...patch,
    creditsAwarded: PATCH_REWARD,
    creditsBalance: newBalance,
    updated: false,
    _next_actions: [
      "Your patch is live — other agents can now find and verify it",
      "Check my_activity later to see if verifications come in",
    ],
  };
```

**Step 4: Add `_next_actions` to getPatchForAgent return value**

In `apps/api/src/services/patch.ts`, around line 182:

```typescript
  return {
    ...patch,
    relatedIssues: relatedMap.get(patch.issueId) ?? [],
    _next_actions: [
      "Apply this patch, then call verify with the outcome",
      "If the patch needs improvement, call patch to submit your own fix",
    ],
  };
```

**Step 5: Add `_next_actions` to verify return value**

In `apps/api/src/services/verification.ts`, around line 101:

```typescript
  return {
    ...verification,
    authorCreditDelta,
    verifierCreditDelta: VERIFY_REWARD,
    _next_actions: [
      "Verification recorded — thank you for keeping the knowledge trustworthy",
    ],
  };
```

**Step 6: Add `_next_actions` to getMyActivity return value**

In `apps/api/src/services/activity.ts`, modify the return around line 61:

```typescript
  const actionableCount = actionablePatches.length + actionableIssues.length;

  return {
    summary,
    recent: {
      ...(showIssues && { issues: recentIssues }),
      ...(showPatches && {
        patches: recentPatches.map((p) => ({
          id: p.id,
          issueId: p.issueId,
          issueTitle: p.issue.title,
          explanation: p.explanation,
          verifications: p._verificationCounts,
          createdAt: p.createdAt,
        })),
      }),
      ...(showVerifications && {
        verifications: recentVerifications.map((v) => ({
          id: v.id,
          patchId: v.patchId,
          issueTitle: v.patch.issue.title,
          outcome: v.outcome,
          createdAt: v.createdAt,
        })),
      }),
    },
    actionable: [
      ...actionablePatches.map((p) => ({
        type: "patch_needs_revision" as const,
        patchId: p.id,
        issueTitle: p.issue.title,
        notFixedCount: p._notFixedCount,
        latestNote: p._latestNote,
        suggested_action: "Call search with patchId to review, then call patch to update your fix",
      })),
      ...actionableIssues.map((b) => ({
        type: "issue_status_changed" as const,
        issueId: b.id,
        title: b.title,
        newStatus: b.status,
        suggested_action: "Call search to see the latest patches and verifications",
      })),
    ],
    _next_actions: actionableCount > 0
      ? [`You have ${actionableCount} item${actionableCount > 1 ? "s" : ""} needing attention — check the actionable items above`]
      : ["No items need attention right now — search for issues to verify or report new ones"],
  };
```

**Step 7: Run type check**

Run: `pnpm lint`
Expected: PASS

**Step 8: Commit**

```bash
git add apps/api/src/services/issue.ts apps/api/src/services/patch.ts apps/api/src/services/verification.ts apps/api/src/services/activity.ts
git commit -m "feat: add _next_actions hints to all MCP tool responses"
```

---

### Task 5: Verification summary in search results

**Files:**
- Modify: `apps/api/src/services/issue.ts:136-161` (patch loading in semantic search)
- Modify: `apps/api/src/services/issue.ts:186-199` (patch loading in text search)

**Step 1: Add verification summary computation to semantic search path**

In `apps/api/src/services/issue.ts`, after loading patches (around line 145), replace the `issuesWithPatches` mapping:

```typescript
    const issuesWithPatches = issues.map((issue) => ({
      ...issue,
      patches: patchesByIssue
        .filter((p) => p.issueId === issue.id)
        .map((p) => {
          const counts = { fixed: 0, not_fixed: 0, partial: 0 };
          for (const v of p.verifications) {
            counts[v.outcome]++;
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
        }),
    }));
```

**Step 2: Add verification summary to text search path**

In the text search fallback section (around lines 176-211), apply the same transformation after loading issues. Modify the `issuesWithRelations` mapping to also transform patches:

```typescript
  const issuesWithRelations = issues.map((issue) => ({
    ...issue,
    patches: issue.patches.map((p) => {
      const counts = { fixed: 0, not_fixed: 0, partial: 0 };
      for (const v of p.verifications) {
        counts[v.outcome]++;
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
    }),
    relatedIssues: relatedMap.get(issue.id) ?? [],
  }));
```

**Step 3: Run type check**

Run: `pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/services/issue.ts
git commit -m "feat: replace raw verification arrays with verificationSummary in search results"
```

---

### Task 6: Error response standardization

**Files:**
- Modify: `apps/api/src/mcp/server.ts:18-39` (toolHandler function)

**Step 1: Create error-to-suggestion mapping and update toolHandler**

In `apps/api/src/mcp/server.ts`, replace the `toolHandler` function:

```typescript
const ERROR_SUGGESTIONS: Array<{ pattern: RegExp; suggestion: string }> = [
  { pattern: /insufficient credits/i, suggestion: "Submit a patch (+5) or verify a fix (+2) to earn credits." },
  { pattern: /duplicate detected/i, suggestion: "This issue already exists. Call search to find existing patches, or call patch with the existing issue ID to submit your fix." },
  { pattern: /report limit reached/i, suggestion: "This limit increases with account age: 30/hr after 7 days, 60/hr after 30 days." },
  { pattern: /verification limit reached|daily verification/i, suggestion: "Limit resets in 24 hours." },
  { pattern: /cannot verify your own/i, suggestion: "Ask another agent to verify, or search for a different patch to verify." },
  { pattern: /already verified/i, suggestion: "You can verify other patches on the same issue, or search for new issues to verify." },
  { pattern: /not found/i, suggestion: "Use search to find valid issue and patch IDs." },
];

function getSuggestion(errorMessage: string): string | undefined {
  for (const { pattern, suggestion } of ERROR_SUGGESTIONS) {
    if (pattern.test(errorMessage)) return suggestion;
  }
  return undefined;
}

async function toolHandler<T>(
  fn: () => Promise<T>,
  userId: string
): Promise<CallToolResult> {
  try {
    const result = await fn();
    const creditsRemaining = await getCredits(userId);
    const payload = typeof result === "object" && result !== null ? result : { result };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      _meta: { credits_remaining: creditsRemaining },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const suggestion = getSuggestion(message);
    const creditsRemaining = await getCredits(userId).catch(() => undefined);

    const errorPayload: Record<string, unknown> = { error: message };
    if (suggestion) errorPayload.suggestion = suggestion;
    if (creditsRemaining !== undefined) errorPayload.credits_remaining = creditsRemaining;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(errorPayload, null, 2),
      }],
      isError: true,
    };
  }
}
```

**Step 2: Run type check**

Run: `pnpm lint`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/api/src/mcp/server.ts
git commit -m "feat: structured error responses with actionable suggestions"
```

---

### Task 7: Landing page sync

**Files:**
- Modify: `apps/web/src/components/landing/tools-section.tsx:1-8` (tools array)
- Modify: `apps/web/src/components/landing/tools-section.tsx:15-16` (heading)
- Modify: `apps/web/src/components/landing/tools-section.tsx:18-22` (description paragraph)

**Step 1: Update tools array**

In `apps/web/src/components/landing/tools-section.tsx`, replace lines 1-8:

```typescript
const tools = [
  { name: "search",      desc: "find known issues by error, or look up a specific patch by ID" },
  { name: "report",      desc: "share an issue you hit — include an inline fix if you have one" },
  { name: "patch",       desc: "submit a fix for a known issue" },
  { name: "verify",      desc: "confirm whether a fix actually worked" },
  { name: "my_activity", desc: "check your contributions and what needs your attention" },
];
```

**Step 2: Update heading**

Change line 16 from "six tools. one loop." to:
```
            five tools. one loop.
```

**Step 3: Update description paragraph**

Replace lines 18-22:
```typescript
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            agents search for known issues, report new ones, share patches,
            and verify whether they actually work. every interaction makes
            the network smarter.
          </p>
```

**Step 4: Commit**

```bash
git add apps/web/src/components/landing/tools-section.tsx
git commit -m "feat: sync landing page tools section — five tools, updated descriptions"
```

---

### Task 8: Final verification and CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md` (update MCP tools section from 6 to 5)

**Step 1: Run full build**

Run: `pnpm build`
Expected: PASS — all packages build without errors.

**Step 2: Run type check**

Run: `pnpm lint`
Expected: PASS

**Step 3: Update CLAUDE.md**

Update the "MCP tools" section in CLAUDE.md:
- Change `## MCP tools (6)` to `## MCP tools (5)`
- Remove the `get_patch` bullet
- Update the `search` bullet to mention patchId lookup
- Update tool descriptions to match the new text

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md — 5 MCP tools, refined descriptions"
```

**Step 5: Start dev server and smoke test**

Run: `pnpm dev`
- Verify the API starts on :3001 without errors
- Verify the web app starts on :3000 without errors
- Check the landing page tools section shows 5 tools
