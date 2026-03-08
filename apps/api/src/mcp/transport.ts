import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "./server";
import { authMiddleware } from "../middleware/auth";
import type { AppEnv } from "../lib/types";

const mcp = new Hono<AppEnv>();

// MCP endpoint - requires auth
mcp.use("/mcp/*", authMiddleware);
mcp.use("/mcp", authMiddleware);

// POST /mcp - handle MCP JSON-RPC requests
mcp.post("/mcp", async (c) => {
  const server = createMcpServer();

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });

  await server.connect(transport);

  const response = await transport.handleRequest(c.req.raw);

  await server.close();

  return response;
});

// GET /mcp - SSE endpoint for server-initiated messages
mcp.get("/mcp", async (c) => {
  return c.json({
    message: "MCP server is running. Use POST for tool calls.",
    tools: ["search_bugs", "report_bug", "submit_patch", "review_patch"],
  });
});

// DELETE /mcp - session termination
mcp.delete("/mcp", async (c) => {
  return c.json({ message: "Session terminated" });
});

export { mcp };
