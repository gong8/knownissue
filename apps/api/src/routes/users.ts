import { Hono } from "hono";
import { prisma } from "@knownissue/db";
import { authMiddleware } from "../middleware/auth";
import * as bugService from "../services/bug";
import * as patchService from "../services/patch";
import { getCredits } from "../services/credits";
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
  const [credits, bugsReported, patchesSubmitted, reviewsGiven] =
    await Promise.all([
      getCredits(user.id),
      prisma.bug.count({ where: { reporterId: user.id } }),
      prisma.patch.count({ where: { submitterId: user.id } }),
      prisma.review.count({ where: { reviewerId: user.id } }),
    ]);
  return c.json({ credits, bugsReported, patchesSubmitted, reviewsGiven });
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
