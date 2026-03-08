import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { rateLimiter } from "hono-rate-limiter";
import { createMcpServer } from "./server";
import { mcpAuthMiddleware } from "../middleware/auth";
import type { AppEnv } from "../lib/types";

const mcp = new Hono<AppEnv>();

function getAllowedOrigins(): string[] {
  return process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : ["http://localhost:3000"];
}

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

// CORS + Origin validation per MCP spec:
// - Non-browser clients (no Origin header) are allowed through
// - Browser clients must have an allowed Origin
// - OPTIONS preflight is handled here before auth middleware
mcp.use("/mcp", async (c, next) => {
  const origin = c.req.header("Origin");

  if (!origin) return next();

  const allowed = getAllowedOrigins();
  if (!allowed.includes(origin)) {
    return c.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "Forbidden: invalid origin" }, id: null },
      403
    );
  }

  // OPTIONS preflight — return CORS headers immediately (before auth)
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
        "Access-Control-Expose-Headers": "Mcp-Session-Id",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  return next();
});

// Accept header validation per MCP spec (2025-06-18):
// POST requests SHOULD accept both application/json and text/event-stream.
// We are permissive: missing Accept or wildcard */* is allowed.
// Only reject when Accept is explicitly present and doesn't cover both types.
mcp.use("/mcp", async (c, next) => {
  if (c.req.method === "POST") {
    const accept = c.req.header("Accept");
    if (accept !== undefined) {
      const hasWildcard = accept.includes("*/*");
      if (!hasWildcard) {
        const hasJson = accept.includes("application/json");
        const hasSSE = accept.includes("text/event-stream");
        if (!hasJson || !hasSSE) {
          return c.json(
            {
              jsonrpc: "2.0",
              error: {
                code: -32600,
                message: "Not Acceptable: Accept header must include both application/json and text/event-stream",
              },
              id: null,
            },
            406
          );
        }
      }
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

  // Add CORS headers for browser clients with valid Origin
  const origin = c.req.header("Origin");
  if (origin) {
    const allowed = getAllowedOrigins();
    if (allowed.includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Expose-Headers", "Mcp-Session-Id");
    }
  }

  return response;
});

export { mcp };
