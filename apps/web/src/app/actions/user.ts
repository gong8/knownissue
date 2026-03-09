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
  issuesReported: number;
  issuesPatched: number;
  patchesSubmitted: number;
  patchesVerifiedFixed: number;
  verificationsGiven: number;
  verificationsFixed: number;
  verificationsNotFixed: number;
  verificationsPartial: number;
}> {
  const res = await apiFetch("/users/me/stats");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch stats" }));
    throw new Error(err.error || "Failed to fetch stats");
  }
  return res.json();
}

export async function fetchUserActivity(params: {
  type?: string;
  outcome?: string;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  const res = await apiFetch(`/users/me/activity?${searchParams.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch activity" }));
    throw new Error(err.error || "Failed to fetch activity");
  }
  return res.json();
}

export async function fetchUserTransactions(params: {
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));

  const res = await apiFetch(`/users/me/transactions?${searchParams.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch transactions" }));
    throw new Error(err.error || "Failed to fetch transactions");
  }
  return res.json();
}
