import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../lib/types";

export function requireCredits(cost: number) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      throw new HTTPException(401, { message: "Authentication required" });
    }

    if (user.credits < cost) {
      throw new HTTPException(403, {
        message: `Insufficient credits. Required: ${cost}, Current: ${user.credits}`,
      });
    }

    return next();
  });
}
