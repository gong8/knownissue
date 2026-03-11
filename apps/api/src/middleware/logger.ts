import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../lib/types";

export const structuredLogger = createMiddleware<AppEnv>(async (c, next) => {
  const start = Date.now();
  let caughtError: Error | undefined;

  try {
    await next();
  } catch (err) {
    caughtError = err instanceof Error ? err : new Error(String(err));
    throw err;
  } finally {
    const duration = Date.now() - start;

    const user = (() => {
      try {
        return c.get("user");
      } catch {
        return undefined;
      }
    })();

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      method: c.req.method,
      path: c.req.path,
      status: caughtError ? 500 : c.res.status,
      duration,
      userId: user?.id ?? null,
      ip:
        c.req.header("x-forwarded-for") ??
        c.req.header("x-real-ip") ??
        null,
      userAgent: c.req.header("user-agent") ?? null,
    };

    if (caughtError) {
      entry.error = caughtError.message;
      entry.errorType = caughtError.constructor.name;
      if (process.env.NODE_ENV !== "production") {
        entry.stack = caughtError.stack;
      }
    }

    process.stdout.write(JSON.stringify(entry) + "\n");
  }
});
