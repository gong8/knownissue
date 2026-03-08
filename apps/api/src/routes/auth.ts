import { Hono } from "hono";
import { prisma } from "@knownissue/db";

const auth = new Hono();

auth.get("/health", async (c) => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return c.json({ status: "ok", db: "connected" });
  } catch {
    return c.json({ status: "degraded", db: "disconnected" }, 503);
  }
});

export { auth };
