import { Hono } from "hono";
import { bugInputSchema, bugUpdateSchema, SEARCH_COST } from "@knownissue/shared";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth";
import * as bugService from "../services/bug";
import { deductCredits } from "../services/credits";
import type { AppEnv } from "../lib/types";

const bugs = new Hono<AppEnv>();

// GET /bugs — list/search bugs (public for list, auth required for search)
bugs.get("/bugs", optionalAuthMiddleware, async (c) => {
  const query = c.req.query("q");
  const library = c.req.query("library");
  const version = c.req.query("version");
  const ecosystem = c.req.query("ecosystem");
  const status = c.req.query("status");
  const severity = c.req.query("severity");
  const rawPage = parseInt(c.req.query("page") || "1");
  const rawLimit = parseInt(c.req.query("limit") || "20");

  if (isNaN(rawPage) || isNaN(rawLimit)) {
    return c.json({ error: "Invalid pagination parameters" }, 400);
  }

  const page = Math.max(1, rawPage);
  const limit = Math.min(50, Math.max(1, rawLimit));
  const offset = (page - 1) * limit;

  if (query) {
    // Search mode — costs credits, requires auth
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required for search" }, 401);
    }
    try {
      await deductCredits(user.id, SEARCH_COST, "search");
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Insufficient credits" }, 403);
    }
    const result = await bugService.searchBugs({ query, library, version, ecosystem, limit, offset });
    return c.json(result);
  }

  // List mode — supports comma-separated multi-values for status/severity
  const statusList = status ? status.split(",").map((s) => s.trim()) : undefined;
  const severityList = severity ? severity.split(",").map((s) => s.trim()) : undefined;

  const result = await bugService.listBugs({ library, version, ecosystem, status: statusList, severity: severityList, limit, offset });
  return c.json(result);
});

// GET /bugs/:id — bug detail (public)
bugs.get("/bugs/:id", optionalAuthMiddleware, async (c) => {
  const id = c.req.param("id");
  const bug = await bugService.getBugById(id);

  if (!bug) {
    return c.json({ error: "Bug not found" }, 404);
  }

  return c.json(bug);
});

// POST /bugs — create bug (auth required)
bugs.post("/bugs", authMiddleware, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  try {
    const parsed = bugInputSchema.parse(body);
    const result = await bugService.createBug(parsed, user.id);
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

// PATCH /bugs/:id — update bug (reporter only, auth required)
bugs.patch("/bugs/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();

  try {
    const bug = await bugService.updateBug(id, body, user.id);
    return c.json(bug);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Bug not found") return c.json({ error: error.message }, 404);
      if (error.message.includes("Only the reporter")) return c.json({ error: error.message }, 403);
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

// DELETE /bugs/:id — delete bug (reporter only, auth required)
bugs.delete("/bugs/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  try {
    await bugService.deleteBug(id, user.id);
    return c.json({ ok: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Bug not found") return c.json({ error: error.message }, 404);
      if (error.message.includes("Only the reporter")) return c.json({ error: error.message }, 403);
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

export { bugs };
