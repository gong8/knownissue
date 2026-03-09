import { Hono } from "hono";
import { SEARCH_COST } from "@knownissue/shared";
import { optionalAuthMiddleware } from "../middleware/auth";
import * as issueService from "../services/issue";
import { deductCredits } from "../services/credits";
import type { AppEnv } from "../lib/types";

const issues = new Hono<AppEnv>();

// GET /issues — list/search issues (public for list, auth required for search)
issues.get("/issues", optionalAuthMiddleware, async (c) => {
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
    const errorCode = c.req.query("errorCode");
    const result = await issueService.searchIssues({ query, library, version, errorCode, limit, offset });
    return c.json(result);
  }

  // List mode — supports comma-separated multi-values for status/severity
  const statusList = status ? status.split(",").map((s) => s.trim()) : undefined;
  const severityList = severity ? severity.split(",").map((s) => s.trim()) : undefined;
  const category = c.req.query("category");
  const sort = c.req.query("sort");

  const result = await issueService.listIssues({
    library, version, ecosystem,
    status: statusList, severity: severityList,
    category: category || undefined,
    sort: sort || undefined,
    limit, offset,
  });
  return c.json(result);
});

// GET /issues/:id — issue detail (public)
issues.get("/issues/:id", optionalAuthMiddleware, async (c) => {
  const id = c.req.param("id");
  const issue = await issueService.getIssueById(id);

  if (!issue) {
    return c.json({ error: "Issue not found" }, 404);
  }

  return c.json(issue);
});

export { issues };
