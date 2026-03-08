"use server";

import { apiFetch } from "@/lib/api";
import type { ReportInput } from "@knownissue/shared";

export async function fetchBugs(params: {
  q?: string;
  library?: string;
  ecosystem?: string;
  status?: string;
  severity?: string;
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  const res = await apiFetch(`/bugs?${searchParams.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch bugs" }));
    throw new Error(err.error || "Failed to fetch bugs");
  }
  return res.json();
}

export async function fetchBugById(id: string) {
  const res = await apiFetch(`/bugs/${id}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    const err = await res.json().catch(() => ({ error: "Failed to fetch bug" }));
    throw new Error(err.error || "Failed to fetch bug");
  }
  return res.json();
}

export async function createBug(input: ReportInput) {
  const res = await apiFetch("/bugs", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create bug" }));
    throw new Error(err.error || "Failed to create bug");
  }
  return res.json();
}
