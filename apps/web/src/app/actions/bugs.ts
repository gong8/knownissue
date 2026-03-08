"use server";

import { apiFetch } from "@/lib/api";

export async function fetchBugById(id: string) {
  const res = await apiFetch(`/bugs/${id}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    const err = await res.json().catch(() => ({ error: "Failed to fetch bug" }));
    throw new Error(err.error || "Failed to fetch bug");
  }
  return res.json();
}
