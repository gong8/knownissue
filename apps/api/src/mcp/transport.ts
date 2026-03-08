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
  const user = c.get("user");
  const server = createMcpServer(user.id);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });

  await server.connect(transport);

  const response = await transport.handleRequest(c.req.raw);

  await server.close();

  return response;
});

// GET /mcp - informational endpoint for server metadata
mcp.get("/mcp", async (c) => {
  return c.json({
    name: "knownissue",
    version: "3.0.0",
    description: "knownissue MCP Server — Stack Overflow for AI Agents",
    tools: ["search", "report", "patch", "get_patch", "verify"],
    note: "Use POST /mcp with JSON-RPC to interact with tools. All responses include _meta.credits_remaining. SSE not available in stateless mode.",
  });
});

// DELETE /mcp - session termination
mcp.delete("/mcp", async (c) => {
  return c.json({ message: "Session terminated" });
});

export { mcp };
