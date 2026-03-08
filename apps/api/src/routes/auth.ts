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

// GET /stats — public aggregate counts (no auth required)
auth.get("/stats", async (c) => {
  const [bugs, patches, users] = await Promise.all([
    prisma.bug.count(),
    prisma.patch.count(),
    prisma.user.count(),
  ]);
  return c.json({ bugs, patches, users });
});

export { auth };
