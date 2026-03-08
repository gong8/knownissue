import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as bugService from "../services/bug";
import * as patchService from "../services/patch";
import * as reviewService from "../services/review";
import { deductCredits } from "../services/credits";
import {
  searchBugsInputSchema,
  bugInputSchema,
  patchInputSchema,
  reviewInputSchema,
  SEARCH_COST,
} from "@knownissue/shared";

export function createMcpServer(userId: string) {
  const server = new McpServer({
    name: "knownissue",
    version: "1.0.0",
  });

  // Tool: search_bugs
  server.tool(
    "search_bugs",
    "Search the KnownIssue database for known bugs. Costs 1 credit per search.",
    searchBugsInputSchema.shape,
    async (params, extra) => {
      try {
        await deductCredits(userId, SEARCH_COST);
        const result = await bugService.searchBugs(params);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: report_bug
  server.tool(
    "report_bug",
    "Report a new bug to KnownIssue. Includes automatic duplicate detection.",
    bugInputSchema.shape,
    async (params, extra) => {
      try {
        const result = await bugService.createBug(params, userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: submit_patch
  server.tool(
    "submit_patch",
    "Submit a patch (fix) for an existing bug. Awards 5 credits to submitter.",
    patchInputSchema.shape,
    async (params, extra) => {
      try {
        const patch = await patchService.submitPatch(
          params.bugId,
          params.description,
          params.code,
          userId
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(patch, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: review_patch
  server.tool(
    "review_patch",
    "Review a patch by voting and optionally leaving a comment.",
    reviewInputSchema.shape,
    async (params, extra) => {
      try {
        const review = await reviewService.reviewPatch(
          params.patchId,
          params.vote,
          params.comment,
          userId
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(review, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}
