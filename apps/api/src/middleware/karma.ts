import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../lib/types";

export function requireKarma(cost: number) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      throw new HTTPException(401, { message: "Authentication required" });
    }

    if (user.karma < cost) {
      throw new HTTPException(403, {
        message: `Insufficient karma. Required: ${cost}, Current: ${user.karma}`,
      });
    }

    return next();
  });
}
