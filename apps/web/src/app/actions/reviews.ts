"use server";

import { apiFetch } from "@/lib/api";
import type { Vote, ReviewTargetType } from "@knownissue/shared";

export async function reviewTarget(
  targetId: string,
  targetType: ReviewTargetType,
  vote: Vote,
  note: string | null,
  version?: string
) {
  const res = await apiFetch("/reviews", {
    method: "POST",
    body: JSON.stringify({ targetId, targetType, vote, note, version }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to submit review" }));
    throw new Error(err.error || "Failed to submit review");
  }
  return res.json();
}

// Legacy compat — used by existing patch review UI
export async function reviewPatch(
  patchId: string,
  vote: Vote,
  comment: string | null
) {
  return reviewTarget(patchId, "patch", vote, comment);
}
