"use server";

import { apiFetch } from "@/lib/api";

export async function fetchIssues(params: {
  library?: string;
  ecosystem?: string;
  status?: string;
  severity?: string;
  category?: string;
  sort?: string;
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  const res = await apiFetch(`/issues?${searchParams.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch issues" }));
    throw new Error(err.error || "Failed to fetch issues");
  }
  return res.json();
}
