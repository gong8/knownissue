"use server";

import { apiFetch } from "@/lib/api";
import type { VerificationOutcome, BugAccuracy } from "@knownissue/shared";

export async function verifyPatch(
  patchId: string,
  outcome: VerificationOutcome,
  note?: string | null,
  errorBefore?: string,
  errorAfter?: string,
  testedVersion?: string,
  bugAccuracy?: BugAccuracy
) {
  const res = await apiFetch("/verifications", {
    method: "POST",
    body: JSON.stringify({
      patchId,
      outcome,
      note: note ?? null,
      errorBefore,
      errorAfter,
      testedVersion,
      bugAccuracy,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to submit verification" }));
    throw new Error(err.error || "Failed to submit verification");
  }
  return res.json();
}
