import { Hono } from "hono";
import { reviewInputSchema } from "@knownissue/shared";
import { authMiddleware } from "../middleware/auth";
import * as reviewService from "../services/review";
import type { AppEnv } from "../lib/types";

const reviews = new Hono<AppEnv>();

reviews.use("/*", authMiddleware);

// POST /patches/:patchId/reviews — review a patch
reviews.post("/patches/:patchId/reviews", async (c) => {
  const user = c.get("user");
  const patchId = c.req.param("patchId");
  const body = await c.req.json();

  try {
    const { vote, comment } = reviewInputSchema.parse({ ...body, patchId });
    const review = await reviewService.reviewPatch(patchId, vote, comment, user.id);
    return c.json(review, 201);
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

export { reviews };
