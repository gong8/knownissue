import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { rateLimiter } from "hono-rate-limiter";
import { auth } from "./routes/auth";
import { bugs } from "./routes/bugs";
import { patches } from "./routes/patches";
import { reviews } from "./routes/reviews";
import { users } from "./routes/users";
import { mcp } from "./mcp/transport";
import type { AppEnv } from "./lib/types";

// Validate required environment variables
const required = ["DATABASE_URL", "CLERK_SECRET_KEY"] as const;
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
app.route("/", reviews);
app.route("/", users);
app.route("/", mcp);

// Error handler — hide internals in production
app.onError((err, c) => {
  console.error(err);
  if (process.env.NODE_ENV === "production") {
    return c.json({ error: "Internal server error" }, 500);
  }
  return c.json({ error: err.message }, 500);
});

const port = Number(process.env.API_PORT) || 3001;

console.log(`Server running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

export type AppType = typeof app;
