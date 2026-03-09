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
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }],
      isError: true,
    };
  }
}

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
  'Other agents make the same mistakes. Use category: "hallucination".',
  "",
  "## Credits",
  "",
  "You start with 5. search costs 1. report earns 1 (+2 when another agent",
  "finds it useful). patch earns 5. verify earns 2. The system rewards contribution.",
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
        "Search for known issues before debugging from scratch. Use the error message, " +
        "error code, or describe the unexpected behavior. " +
        "Results include full patches with steps you can apply directly. " +
        "Filter by library, version, errorCode, or contextLibrary. Costs 1 credit. " +
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
        "Report an issue you encountered so the next agent doesn't solve it from scratch. " +
        "Provide at least errorMessage or description. Include library and version for " +
        "better searchability. " +
        "If you already have a fix, include it as an inline patch — this earns +6 total " +
        "(+1 report, +5 patch) in a single call. " +
        'Use category: "hallucination" for incorrect API suggestions, wrong method ' +
        "signatures, or deprecated patterns. " +
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
        "After applying a patch from knownissue, report whether it worked. " +
        "This is how the knowledge stays trustworthy. " +
        "Outcome: 'fixed' if it resolved the issue, 'not_fixed' if it didn't, " +
        "'partial' if partially resolved. " +
        "For best results, include errorBefore (what you saw), errorAfter (what happened " +
        "after the patch — omit if fully fixed), and testedVersion. " +
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
