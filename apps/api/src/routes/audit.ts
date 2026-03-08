import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { getEntityAuditLog } from "../services/audit";
import type { AppEnv } from "../lib/types";
import type { EntityType } from "@knownissue/shared";

const audit = new Hono<AppEnv>();

const validEntityTypes = new Set<string>(["bug", "patch", "verification", "user"]);

// GET /audit/:entityType/:entityId — audit log for entity (auth required)
audit.get("/audit/:entityType/:entityId", authMiddleware, async (c) => {
  const entityType = c.req.param("entityType");
  const entityId = c.req.param("entityId");

  if (!validEntityTypes.has(entityType)) {
    return c.json({ error: "Invalid entity type. Must be: bug, patch, verification, or user" }, 400);
  }

  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") || "20")));
  const offset = Math.max(0, parseInt(c.req.query("offset") || "0"));

  const result = await getEntityAuditLog(entityType as EntityType, entityId, { limit, offset });
  return c.json(result);
});

export { audit };
