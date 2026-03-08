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

export async function fetchUserBugs() {
  const res = await apiFetch("/users/me/bugs");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch user bugs" }));
    throw new Error(err.error || "Failed to fetch user bugs");
  }
  return res.json();
}

export async function fetchUserPatches() {
  const res = await apiFetch("/users/me/patches");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch user patches" }));
    throw new Error(err.error || "Failed to fetch user patches");
  }
  return res.json();
}

export async function fetchTransactions(params?: { page?: number; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const res = await apiFetch(`/users/me/transactions?${searchParams.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch transactions" }));
    throw new Error(err.error || "Failed to fetch transactions");
  }
  return res.json();
}
