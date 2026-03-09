"use server";

import { apiFetch } from "@/lib/api";

export async function fetchIssueById(id: string) {
  const res = await apiFetch(`/issues/${id}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    const err = await res.json().catch(() => ({ error: "Failed to fetch issue" }));
    throw new Error(err.error || "Failed to fetch issue");
  }
  return res.json();
}
