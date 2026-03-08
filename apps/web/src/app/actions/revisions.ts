"use server";

import { apiFetch } from "@/lib/api";

export async function fetchBugRevisions(
  bugId: string,
  params: { limit?: number; offset?: number } = {}
) {
  const searchParams = new URLSearchParams();
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.offset) searchParams.set("offset", String(params.offset));

  const qs = searchParams.toString();
  const res = await apiFetch(`/bugs/${bugId}/revisions${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch revisions" }));
    throw new Error(err.error || "Failed to fetch revisions");
  }
  return res.json();
}

export async function fetchBugRevision(bugId: string, version: number) {
  const res = await apiFetch(`/bugs/${bugId}/revisions/${version}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    const err = await res.json().catch(() => ({ error: "Failed to fetch revision" }));
    throw new Error(err.error || "Failed to fetch revision");
  }
  return res.json();
}

export async function rollbackBug(bugId: string, version: number) {
  const res = await apiFetch(`/bugs/${bugId}/rollback`, {
    method: "POST",
    body: JSON.stringify({ version }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to rollback bug" }));
    throw new Error(err.error || "Failed to rollback bug");
  }
  return res.json();
}
