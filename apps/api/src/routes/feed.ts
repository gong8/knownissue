import { Hono } from "hono";
import { prisma } from "@knownissue/db";
import type { AppEnv } from "../lib/types.js";

const feed = new Hono<AppEnv>();

interface FeedRow {
  id: string;
  type: string;
  summary: string;
  library: string;
  version: string;
  severity: string;
  ecosystem: string;
  status: string;
  created_at: Date;
  actor: string;
  actor_avatar: string | null;
  issue_id: string;
  issue_title: string;
}

// GET /feed — public activity stream (issues, patches, verifications)
feed.get("/feed", async (c) => {
  const typeParam = c.req.query("type");
  const severityParam = c.req.query("severity");
  const ecosystemParam = c.req.query("ecosystem");
  const rangeParam = c.req.query("range") || "all";
  const rawPage = parseInt(c.req.query("page") || "1");
  const rawLimit = parseInt(c.req.query("limit") || "20");

  if (isNaN(rawPage) || isNaN(rawLimit)) {
    return c.json({ error: "Invalid pagination parameters" }, 400);
  }

  const page = Math.max(1, rawPage);
  const limit = Math.min(50, Math.max(1, rawLimit));
  const offset = (page - 1) * limit;

  // Parse comma-separated filter values
  const allowedTypes = new Set(["issue", "patch", "verification"]);
  const types = typeParam
    ? typeParam.split(",").map((t) => t.trim()).filter((t) => allowedTypes.has(t))
    : ["issue", "patch", "verification"];

  if (types.length === 0) {
    return c.json({ error: "Invalid type filter. Allowed: issue, patch, verification" }, 400);
  }

  const allowedSeverities = new Set(["low", "medium", "high", "critical"]);
  const severities = severityParam
    ? severityParam.split(",").map((s) => s.trim()).filter((s) => allowedSeverities.has(s))
    : null;

  if (severityParam && (!severities || severities.length === 0)) {
    return c.json({ error: "Invalid severity filter. Allowed: low, medium, high, critical" }, 400);
  }

  const ecosystems = ecosystemParam
    ? ecosystemParam.split(",").map((e) => e.trim())
    : null;

  // Compute date boundary from range filter
  const now = new Date();
  let dateStart: Date | null = null;
  switch (rangeParam) {
    case "today": {
      dateStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    }
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      dateStart = d;
      break;
    }
    case "month": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      dateStart = d;
      break;
    }
    case "all":
      break;
    default:
      return c.json({ error: "Invalid range. Allowed: today, week, month, all" }, 400);
  }

  // Build the query dynamically with parameterized values.
  // Parameters are indexed sequentially ($1, $2, ...) across all UNION branches.
  // The count query uses the WHERE-clause params only; the data query appends LIMIT/OFFSET.
  const params: unknown[] = [];
  let paramIndex = 1;

  const addParam = (value: unknown): string => {
    params.push(value);
    return `$${paramIndex++}`;
  };

  // Build WHERE clause for a single UNION branch.
  // Each branch gets its own copy of filter params so $N indices stay unique.
  const buildWhereClause = (
    createdAtCol: string,
    severityCol: string,
    ecosystemCol: string,
  ): string => {
    const conditions: string[] = [];

    if (dateStart) {
      conditions.push(`${createdAtCol} >= ${addParam(dateStart)}`);
    }

    if (severities && severities.length > 0) {
      const placeholders = severities.map((s) => addParam(s));
      conditions.push(`${severityCol}::text IN (${placeholders.join(", ")})`);
    }

    if (ecosystems && ecosystems.length > 0) {
      const placeholders = ecosystems.map((e) => addParam(e));
      conditions.push(`${ecosystemCol} IN (${placeholders.join(", ")})`);
    }

    return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  };

  // Build UNION parts
  const unionParts: string[] = [];

  if (types.includes("issue")) {
    const where = buildWhereClause(
      "b.\"createdAt\"",
      "b.\"severity\"",
      "b.\"ecosystem\"",
    );
    unionParts.push(`
      SELECT
        b."id",
        'issue' AS "type",
        COALESCE(b."title", LEFT(b."description", 120)) AS "summary",
        b."library",
        b."version",
        b."severity"::text AS "severity",
        b."ecosystem",
        b."status"::text AS "status",
        b."createdAt" AS "created_at",
        LEFT(u."id", 8) AS "actor",
        u."avatarUrl" AS "actor_avatar",
        b."id" AS "issue_id",
        COALESCE(b."title", '') AS "issue_title"
      FROM "Bug" b
      JOIN "User" u ON u."id" = b."reporterId"
      ${where}
    `);
  }

  if (types.includes("patch")) {
    const where = buildWhereClause(
      "p.\"createdAt\"",
      "bg.\"severity\"",
      "bg.\"ecosystem\"",
    );
    unionParts.push(`
      SELECT
        p."id",
        'patch' AS "type",
        LEFT(p."description", 120) AS "summary",
        bg."library",
        bg."version",
        bg."severity"::text AS "severity",
        bg."ecosystem",
        bg."status"::text AS "status",
        p."createdAt" AS "created_at",
        LEFT(u."id", 8) AS "actor",
        u."avatarUrl" AS "actor_avatar",
        bg."id" AS "issue_id",
        COALESCE(bg."title", '') AS "issue_title"
      FROM "Patch" p
      JOIN "User" u ON u."id" = p."submitterId"
      JOIN "Bug" bg ON bg."id" = p."bugId"
      ${where}
    `);
  }

  if (types.includes("verification")) {
    const where = buildWhereClause(
      "v.\"createdAt\"",
      "bg.\"severity\"",
      "bg.\"ecosystem\"",
    );
    unionParts.push(`
      SELECT
        v."id",
        'verification' AS "type",
        CONCAT(v."outcome"::text, ': ', COALESCE(v."note", '')) AS "summary",
        bg."library",
        bg."version",
        bg."severity"::text AS "severity",
        bg."ecosystem",
        bg."status"::text AS "status",
        v."createdAt" AS "created_at",
        LEFT(u."id", 8) AS "actor",
        u."avatarUrl" AS "actor_avatar",
        bg."id" AS "issue_id",
        COALESCE(bg."title", '') AS "issue_title"
      FROM "Verification" v
      JOIN "User" u ON u."id" = v."verifierId"
      JOIN "Patch" p ON p."id" = v."patchId"
      JOIN "Bug" bg ON bg."id" = p."bugId"
      ${where}
    `);
  }

  const unionQuery = unionParts.join("\nUNION ALL\n");

  // Snapshot the number of WHERE-clause params before adding LIMIT/OFFSET
  const whereParamCount = params.length;

  // Data query with pagination
  const limitPlaceholder = addParam(limit);
  const offsetPlaceholder = addParam(offset);
  const dataQuery = `
    SELECT * FROM (${unionQuery}) AS "feed"
    ORDER BY "created_at" DESC
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
  `;

  // Count query (uses same WHERE-clause params, no LIMIT/OFFSET)
  const countQuery = `SELECT COUNT(*) AS "total" FROM (${unionQuery}) AS "feed"`;

  try {
    const [countResult, items] = await Promise.all([
      prisma.$queryRawUnsafe<[{ total: bigint }]>(countQuery, ...params.slice(0, whereParamCount)),
      prisma.$queryRawUnsafe<FeedRow[]>(dataQuery, ...params),
    ]);

    const total = Number(countResult[0]?.total ?? 0);

    return c.json({
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        summary: item.summary,
        library: item.library,
        version: item.version,
        severity: item.severity,
        ecosystem: item.ecosystem,
        status: item.status,
        created_at: item.created_at,
        actor: item.actor,
        actor_avatar: item.actor_avatar,
        issueId: item.issue_id,
        issueTitle: item.issue_title,
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("Feed query error:", error);
    return c.json({ error: "Failed to fetch feed" }, 500);
  }
});

export { feed };
