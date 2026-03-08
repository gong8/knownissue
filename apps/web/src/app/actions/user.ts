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
