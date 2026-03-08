"use server";

import { apiFetch } from "@/lib/api";

export async function fetchCurrentUser() {
  const res = await apiFetch("/users/me");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch user" }));
    throw new Error(err.error || "Failed to fetch user");
  }
  return res.json();
}

export async function fetchUserStats(): Promise<{
  credits: number;
  bugsReported: number;
  patchesSubmitted: number;
  verificationsGiven: number;
}> {
  const res = await apiFetch("/users/me/stats");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch stats" }));
    throw new Error(err.error || "Failed to fetch stats");
  }
  return res.json();
}
