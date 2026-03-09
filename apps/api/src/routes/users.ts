import { Hono } from "hono";
import { prisma } from "@knownissue/db";
import { authMiddleware } from "../middleware/auth";
import * as issueService from "../services/issue";
import * as patchService from "../services/patch";
import { getCredits, getUserTransactions } from "../services/credits";
import { getMyActivity } from "../services/activity";
import type { AppEnv } from "../lib/types";

const users = new Hono<AppEnv>();

users.use("/users/*", authMiddleware);

// GET /users/me — current user profile
users.get("/users/me", async (c) => {
  const user = c.get("user");
  const credits = await getCredits(user.id);
  return c.json({ ...user, credits });
});

// GET /users/me/stats — aggregated stats
users.get("/users/me/stats", async (c) => {
  const user = c.get("user");
  const [
    credits,
    issuesReported,
    issuesPatched,
    patchesSubmitted,
    patchesVerifiedFixed,
    verificationsGiven,
    verificationsFixed,
    verificationsNotFixed,
    verificationsPartial,
  ] = await Promise.all([
    getCredits(user.id),
    prisma.issue.count({ where: { reporterId: user.id } }),
    prisma.issue.count({
      where: { reporterId: user.id, status: { in: ["patched", "closed"] } },
    }),
    prisma.patch.count({ where: { submitterId: user.id } }),
    prisma.patch.count({
      where: {
        submitterId: user.id,
        verifications: { some: { outcome: "fixed" } },
      },
    }),
    prisma.verification.count({ where: { verifierId: user.id } }),
    prisma.verification.count({
      where: { verifierId: user.id, outcome: "fixed" },
    }),
    prisma.verification.count({
      where: { verifierId: user.id, outcome: "not_fixed" },
    }),
    prisma.verification.count({
      where: { verifierId: user.id, outcome: "partial" },
    }),
  ]);
  return c.json({
    credits,
    issuesReported,
    issuesPatched,
    patchesSubmitted,
    patchesVerifiedFixed,
    verificationsGiven,
    verificationsFixed,
    verificationsNotFixed,
    verificationsPartial,
  });
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

// GET /users/me/issues — user's issues
users.get("/users/me/issues", async (c) => {
  const user = c.get("user");
  const issues = await issueService.getUserIssues(user.id);
  return c.json(issues);
});

// GET /users/me/patches — user's patches
users.get("/users/me/patches", async (c) => {
  const user = c.get("user");
  const patches = await patchService.getUserPatches(user.id);
  return c.json(patches);
});

// GET /users/me/activity — contribution history and actionable items
users.get("/users/me/activity", async (c) => {
  const user = c.get("user");
  const type = c.req.query("type");
  const outcome = c.req.query("outcome");
  const rawLimit = parseInt(c.req.query("limit") || "20");
  const limit = Math.min(50, Math.max(1, rawLimit));
  const result = await getMyActivity(user.id, {
    type: type || undefined,
    outcome: outcome || undefined,
    limit,
  });
  return c.json(result);
});

export { users };
