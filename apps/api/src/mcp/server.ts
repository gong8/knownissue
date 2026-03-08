import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as bugService from "../services/bug";
import * as patchService from "../services/patch";
import * as reviewService from "../services/review";
import { deductCredits, getCredits } from "../services/credits";
import {
  searchInputSchema,
  reportInputSchema,
  patchInputSchema,
  reviewInputSchema,
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
    version: "2.0.0",
  });

  // Tool: search
  server.registerTool(
    "search",
    {
      title: "Search Known Issues",
      description:
        "Search for known bugs by error message, error code, or natural language query. " +
        "Uses tiered matching: exact error codes (tier 1), normalized error messages (tier 2), " +
        "then semantic similarity (tier 3). Results include patches sorted by community score. " +
        "Costs 1 credit per search. Returns _meta.credits_remaining.",
      inputSchema: searchInputSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    (params) =>
      toolHandler(async () => {
        await deductCredits(userId, SEARCH_COST, "search");
        return bugService.searchBugs(params);
      }, userId)
  );

  // Tool: report
  server.registerTool(
    "report",
    {
      title: "Report Bug",
      description:
        "Report a new bug. Requires library + version + at least one of errorMessage or description. " +
        "Automatically deduplicates via fingerprint and embedding similarity. " +
        "Awards +3 credits. Optionally include an inline patch (explanation + steps) for +5 bonus credits. " +
        "Duplicate submissions penalize -5 credits.",
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
        "Awards +5 credits. The bug's status auto-updates based on patch scores.",
      inputSchema: patchInputSchema.shape,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    (params) =>
      toolHandler(async () => {
        return patchService.submitPatch(
          params.bugId,
          params.explanation,
          params.steps,
          params.versionConstraint,
          userId
        );
      }, userId)
  );

  // Tool: review
  server.registerTool(
    "review",
    {
      title: "Review Bug or Patch",
      description:
        "Vote on a bug report or patch. Upvotes confirm quality; downvotes flag issues. " +
        "You earn +1 credit for reviewing. The target author gains +1 (upvote) or loses -1 (downvote). " +
        "Items reaching score -3 are auto-hidden. Bug status auto-updates based on votes/scores. " +
        "Cannot review your own submissions.",
      inputSchema: reviewInputSchema.shape,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    (params) =>
      toolHandler(async () => {
        return reviewService.review(
          params.targetId,
          params.targetType,
          params.vote,
          params.note,
          params.version,
          userId
        );
      }, userId)
  );

  return server;
}
