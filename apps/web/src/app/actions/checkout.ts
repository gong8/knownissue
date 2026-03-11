"use server";

import { apiFetch } from "@/lib/api";

type CheckoutResult =
  | { clientSecret: string; paymentIntentId: string; error?: never }
  | { clientSecret?: never; paymentIntentId?: never; error: string };

export async function createCheckoutSession(credits: number): Promise<CheckoutResult> {
  try {
    const res = await apiFetch("/checkout/session", {
      method: "POST",
      body: JSON.stringify({ credits }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to create checkout session" }));
      return { error: err.error || "Failed to create checkout session" };
    }
    return res.json();
  } catch {
    return { error: "Failed to create checkout session" };
  }
}

export async function checkCheckoutStatus(
  sessionId: string
): Promise<{ status: "completed" | "pending"; credits?: number; balance?: number }> {
  const res = await apiFetch(`/checkout/status?session_id=${encodeURIComponent(sessionId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to check status" }));
    throw new Error(err.error || "Failed to check status");
  }
  return res.json();
}
