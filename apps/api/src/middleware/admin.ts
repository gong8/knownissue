import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../lib/types";

export const adminMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (user.role !== "admin") {
    throw new HTTPException(403, { message: "Admin access required" });
  }
  return next();
});
