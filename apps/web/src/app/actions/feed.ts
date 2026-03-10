"use server";

import { apiFetch, API_URL } from "@/lib/api";

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
    fixesReused: number;
    issuesResolved: number;
    verifiedThisWeek: number;
  }>;
}

/** Public stats fetch — no auth required, safe for landing page */
export async function fetchPublicStats() {
  const res = await fetch(`${API_URL}/stats`, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  return res.json() as Promise<{
    issues: number;
    patches: number;
    users: number;
    issuesResolved: number;
  }>;
}

export async function fetchEcosystemStats() {
  const res = await apiFetch("/stats/ecosystem");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch ecosystem stats" }));
    throw new Error(err.error || "Failed to fetch ecosystem stats");
  }
  return res.json() as Promise<
    Array<{
      ecosystem: string;
      issueCount: number;
      patchCount: number;
      resolutionRate: number;
      topLibraries: Array<{ library: string; issueCount: number }>;
    }>
  >;
}
