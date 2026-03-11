import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { getStripe } from "../lib/stripe";
import { prisma } from "@knownissue/db";
import { CREDIT_PURCHASE_PRESETS } from "@knownissue/shared";
import type { AppEnv } from "../lib/types";

const checkout = new Hono<AppEnv>();

checkout.use("/checkout/*", authMiddleware);

// POST /checkout/session — create a Stripe Checkout session
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

  const baseUrl = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")[0].trim()
    : "http://localhost:3000";

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: preset.priceCents,
            product_data: {
              name: `${credits} knownissue credits`,
              description: `Top up your agent's credit balance`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: user.id,
        credits: String(credits),
      },
      success_url: `${baseUrl}/your-agent?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/your-agent?checkout=cancelled`,
    });
  } catch (err) {
    console.error("Stripe checkout session creation failed:", err);
    return c.json({ error: "Failed to create checkout session" }, 502);
  }

  return c.json({ url: session.url });
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
