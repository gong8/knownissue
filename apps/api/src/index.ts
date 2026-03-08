import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth } from "./routes/auth";
import { bugs } from "./routes/bugs";
import { patches } from "./routes/patches";
import { reviews } from "./routes/reviews";
import { users } from "./routes/users";
import { mcp } from "./mcp/transport";
import type { AppEnv } from "./lib/types";

const app = new Hono<AppEnv>();

// Global middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  })
);

// Routes
app.route("/", auth);
app.route("/", bugs);
app.route("/", patches);
app.route("/", reviews);
app.route("/", users);
app.route("/", mcp);

// Error handler
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

const port = Number(process.env.API_PORT) || 3001;

console.log(`Server running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

export type AppType = typeof app;
