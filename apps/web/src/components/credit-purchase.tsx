"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createCheckoutSession, checkCheckoutStatus } from "@/app/actions/checkout";
import { CREDIT_PURCHASE_PRESETS } from "@knownissue/shared";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// Theme matching knownissue dark palette (from globals.css)
const stripeAppearance: StripeElementsOptions["appearance"] = {
  theme: "night",
  variables: {
    colorPrimary: "hsl(245 58% 51%)",
    colorBackground: "hsl(0 0% 10%)",
    colorText: "hsl(0 0% 93%)",
    colorTextSecondary: "hsl(0 0% 60%)",
    colorDanger: "hsl(0 62% 50%)",
    fontFamily:
      "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
    fontSizeBase: "14px",
    borderRadius: "4px",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": {
      border: "1px solid hsl(0 0% 15%)",
      boxShadow: "none",
    },
    ".Input:focus": {
      border: "1px solid hsl(245 58% 51%)",
      boxShadow: "0 0 0 1px hsl(245 58% 51%)",
    },
    ".Tab": {
      border: "1px solid hsl(0 0% 15%)",
      backgroundColor: "hsl(0 0% 9%)",
    },
    ".Tab--selected": {
      border: "1px solid hsl(245 58% 51%)",
      backgroundColor: "hsl(245 30% 15%)",
    },
    ".Tab:hover": {
      backgroundColor: "hsl(0 0% 12%)",
    },
    ".Label": {
      color: "hsl(0 0% 60%)",
      fontWeight: "400",
      fontSize: "12px",
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
    },
  },
};

type PaymentFormProps = {
  paymentIntentId: string;
  onSuccess: () => void;
  onCancel: () => void;
};

function PaymentForm({ paymentIntentId, onSuccess, onCancel }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Validation failed");
      setSubmitting(false);
      return;
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/your-agent?checkout=success&session_id=${paymentIntentId}`,
      },
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed");
      setSubmitting(false);
    } else if (paymentIntent?.status === "succeeded") {
      onSuccess();
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="px-5 pb-4">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>
      {error && (
        <p className="text-xs font-mono text-red-400 px-5 pb-3">{error}</p>
      )}
      <div className="flex items-center justify-end gap-2 px-5 pb-5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="font-mono text-xs text-muted-foreground"
          onClick={onCancel}
          disabled={submitting}
        >
          cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="font-mono text-xs"
          disabled={!stripe || submitting}
        >
          {submitting ? "processing..." : "pay"}
        </Button>
      </div>
    </form>
  );
}

type CreditPurchaseProps = {
  onCreditsAdded?: () => void;
};

export function CreditPurchase({ onCreditsAdded }: CreditPurchaseProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<{
    clientSecret: string;
    paymentIntentId: string;
    credits: number;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    credits: number;
    balance: number;
  } | null>(null);
  const cancelledRef = useRef(false);

  const pollStatus = useCallback(
    async (sessionId: string) => {
      for (let i = 0; i < 10; i++) {
        if (cancelledRef.current) return;
        try {
          const result = await checkCheckoutStatus(sessionId);
          if (cancelledRef.current) return;
          if (result.status === "completed") {
            setConfirmation({
              credits: result.credits ?? 0,
              balance: result.balance ?? 0,
            });
            onCreditsAdded?.();
            router.replace("/your-agent", { scroll: false });
            return;
          }
        } catch {
          // ignore polling errors
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!cancelledRef.current) {
        setError(
          "Payment processing is taking longer than expected. Your credits will appear shortly."
        );
        router.replace("/your-agent", { scroll: false });
      }
    },
    [onCreditsAdded, router]
  );

  useEffect(() => {
    cancelledRef.current = false;
    const checkoutParam = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");
    if (checkoutParam === "success" && sessionId) {
      pollStatus(sessionId);
    }
    return () => {
      cancelledRef.current = true;
    };
  }, [searchParams, pollStatus]);

  async function handleBuy(credits: number) {
    setLoading(credits);
    setError(null);
    try {
      const result = await createCheckoutSession(credits);
      if ("error" in result && result.error) {
        setError(result.error);
        setLoading(null);
        return;
      }
      if ("clientSecret" in result && result.clientSecret) {
        setCheckout({
          clientSecret: result.clientSecret,
          paymentIntentId: result.paymentIntentId,
          credits,
        });
      }
      setLoading(null);
    } catch {
      setError("Failed to start checkout");
      setLoading(null);
    }
  }

  function handleClose() {
    setCheckout(null);
  }

  function handlePaymentSuccess() {
    const piId = checkout?.paymentIntentId;
    setCheckout(null);
    if (piId) {
      pollStatus(piId);
    }
  }

  const preset = checkout
    ? CREDIT_PURCHASE_PRESETS.find((p) => p.credits === checkout.credits)
    : null;

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          {confirmation ? (
            <p className="text-xs font-mono text-green-400">
              +{confirmation.credits} credits added (balance: {confirmation.balance})
            </p>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">buy credits</span>
              {CREDIT_PURCHASE_PRESETS.map((preset) => (
                <Button
                  key={preset.credits}
                  variant="outline"
                  size="sm"
                  className="font-mono text-xs"
                  disabled={loading !== null}
                  onClick={() => handleBuy(preset.credits)}
                >
                  {loading === preset.credits
                    ? "..."
                    : `${preset.credits} / $${(preset.priceCents / 100).toFixed(2)}`}
                </Button>
              ))}
            </>
          )}
        </div>
        {error && <p className="text-xs font-mono text-red-400">{error}</p>}
      </div>

      <Dialog open={!!checkout} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden border-border/50">
          <DialogHeader className="px-5 pt-5 pb-4">
            <DialogTitle className="text-sm font-mono tracking-wider text-muted-foreground">
              {preset
                ? `${preset.credits} credits — $${(preset.priceCents / 100).toFixed(2)}`
                : "checkout"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Enter payment details to purchase credits
            </DialogDescription>
          </DialogHeader>
          {checkout && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: checkout.clientSecret,
                appearance: stripeAppearance,
              }}
            >
              <PaymentForm
                paymentIntentId={checkout.paymentIntentId}
                onSuccess={handlePaymentSuccess}
                onCancel={handleClose}
              />
            </Elements>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
