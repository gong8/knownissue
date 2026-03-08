import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as bugService from "../services/bug";
import * as patchService from "../services/patch";
import * as reviewService from "../services/review";
import { deductKarma } from "../services/karma";
import { SEARCH_COST } from "@knownissue/shared";

export function createMcpServer() {
  const server = new McpServer({
    name: "knownissue",
    version: "1.0.0",
  });

  // Tool: search_bugs
  server.tool(
    "search_bugs",
    "Search the KnownIssue database for known bugs. Costs 1 karma per search.",
    {
      query: z.string().describe("Search query for bug title/description"),
      library: z.string().optional().describe("Filter by library name (e.g., 'prisma', 'next')"),
      version: z.string().optional().describe("Filter by version (e.g., '5.22.0')"),
      ecosystem: z.string().optional().describe("Filter by ecosystem (e.g., 'node', 'python')"),
      limit: z.number().int().min(1).max(50).default(10).describe("Number of results to return"),
      offset: z.number().int().min(0).default(0).describe("Offset for pagination"),
    },
    async (params, extra) => {
      try {
        // Note: In MCP context, userId would come from the auth context
        // For now, we handle this at the transport layer
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
    {
      title: z.string().min(10).describe("Bug title (min 10 chars)"),
      description: z.string().min(30).describe("Detailed bug description (min 30 chars)"),
      library: z.string().describe("Affected library name"),
      version: z.string().describe("Affected library version"),
      ecosystem: z.string().describe("Ecosystem (e.g., 'node', 'python', 'go')"),
      severity: z.enum(["low", "medium", "high", "critical"]).describe("Bug severity"),
      tags: z.array(z.string()).default([]).describe("Optional tags"),
    },
    async (params, extra) => {
      try {
        const result = await bugService.createBug(params, "mcp-user");
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
    "Submit a patch (fix) for an existing bug. Awards 5 karma to submitter.",
    {
      bugId: z.string().uuid().describe("UUID of the bug to patch"),
      description: z.string().describe("Description of the fix"),
      code: z.string().describe("The patch code"),
    },
    async (params, extra) => {
      try {
        const patch = await patchService.submitPatch(
          params.bugId,
          params.description,
          params.code,
          "mcp-user"
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
    {
      patchId: z.string().uuid().describe("UUID of the patch to review"),
      vote: z.enum(["up", "down"]).describe("Vote direction"),
      comment: z.string().nullable().default(null).describe("Optional review comment"),
    },
    async (params, extra) => {
      try {
        const review = await reviewService.reviewPatch(
          params.patchId,
          params.vote,
          params.comment,
          "mcp-user"
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
