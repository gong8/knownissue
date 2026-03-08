import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { rateLimiter } from "hono-rate-limiter";
import { createMcpServer } from "./server";
import { mcpAuthMiddleware } from "../middleware/auth";
import type { AppEnv } from "../lib/types";

const mcp = new Hono<AppEnv>();

// MCP rate limit (higher than REST — abuse gated by credits)
mcp.use(
  "/mcp",
  rateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    keyGenerator: (c) =>
      c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
  })
);

// Origin validation per MCP spec: allow missing (non-browser), block unexpected
mcp.use("/mcp", async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin) {
    const allowed = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
      : ["http://localhost:3000"];
    if (!allowed.includes(origin)) {
      return c.json({ error: "Forbidden: invalid origin" }, 403);
    }
  }
  return next();
});

// Accept header validation per MCP spec (2025-03-26):
// POST requests MUST accept both application/json and text/event-stream
mcp.use("/mcp", async (c, next) => {
  if (c.req.method === "POST") {
    const accept = c.req.header("Accept") ?? "";
    if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
      return c.json(
        {
          error: "Not Acceptable: Accept header must include both application/json and text/event-stream",
        },
        406
      );
    }
  }
  return next();
});

// MCP endpoint - requires auth (returns OAuth-compliant 401)
mcp.use("/mcp", mcpAuthMiddleware);

// All methods routed through the MCP SDK transport (handles POST, GET, DELETE)
mcp.all("/mcp", async (c) => {
  const user = c.get("user");
  const server = createMcpServer(user.id);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
    enableJsonResponse: true, // JSON responses for POST (not SSE)
  });

  await server.connect(transport);

  const response = await transport.handleRequest(c.req.raw);

  await server.close();

  return response;
});

export { mcp };
