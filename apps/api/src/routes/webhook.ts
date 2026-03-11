import { Hono } from "hono";
import { getStripe } from "../lib/stripe";
import { awardCreditsPurchase } from "../services/credits";
import type { AppEnv } from "../lib/types";

const webhook = new Hono<AppEnv>();

// POST /webhook/stripe — Stripe webhook handler (no auth middleware)
webhook.post("/webhook/stripe", async (c) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return c.json({ error: "Webhook not configured" }, 503);
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return c.json({ error: "Payment processing is not configured" }, 503);
  }

  const body = await c.req.text();
  const signature = c.req.header("stripe-signature");

  if (!signature) {
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: `Webhook signature verification failed: ${message}` }, 400);
  }

  if (
    event.type === "checkout.session.completed" &&
    event.data.object.payment_status === "paid"
  ) {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const credits = parseInt(session.metadata?.credits ?? "0", 10);

    if (!userId || !credits) {
      console.error("Stripe webhook: missing metadata", { sessionId: session.id });
      return c.json({ received: true }, 200);
    }

    try {
      await awardCreditsPurchase(userId, credits, session.id);
    } catch (err) {
      // P2002 = unique constraint violation = duplicate webhook delivery
      if (err instanceof Error && "code" in err && (err as { code: string }).code === "P2002") {
        return c.json({ received: true, deduplicated: true }, 200);
      }
      throw err;
    }
  }

  return c.json({ received: true }, 200);
});

export { webhook };
