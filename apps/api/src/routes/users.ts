import { Hono } from "hono";
import { prisma } from "@knownissue/db";
import { authMiddleware } from "../middleware/auth";
import * as bugService from "../services/bug";
import * as patchService from "../services/patch";
import { getCredits, getUserTransactions } from "../services/credits";
import type { AppEnv } from "../lib/types";

const users = new Hono<AppEnv>();

users.use("/*", authMiddleware);

// GET /users/me — current user profile
users.get("/users/me", async (c) => {
  const user = c.get("user");
  const credits = await getCredits(user.id);
  return c.json({ ...user, credits });
});

// GET /users/me/stats — aggregated stats
users.get("/users/me/stats", async (c) => {
  const user = c.get("user");
  const [credits, bugsReported, patchesSubmitted, verificationsGiven] =
    await Promise.all([
      getCredits(user.id),
      prisma.bug.count({ where: { reporterId: user.id } }),
      prisma.patch.count({ where: { submitterId: user.id } }),
      prisma.verification.count({ where: { verifierId: user.id } }),
    ]);
  return c.json({ credits, bugsReported, patchesSubmitted, verificationsGiven });
});

// GET /users/me/transactions — credit history
users.get("/users/me/transactions", async (c) => {
  const user = c.get("user");
  const rawPage = parseInt(c.req.query("page") || "1");
  const rawLimit = parseInt(c.req.query("limit") || "20");
  const page = Math.max(1, rawPage);
  const limit = Math.min(50, Math.max(1, rawLimit));
  const offset = (page - 1) * limit;
  const result = await getUserTransactions(user.id, { limit, offset });
  return c.json(result);
});

// GET /users/me/bugs — user's bugs
users.get("/users/me/bugs", async (c) => {
  const user = c.get("user");
  const bugs = await bugService.getUserBugs(user.id);
  return c.json(bugs);
});

// GET /users/me/patches — user's patches
users.get("/users/me/patches", async (c) => {
  const user = c.get("user");
  const patches = await patchService.getUserPatches(user.id);
  return c.json(patches);
});

export { users };
