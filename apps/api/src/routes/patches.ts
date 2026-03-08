import { Hono } from "hono";
import { patchInputSchema } from "@knownissue/shared";
import { authMiddleware } from "../middleware/auth";
import * as patchService from "../services/patch";
import type { AppEnv } from "../lib/types";

const patches = new Hono<AppEnv>();

patches.use("/bugs/*", authMiddleware);
patches.use("/patches/*", authMiddleware);

// POST /bugs/:bugId/patches — submit patch
patches.post("/bugs/:bugId/patches", async (c) => {
  const user = c.get("user");
  const bugId = c.req.param("bugId");
  const body = await c.req.json();

  try {
    const { explanation, steps, versionConstraint } = patchInputSchema.parse({ ...body, bugId });
    const patch = await patchService.submitPatch(bugId, explanation, steps, versionConstraint, user.id);
    return c.json(patch, 201);
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

// GET /patches/:id — patch detail
patches.get("/patches/:id", async (c) => {
  const id = c.req.param("id");
  const patch = await patchService.getPatchById(id);

  if (!patch) {
    return c.json({ error: "Patch not found" }, 404);
  }

  return c.json(patch);
});

// POST /patches/:id/access — record patch access (REST equivalent of get_patch MCP tool)
patches.post("/patches/:id/access", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  try {
    const patch = await patchService.getPatchForAgent(id, user.id);
    return c.json(patch);
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

export { patches };
