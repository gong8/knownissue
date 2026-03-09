import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { getIssueRevisions, getIssueRevision, rollbackIssue } from "../services/revision";
import type { AppEnv } from "../lib/types";

const rollbackIssueInputSchema = z.object({
  issueId: z.uuid({ message: "Invalid issue ID" }),
  version: z.number().int().min(1),
});

const revisions = new Hono<AppEnv>();

// GET /issues/:issueId/revisions — list revisions (public)
revisions.get("/issues/:issueId/revisions", async (c) => {
  const issueId = c.req.param("issueId");
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") || "10")));
  const offset = Math.max(0, parseInt(c.req.query("offset") || "0"));

  const result = await getIssueRevisions(issueId, { limit, offset });
  return c.json(result);
});

// GET /issues/:issueId/revisions/:version — get specific revision (public)
revisions.get("/issues/:issueId/revisions/:version", async (c) => {
  const issueId = c.req.param("issueId");
  const version = parseInt(c.req.param("version"));

  if (isNaN(version) || version < 1) {
    return c.json({ error: "Invalid version number" }, 400);
  }

  const revision = await getIssueRevision(issueId, version);
  if (!revision) {
    return c.json({ error: "Revision not found" }, 404);
  }

  return c.json(revision);
});

// POST /issues/:issueId/rollback — rollback to version (auth: reporter or admin)
revisions.post("/issues/:issueId/rollback", authMiddleware, async (c) => {
  const user = c.get("user");
  const issueId = c.req.param("issueId");
  const body = await c.req.json();

  try {
    const parsed = rollbackIssueInputSchema.parse({ issueId, ...body });
    const issue = await rollbackIssue(parsed.issueId, parsed.version, user.id, user.role);
    return c.json(issue);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Issue not found") return c.json({ error: error.message }, 404);
      if (error.message.includes("not found")) return c.json({ error: error.message }, 404);
      if (error.message.includes("Only the reporter")) return c.json({ error: error.message }, 403);
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

export { revisions };
