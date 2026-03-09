"use server";

import { apiFetch } from "@/lib/api";

export async function fetchPatchById(id: string) {
  const res = await apiFetch(`/patches/${id}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    const err = await res.json().catch(() => ({ error: "Failed to fetch patch" }));
    throw new Error(err.error || "Failed to fetch patch");
  }
  return res.json();
}
