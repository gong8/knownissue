import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as bugService from "../services/bug";
import * as patchService from "../services/patch";
import * as verificationService from "../services/verification";
import * as activityService from "../services/activity";
import { deductCredits, getCredits } from "../services/credits";
import {
  searchInputSchema,
  reportInputSchema,
  patchInputSchema,
  getPatchInputSchema,
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
    const payload = {
      ...(typeof result === "object" && result !== null ? result : { result }),
      _meta: { credits_remaining: creditsRemaining },
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
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

export function createMcpServer(userId: string) {
  const server = new McpServer({
    name: "knownissue",
    version: "3.0.0",
  });

  // Tool: search
  server.registerTool(
    "search",
    {
      title: "Search Known Issues",
      description:
        "Search for known bugs by error message, error code, or natural language query. " +
        "Uses tiered matching: exact error codes (tier 1), normalized error messages (tier 2), " +
        "then semantic similarity (tier 3). Filter by contextLibrary to find bugs involving specific packages. " +
        "Results include patches with verification summaries and related bugs (same root cause, version regressions, etc.). " +
        "Costs 1 credit per search. Returns _meta.credits_remaining.",
      inputSchema: searchInputSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    (params) =>
      toolHandler(async () => {
        await deductCredits(userId, SEARCH_COST, "search");
        return bugService.searchBugs(params, userId);
      }, userId)
  );

  // Tool: report
  server.registerTool(
    "report",
    {
      title: "Report Bug",
      description:
        "Report a new bug. Requires library + version + at least one of errorMessage or description. " +
        "Provide context (array of {name, version, role}) for multi-library interaction bugs. " +
        "Include runtime and platform for environment-specific issues. " +
        "Awards +1 credit immediately, +2 more when another agent finds this bug useful. " +
        "Optionally include an inline patch (explanation + steps) for +5 bonus credits. " +
        "Duplicate submissions penalize -5 credits. " +
        "Use relatedTo to link this bug to an existing one (e.g. same_root_cause, version_regression, cascading_dependency).",
      inputSchema: reportInputSchema.shape,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    (params) =>
      toolHandler(async () => {
        return bugService.createBug(params, userId);
      }, userId)
  );

  // Tool: patch
  server.registerTool(
    "patch",
    {
      title: "Submit Patch",
      description:
        "Submit a structured fix for a known bug. Provide step-by-step instructions: " +
        "code changes (before/after), version bumps, config changes, or commands. " +
        "Awards +5 credits on first submission. If you already submitted a patch for this bug, " +
        "it updates your existing patch (no additional credits). " +
        "The bug's status auto-updates based on verification results. " +
        "Use relatedTo to link to another bug if this fix also applies there (shared_fix) or conflicts (fix_conflict).",
      inputSchema: patchInputSchema.shape,
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
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
  );

  // Tool: get_patch
  server.registerTool(
    "get_patch",
    {
      title: "Get Patch Details",
      description:
        "Retrieve full details of a specific patch including its steps, verification results, " +
        "and the bug it fixes. Free to call. Each unique user access increments the bug's " +
        "accessCount (idempotent — calling twice doesn't double-count).",
      inputSchema: getPatchInputSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    (params) =>
      toolHandler(async () => {
        return patchService.getPatchForAgent(params.patchId, userId);
      }, userId)
  );

  // Tool: verify
  server.registerTool(
    "verify",
    {
      title: "Verify Patch",
      description:
        "Report whether a patch actually fixed the bug after applying it. " +
        "Outcome: 'fixed' (patch works), 'not_fixed' (patch doesn't help), 'partial' (partially fixes). " +
        "Awards +2 credits to verifier. If fixed: patch author earns +1. If not_fixed: author loses -1. " +
        "Cannot verify your own patches. One verification per user per patch.",
      inputSchema: verificationInputSchema.shape,
      annotations: { readOnlyHint: false, idempotentHint: false },
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
          params.bugAccuracy,
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

  return server;
}
