import { Hono } from "hono";
import { reviewInputSchema } from "@knownissue/shared";
import { authMiddleware } from "../middleware/auth";
import * as reviewService from "../services/review";
import type { AppEnv } from "../lib/types";

const reviews = new Hono<AppEnv>();

reviews.use("/*", authMiddleware);

// POST /reviews — polymorphic review (bug or patch)
reviews.post("/reviews", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  try {
    const { targetId, targetType, vote, note, version } = reviewInputSchema.parse(body);
    const result = await reviewService.review(targetId, targetType, vote, note, version, user.id);
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

// POST /patches/:patchId/reviews — legacy patch review endpoint (kept for compat)
reviews.post("/patches/:patchId/reviews", async (c) => {
  const user = c.get("user");
  const patchId = c.req.param("patchId");
  const body = await c.req.json();

  try {
    const { vote, note, version } = reviewInputSchema.parse({
      ...body,
      targetId: patchId,
      targetType: "patch",
    });
    const result = await reviewService.review(patchId, "patch", vote, note, version, user.id);
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

export { reviews };
