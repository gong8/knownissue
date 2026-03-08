"use server";

import { apiFetch } from "@/lib/api";
import type { Vote } from "@knownissue/shared";

export async function reviewPatch(
  patchId: string,
  vote: Vote,
  comment: string | null
) {
  const res = await apiFetch(`/patches/${patchId}/reviews`, {
    method: "POST",
    body: JSON.stringify({ vote, comment }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to submit review" }));
    throw new Error(err.error || "Failed to submit review");
  }
  return res.json();
}
