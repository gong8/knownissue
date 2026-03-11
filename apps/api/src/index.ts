import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { structuredLogger } from "./middleware/logger";
import { rateLimiter } from "hono-rate-limiter";
import { auth } from "./routes/auth";
import { issues } from "./routes/issues";
import { patches } from "./routes/patches";
import { verifications } from "./routes/verifications";
import { users } from "./routes/users";
import { revisions } from "./routes/revisions";
import { audit } from "./routes/audit";
import { feed } from "./routes/feed";
import { mcp } from "./mcp/transport";
import { metadata } from "./oauth/metadata";
import { register } from "./oauth/register";
import { authorize } from "./oauth/authorize";
import { token } from "./oauth/token";
import { revoke } from "./oauth/revoke";
import { HTTPException } from "hono/http-exception";
import type { Context, Next } from "hono";
import type { AppEnv } from "./lib/types";

// Validate required environment variables
const required = ["DATABASE_URL", "CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY"] as const;
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

if (!process.env.OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY not set — vector search will fall back to text search");
}

const app = new Hono<AppEnv>();

// Security headers
app.use("*", async (c, next) => {
  await next();
  c.header("X-Frame-Options", "DENY");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
});

// Logger
app.use("*", structuredLogger);

// CORS (configurable via environment)
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
  : ["http://localhost:3000"];

const corsHandler = cors({
  origin: corsOrigins,
  credentials: true,
});
app.use("*", async (c, next) => {
  if (c.req.path === "/mcp") return next();
  return corsHandler(c, next);
});

// Rate limiting (100 requests per 15 minutes per IP — MCP has its own higher limit)
const limiter = rateLimiter<AppEnv>({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  keyGenerator: (ctx) =>
    ctx.req.header("x-forwarded-for") ?? ctx.req.header("x-real-ip") ?? "unknown",
});
app.use("*", async (c, next) => {
  if (c.req.path === "/mcp" || c.req.path === "/health") return next();
  return limiter(c, next);
});

// Favicon — inline SVG so the API doesn't 404 on browser requests
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" fill="#0a0a0a"/><text x="16" y="16" text-anchor="middle" dominant-baseline="central" font-family="'IBM Plex Mono','SF Mono','Fira Code',monospace" font-size="14" font-weight="600" fill="#e5e5e5" letter-spacing="-0.5">[ki]</text></svg>`;
app.get("/favicon.ico", (c) => {
  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "public, max-age=604800, immutable");
  return c.body(FAVICON_SVG);
});

// Routes
app.route("/", auth);
app.route("/", issues);
app.route("/", patches);
app.route("/", verifications);
app.route("/", users);
app.route("/", revisions);
app.route("/", audit);
app.route("/", feed);
app.route("/", mcp);

// HTTPS enforcement for OAuth endpoints in production (MCP spec requirement)
// Behind Cloudflare, the ALB receives HTTP so x-forwarded-proto is "http".
// Check CF-Visitor header (set by Cloudflare) to detect the client's actual scheme.
if (process.env.NODE_ENV === "production") {
  const httpsOnly = async (c: Context, next: Next) => {
    const proto = c.req.header("x-forwarded-proto") || c.req.header("x-forwarded-scheme") || "http";
    const cfVisitor = c.req.header("cf-visitor");
    const isHttps = proto === "https" || (cfVisitor != null && cfVisitor.includes('"https"'));
    if (!isHttps) {
      return c.json({ error: "HTTPS required for OAuth endpoints" }, 403);
    }
    return next();
  };
  app.use("/.well-known/*", httpsOnly);
  app.use("/oauth/*", httpsOnly);
  app.use("/authorize", httpsOnly);
  app.use("/token", httpsOnly);
  app.use("/register", httpsOnly);
  app.use("/revoke", httpsOnly);
}

// OAuth 2.1 endpoints
app.route("/", metadata);
app.route("/", register);
app.route("/", authorize);
app.route("/oauth/token", token);
app.route("/", revoke);

// OAuth fallback routes at MCP spec default paths (2025-03-26)
// Clients that skip metadata discovery MUST fall back to /authorize, /token, /register, /revoke
app.get("/authorize", (c) => {
  const url = new URL(c.req.url);
  url.pathname = "/oauth/authorize";
  return c.redirect(url.toString(), 302);
});
app.route("/token", token);
app.post("/register", async (c) => {
  const url = new URL(c.req.url);
  url.pathname = "/oauth/register";
  const forwarded = new Request(url.toString(), c.req.raw);
  return app.fetch(forwarded);
});
app.post("/revoke", async (c) => {
  const url = new URL(c.req.url);
  url.pathname = "/oauth/revoke";
  const forwarded = new Request(url.toString(), c.req.raw);
  return app.fetch(forwarded);
});

// Error handler — preserve HTTPException status codes, hide internals in production
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  // Attach error to context so the structured logger can pick it up
  c.set("_error" as never, err as never);

  // Structured error log to stderr
  const errorEntry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: "error",
    method: c.req.method,
    path: c.req.path,
    error: err.message,
    errorType: err.constructor.name,
  };
  if (process.env.NODE_ENV !== "production") {
    errorEntry.stack = err.stack;
  }
  process.stderr.write(JSON.stringify(errorEntry) + "\n");

  if (process.env.NODE_ENV === "production") {
    return c.json({ error: "Internal server error" }, 500);
  }
  return c.json({ error: err.message }, 500);
});

const port = Number(process.env.API_PORT) || 3001;

console.info(`Server running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

export type AppType = typeof app;
