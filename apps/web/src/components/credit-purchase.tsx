"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createCheckoutSession, checkCheckoutStatus } from "@/app/actions/checkout";
import { CREDIT_PURCHASE_PRESETS } from "@knownissue/shared";

type CreditPurchaseProps = {
  onCreditsAdded?: () => void;
};

export function CreditPurchase({ onCreditsAdded }: CreditPurchaseProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<{
    credits: number;
    balance: number;
  } | null>(null);

  const pollStatus = useCallback(
    async (sessionId: string) => {
      for (let i = 0; i < 10; i++) {
        try {
          const result = await checkCheckoutStatus(sessionId);
          if (result.status === "completed") {
            setConfirmation({
              credits: result.credits ?? 0,
              balance: result.balance ?? 0,
            });
            onCreditsAdded?.();
            // Clean URL params
            router.replace("/your-agent", { scroll: false });
            return;
          }
        } catch {
          // ignore polling errors
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      // Timed out — clean URL anyway
      router.replace("/your-agent", { scroll: false });
    },
    [onCreditsAdded, router]
  );

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");
    if (checkout === "success" && sessionId) {
      pollStatus(sessionId);
    }
  }, [searchParams, pollStatus]);

  async function handleBuy(credits: number) {
    setLoading(credits);
    try {
      const { url } = await createCheckoutSession(credits);
      if (url) {
        window.location.href = url;
      }
    } catch {
      setLoading(null);
    }
  }

  return (
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
                : `${preset.credits} / $${(preset.priceCents / 100).toFixed(0)}`}
            </Button>
          ))}
        </>
      )}
    </div>
  );
}
