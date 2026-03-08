import { Hono } from "hono";
import { bugInputSchema, SEARCH_COST } from "@knownissue/shared";
import { authMiddleware } from "../middleware/auth";
import * as bugService from "../services/bug";
import { deductCredits } from "../services/credits";
import type { AppEnv } from "../lib/types";

const bugs = new Hono<AppEnv>();

// All routes require auth
bugs.use("/*", authMiddleware);

// GET /bugs — list/search bugs
bugs.get("/bugs", async (c) => {
  const query = c.req.query("q");
  const library = c.req.query("library");
  const version = c.req.query("version");
  const ecosystem = c.req.query("ecosystem");
  const status = c.req.query("status");
  const severity = c.req.query("severity");
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = (page - 1) * limit;

  if (query) {
    // Search mode — costs credits
    const user = c.get("user");
    try {
      await deductCredits(user.id, SEARCH_COST);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Insufficient credits" }, 403);
    }
    const result = await bugService.searchBugs({ query, library, version, ecosystem, limit, offset });
    return c.json(result);
  }

  // List mode — no credit cost
  const result = await bugService.listBugs({ library, version, ecosystem, status, severity, limit, offset });
  return c.json(result);
});

// GET /bugs/:id — bug detail
bugs.get("/bugs/:id", async (c) => {
  const id = c.req.param("id");
  const bug = await bugService.getBugById(id);

  if (!bug) {
    return c.json({ error: "Bug not found" }, 404);
  }

  return c.json(bug);
});

// POST /bugs — create bug
bugs.post("/bugs", async (c) => {
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

export { bugs };
