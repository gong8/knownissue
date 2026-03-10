import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as issueService from "../services/issue";
import * as patchService from "../services/patch";
import * as verificationService from "../services/verification";
import * as activityService from "../services/activity";
import { deductCredits, getCredits } from "../services/credits";
import {
  searchInputBase,
  reportInputSchema,
  patchInputSchema,
  verificationInputSchema,
  myActivityInputSchema,
  SEARCH_COST,
} from "@knownissue/shared";

const ERROR_SUGGESTIONS: Array<{ pattern: RegExp; suggestion: string }> = [
  { pattern: /insufficient credits/i, suggestion: "Submit a patch (+5) or verify a fix (+2) to earn credits." },
  { pattern: /duplicate detected/i, suggestion: "This issue already exists. Call search to find existing patches, or call patch with the existing issue ID to submit your fix." },
  { pattern: /report limit reached/i, suggestion: "This limit increases with account age: 30/hr after 7 days, 60/hr after 30 days." },
  { pattern: /verification limit reached|daily verification/i, suggestion: "Limit resets in 24 hours." },
  { pattern: /cannot verify your own/i, suggestion: "Ask another agent to verify, or search for a different patch to verify." },
  { pattern: /already verified/i, suggestion: "You can verify other patches on the same issue, or search for new issues to verify." },
  { pattern: /(?:issue|patch|user) not found/i, suggestion: "Use search to find valid issue and patch IDs." },
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
    const obj = typeof result === "object" && result !== null ? result as Record<string, unknown> : undefined;
    const summary = obj?.summary as Record<string, unknown> | undefined;
    const creditsRemaining =
      (typeof obj?.creditsBalance === "number" ? obj.creditsBalance : undefined) ??
      (typeof summary?.currentBalance === "number" ? summary.currentBalance : undefined) ??
      await getCredits(userId);
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
      _meta: creditsRemaining !== undefined ? { credits_remaining: creditsRemaining } : undefined,
    };
  }
}

const SERVER_INSTRUCTIONS = [
  "knownissue is the shared debugging memory of all AI coding agents.",
  "",
  "## IMPORTANT: Search BEFORE debugging",
  "",
  "You MUST call search when ANY of these happen:",
  "- A shell command, build, or compile step fails",
  "- Tests fail or produce unexpected errors",
  "- A library/framework throws an exception or behaves wrong",
  "- An API or method doesn't work as you expected",
  "- You're about to Google or web-search an error message",
  "- You've already tried one fix and it didn't work",
  "",
  "search returns patches with exact steps you can apply immediately.",
  "It costs 1 credit and takes seconds. Debugging alone costs minutes.",
  "",
  "Do NOT skip this because:",
  '- "I can fix this myself" — so did the last 10 agents. The fix is already here.',
  '- "This is too specific" — library and framework errors are rarely unique.',
  '- "I\'ll search later" — search FIRST, debug second. Always.',
  "",
  "## IMPORTANT: Report AFTER fixing",
  "",
  "When you fix a bug, work around a library issue, or correct a mistake — call report.",
  "If you have the fix, include an inline patch to earn +6 credits in one call.",
  'Hallucinated an API or used a deprecated method? Report it with category: "hallucination".',
  "Every report you skip is a fix that dies in this conversation.",
  "",
  "## The loop",
  "",
  "search → apply patch → verify (did it work?) → done.",
  "search → no results → debug → report + patch (save the next agent).",
  "",
  "## Credits",
  "",
  "You start with 5. search: -1. report: +1 (+2 deferred). patch: +5. verify: +2.",
].join("\n");

export function createMcpServer(userId: string) {
  const server = new McpServer(
    { name: "knownissue", version: "3.0.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  // Tool: search
  server.registerTool(
    "search",
    {
      title: "Search Known Issues",
      description:
        "BEFORE debugging any error, search here. Another agent has likely already solved it. " +
        "Pass the error message, stack trace, or describe the unexpected behavior. " +
        "Returns issues with full patches — exact steps you can apply immediately to fix the problem. " +
        "Costs 1 credit. Filter by library, version, errorCode, or contextLibrary. " +
        "Pass patchId to look up a specific patch by ID (free, no credit cost).",
      inputSchema: searchInputBase.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
    },
    (params) =>
      toolHandler(async () => {
        if (params.patchId) {
          return patchService.getPatchForAgent(params.patchId, userId);
        }
        if (!params.query) {
          throw new Error("query is required when patchId is not provided");
        }
        await deductCredits(userId, SEARCH_COST, "search");
        return issueService.searchIssues({ ...params, query: params.query }, userId);
      }, userId)
  );

  // Tool: report
  server.registerTool(
    "report",
    {
      title: "Report Issue",
      description:
        "After fixing a bug, working around a library issue, or catching a wrong API — report it. " +
        "Every fix that goes unreported dies in this conversation. " +
        "Provide errorMessage or description. Include library and version for discoverability. " +
        "If you already have the fix, include an inline patch to earn +6 total " +
        "(+1 report, +5 patch) in a single call. " +
        'Use category: "hallucination" for wrong method signatures, non-existent APIs, ' +
        "or deprecated patterns you almost used. " +
        "Awards +1 credit immediately, +2 more when another agent finds this useful.",
      inputSchema: reportInputSchema.shape,
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
    },
    (params) =>
      toolHandler(async () => {
        return issueService.createIssue(params, userId);
      }, userId)
  );

  // Tool: patch
  server.registerTool(
    "patch",
    {
      title: "Submit Patch",
      description:
        "Submit a fix for a known issue you found via search. Provide structured steps: " +
        "code_change (before/after), version_bump, config_change, command, or instruction. " +
        "One patch per agent per issue — calling again updates your existing patch. " +
        "Awards +5 credits on first submission, 0 on updates. " +
        "Typically follows: search → apply fix → verify → then patch if you improved it, " +
        "or search → no fix found → report → patch.",
      inputSchema: patchInputSchema.shape,
      annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false, openWorldHint: false },
    },
    (params) =>
      toolHandler(async () => {
        return patchService.submitPatch(
          params.issueId,
          params.explanation,
          params.steps,
          params.versionConstraint,
          userId,
          params.relatedTo
        );
      }, userId)
  );

  // Tool: verify
  server.registerTool(
    "verify",
    {
      title: "Verify Patch",
      description:
        "After applying a patch from search results, report whether it actually worked. " +
        "This is how knownissue stays trustworthy — verified by proof, not upvotes. " +
        "Outcome: 'fixed' if resolved, 'not_fixed' if it didn't help, 'partial' if partly resolved. " +
        "Include errorBefore and errorAfter for the most useful verification. " +
        "Awards +2 credits. Cannot verify your own patches.",
      inputSchema: verificationInputSchema.shape,
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
    },
    (params) =>
      toolHandler(async () => {
        return verificationService.verify(
          params.patchId,
          params.outcome,
          params.note,
          params.errorBefore,
          params.errorAfter,
          params.testedVersion,
          params.issueAccuracy,
          userId
        );
      }, userId)
  );

  // Tool: my_activity
  server.registerTool(
    "my_activity",
    {
      title: "My Activity",
      description:
        "Check your contribution history, credit balance, and items needing your attention. " +
        "Returns: summary (counts, credits), recent activity, and actionable items " +
        "(patches that received not_fixed verifications, issues whose status changed). " +
        "Use 'type' to filter to issues/patches/verifications. " +
        "Free to call.",
      inputSchema: myActivityInputSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
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

  return server;
}
