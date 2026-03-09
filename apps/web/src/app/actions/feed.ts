"use server";

import { apiFetch } from "@/lib/api";

export async function fetchFeed(params: {
  type?: string;
  severity?: string;
  ecosystem?: string;
  range?: string;
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  const res = await apiFetch(`/feed?${searchParams.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch feed" }));
    throw new Error(err.error || "Failed to fetch feed");
  }
  return res.json();
}

export async function fetchAggregateStats() {
  const res = await apiFetch("/stats");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch stats" }));
    throw new Error(err.error || "Failed to fetch stats");
  }
  return res.json() as Promise<{
    issues: number;
    patches: number;
    users: number;
    openCriticals: number;
    approvalRate: number;
  }>;
}
