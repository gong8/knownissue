import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
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
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
    "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
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

  // Inject CORS headers on ALL responses, including auth errors.
  // Browser clients need CORS on 401 to read WWW-Authenticate and start OAuth.
  // We catch HTTPExceptions from downstream (e.g. auth middleware) because
  // Hono propagates them through await next() — code after next() never runs.
  const headers = corsHeaders(origin);
  try {
    await next();
    for (const [key, value] of Object.entries(headers)) {
      c.res.headers.set(key, value);
    }
  } catch (err) {
    if (err instanceof HTTPException) {
      const errorResponse = err.getResponse();
      const newHeaders = new Headers(errorResponse.headers);
      for (const [key, value] of Object.entries(headers)) {
        newHeaders.set(key, value);
      }
      return new Response(errorResponse.body, {
        status: errorResponse.status,
        headers: newHeaders,
      });
    }
    throw err;
  }
});

// Stateless mode: only POST is meaningful.
// GET (SSE stream) and DELETE (session termination) have no purpose
// without persistent sessions. All non-POST methods return 405 per spec.
mcp.use("/mcp", async (c, next) => {
  if (c.req.method !== "POST" && c.req.method !== "OPTIONS") {
    return c.json(
      { error: "Method not allowed: server operates in stateless mode" },
      { status: 405, headers: { Allow: "POST" } }
    );
  }
  return next();
});

// MCP endpoint - requires auth (returns OAuth-compliant 401)
mcp.use("/mcp", mcpAuthMiddleware);

// MCP handler — SDK handles Accept/Content-Type validation (406/415),
// protocol version negotiation, and JSON-RPC message parsing.
// Uses app.all() so the SDK can return proper 405 for methods that slip
// past the stateless-mode middleware (e.g. future spec changes).
mcp.all("/mcp", async (c) => {
  const user = c.get("user");
  const server = createMcpServer(user.id);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(c.req.raw);
  } finally {
    await server.close();
  }
});

export { mcp };
