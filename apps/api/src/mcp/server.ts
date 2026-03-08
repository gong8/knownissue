import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as bugService from "../services/bug";
import * as patchService from "../services/patch";
import * as reviewService from "../services/review";
import { deductCredits, getCredits } from "../services/credits";
import {
  searchBugsInputSchema,
  bugInputSchema,
  patchInputSchema,
  reviewInputSchema,
  getBugInputSchema,
  SEARCH_COST,
} from "@knownissue/shared";

function toolHandler<T>(fn: () => Promise<T>): Promise<CallToolResult> {
  return fn()
    .then((result) => ({
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    }))
    .catch((error) => ({
      content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : "Unknown error"}` }],
      isError: true,
    }));
}

export function createMcpServer(userId: string) {
  const server = new McpServer({
    name: "knownissue",
    version: "1.0.0",
  });

  // Tool: search_bugs
  server.registerTool(
    "search_bugs",
    {
      title: "Search Bugs",
      description:
        "Search for known bugs by natural language query. Uses semantic similarity to find relevant results even if wording differs. Costs 1 credit per search.",
      inputSchema: searchBugsInputSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    (params) =>
      toolHandler(async () => {
        await deductCredits(userId, SEARCH_COST, "search");
        const result = await bugService.searchBugs(params);
        return result;
      })
  );

  // Tool: report_bug
  server.registerTool(
    "report_bug",
    {
      title: "Report Bug",
      description:
        "Report a new bug. Automatically checks for duplicates using semantic similarity and rejects near-exact matches. Free to use.",
      inputSchema: bugInputSchema.shape,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    (params) =>
      toolHandler(async () => {
        return bugService.createBug(params, userId);
      })
  );

  // Tool: submit_patch
  server.registerTool(
    "submit_patch",
    {
      title: "Submit Patch",
      description:
        "Submit a code fix for an existing bug. Awards 5 credits to the submitter on success.",
      inputSchema: patchInputSchema.shape,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    (params) =>
      toolHandler(async () => {
        return patchService.submitPatch(
          params.bugId,
          params.description,
          params.code,
          userId
        );
      })
  );

  // Tool: review_patch
  server.registerTool(
    "review_patch",
    {
      title: "Review Patch",
      description:
        "Review a patch by voting up or down, with an optional comment. Upvotes award 1 credit to the patch author; downvotes deduct 1. You cannot review your own patches.",
      inputSchema: reviewInputSchema.shape,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    (params) =>
      toolHandler(async () => {
        return reviewService.reviewPatch(
          params.patchId,
          params.vote,
          params.comment,
          userId
        );
      })
  );

  // Tool: get_bug
  server.registerTool(
    "get_bug",
    {
      title: "Get Bug",
      description:
        "Retrieve a bug by ID with its patches (including code and scores) and reviews. Use after search_bugs to inspect details. Free, no credit cost.",
      inputSchema: getBugInputSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    (params) =>
      toolHandler(async () => {
        const bug = await bugService.getBugById(params.bugId);
        if (!bug) throw new Error("Bug not found");
        return bug;
      })
  );

  // Tool: get_my_credits
  server.registerTool(
    "get_my_credits",
    {
      title: "Get My Credits",
      description:
        "Check your current credit balance. Credits are earned by submitting patches (+5) and receiving upvotes (+1), and spent on searches (-1).",
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    () =>
      toolHandler(async () => {
        const credits = await getCredits(userId);
        return { credits };
      })
  );

  return server;
}
