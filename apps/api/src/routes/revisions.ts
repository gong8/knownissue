import { Hono } from "hono";
import { getIssueRevisions, getIssueRevision } from "../services/revision";
import type { AppEnv } from "../lib/types";

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

export { revisions };
