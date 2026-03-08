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

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  };
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

// CORS + Origin validation per MCP spec (2025-06-18):
// - Non-browser clients (no Origin header) are allowed through
// - Browser clients must have an allowed Origin
// - OPTIONS preflight returns immediately (before auth)
// - CORS headers are injected on ALL responses (including auth errors)
//   so browser clients can read WWW-Authenticate for the OAuth flow
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
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Process downstream, then inject CORS headers on the response
  await next();
  const headers = corsHeaders(origin);
  for (const [key, value] of Object.entries(headers)) {
    c.res.headers.set(key, value);
  }
});

// Stateless mode: only POST is meaningful.
// GET (SSE stream) and DELETE (session termination) have no purpose
// without persistent sessions. Return 405 per spec allowance.
mcp.use("/mcp", async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "DELETE") {
    return c.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed: server operates in stateless mode" },
        id: null,
      },
      { status: 405, headers: { Allow: "POST, OPTIONS" } }
    );
  }
  return next();
});

// MCP endpoint - requires auth (returns OAuth-compliant 401)
mcp.use("/mcp", mcpAuthMiddleware);

// POST handler — SDK handles Accept/Content-Type validation (406/415)
mcp.post("/mcp", async (c) => {
  const user = c.get("user");
  const server = createMcpServer(user.id);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
    enableJsonResponse: true,
  });

  await server.connect(transport);

  const response = await transport.handleRequest(c.req.raw);

  await server.close();

  return response;
});

export { mcp };
