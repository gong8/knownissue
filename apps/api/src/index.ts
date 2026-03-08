import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { rateLimiter } from "hono-rate-limiter";
import { auth } from "./routes/auth";
import { bugs } from "./routes/bugs";
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
import { HTTPException } from "hono/http-exception";
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
app.use("*", logger());

// CORS (configurable via environment)
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
  : ["http://localhost:3000"];

app.use(
  "*",
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);

// Rate limiting (100 requests per 15 minutes per IP)
app.use(
  "*",
  rateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    keyGenerator: (c) =>
      c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
  })
);

// Routes
app.route("/", auth);
app.route("/", bugs);
app.route("/", patches);
app.route("/", verifications);
app.route("/", users);
app.route("/", revisions);
app.route("/", audit);
app.route("/", feed);
app.route("/", mcp);

// OAuth 2.1 endpoints
app.route("/", metadata);
app.route("/", register);
app.route("/", authorize);
app.route("/oauth/token", token);

// Error handler — preserve HTTPException status codes, hide internals in production
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  console.error(err);
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
