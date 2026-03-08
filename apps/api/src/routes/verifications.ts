import { Hono } from "hono";
import { verificationInputSchema } from "@knownissue/shared";
import { authMiddleware } from "../middleware/auth";
import * as verificationService from "../services/verification";
import type { AppEnv } from "../lib/types";

const verifications = new Hono<AppEnv>();

verifications.use("/verifications", authMiddleware);
verifications.use("/verifications/*", authMiddleware);

// POST /verifications — verify a patch
verifications.post("/verifications", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  try {
    const { patchId, outcome, note, errorBefore, errorAfter, testedVersion, bugAccuracy } =
      verificationInputSchema.parse(body);
    const result = await verificationService.verify(
      patchId,
      outcome,
      note,
      errorBefore,
      errorAfter,
      testedVersion,
      bugAccuracy,
      user.id
    );
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

export { verifications };
