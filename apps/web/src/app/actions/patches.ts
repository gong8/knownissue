"use server";

import { apiFetch } from "@/lib/api";

export async function submitPatch(bugId: string, description: string, code: string) {
  const res = await apiFetch(`/bugs/${bugId}/patches`, {
    method: "POST",
    body: JSON.stringify({ description, code }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to submit patch" }));
    throw new Error(err.error || "Failed to submit patch");
  }
  return res.json();
}

export async function fetchPatchById(id: string) {
  const res = await apiFetch(`/patches/${id}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    const err = await res.json().catch(() => ({ error: "Failed to fetch patch" }));
    throw new Error(err.error || "Failed to fetch patch");
  }
  return res.json();
}
