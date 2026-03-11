import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { getStripe } from "../lib/stripe";
import { prisma } from "@knownissue/db";
import { CREDIT_PURCHASE_PRESETS } from "@knownissue/shared";
import type { AppEnv } from "../lib/types";

const checkout = new Hono<AppEnv>();

checkout.use("/checkout/*", authMiddleware);

// POST /checkout/session — create a Stripe PaymentIntent for embedded Elements
checkout.post("/checkout/session", async (c) => {
  const body = await c.req.json<{ credits: number }>();
  const { credits } = body;

  const preset = CREDIT_PURCHASE_PRESETS.find((p) => p.credits === credits);
  if (!preset) {
    return c.json(
      {
        error: `Invalid credit amount. Choose from: ${CREDIT_PURCHASE_PRESETS.map((p) => p.credits).join(", ")}`,
      },
      400
    );
  }

  const user = c.get("user");

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return c.json({ error: "Payment processing is not configured" }, 503);
  }

  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: preset.priceCents,
      currency: "usd",
      metadata: {
        userId: user.id,
        credits: String(credits),
      },
    });
  } catch (err) {
    console.error("Stripe PaymentIntent creation failed:", err);
    return c.json({ error: "Failed to create payment" }, 502);
  }

  return c.json({
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  });
});

// GET /checkout/status — poll whether credits were awarded
checkout.get("/checkout/status", async (c) => {
  const sessionId = c.req.query("session_id");
  if (!sessionId) {
    return c.json({ error: "session_id is required" }, 400);
  }

  const user = c.get("user");

  const tx = await prisma.creditTransaction.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
  });

  if (!tx || tx.userId !== user.id) {
    return c.json({ status: "pending" });
  }

  return c.json({
    status: "completed",
    credits: tx.amount,
    balance: tx.balance,
  });
});

export { checkout };
