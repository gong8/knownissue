import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { rollbackBugInputSchema } from "@knownissue/shared";
import { getBugRevisions, getBugRevision, rollbackBug } from "../services/revision";
import type { AppEnv } from "../lib/types";

const revisions = new Hono<AppEnv>();

// GET /bugs/:bugId/revisions — list revisions (public)
revisions.get("/bugs/:bugId/revisions", async (c) => {
  const bugId = c.req.param("bugId");
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") || "10")));
  const offset = Math.max(0, parseInt(c.req.query("offset") || "0"));

  const result = await getBugRevisions(bugId, { limit, offset });
  return c.json(result);
});

// GET /bugs/:bugId/revisions/:version — get specific revision (public)
revisions.get("/bugs/:bugId/revisions/:version", async (c) => {
  const bugId = c.req.param("bugId");
  const version = parseInt(c.req.param("version"));

  if (isNaN(version) || version < 1) {
    return c.json({ error: "Invalid version number" }, 400);
  }

  const revision = await getBugRevision(bugId, version);
  if (!revision) {
    return c.json({ error: "Revision not found" }, 404);
  }

  return c.json(revision);
});

// POST /bugs/:bugId/rollback — rollback to version (auth: reporter or admin)
revisions.post("/bugs/:bugId/rollback", authMiddleware, async (c) => {
  const user = c.get("user");
  const bugId = c.req.param("bugId");
  const body = await c.req.json();

  try {
    const parsed = rollbackBugInputSchema.parse({ bugId, ...body });
    const bug = await rollbackBug(parsed.bugId, parsed.version, user.id, user.role);
    return c.json(bug);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Bug not found") return c.json({ error: error.message }, 404);
      if (error.message.includes("not found")) return c.json({ error: error.message }, 404);
      if (error.message.includes("Only the reporter")) return c.json({ error: error.message }, 403);
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

export { revisions };
