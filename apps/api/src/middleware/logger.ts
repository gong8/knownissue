import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../lib/types";

export const structuredLogger = createMiddleware<AppEnv>(async (c, next) => {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;

  const user = (() => {
    try {
      return c.get("user");
    } catch {
      return undefined;
    }
  })();

  const error = (() => {
    try {
      return c.get("_error" as never) as Error | undefined;
    } catch {
      return undefined;
    }
  })();

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration,
    userId: user?.id ?? null,
    ip:
      c.req.header("x-forwarded-for") ??
      c.req.header("x-real-ip") ??
      null,
    userAgent: c.req.header("user-agent") ?? null,
  };

  if (error) {
    entry.error = error.message;
    entry.errorType = error.constructor.name;
    if (process.env.NODE_ENV !== "production") {
      entry.stack = error.stack;
    }
  }

  process.stdout.write(JSON.stringify(entry) + "\n");
});
