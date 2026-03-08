"use server";

import { apiFetch } from "@/lib/api";
import type { EntityType } from "@knownissue/shared";

export async function fetchEntityAuditLog(
  entityType: EntityType,
  entityId: string,
  params: { limit?: number; offset?: number } = {}
) {
  const searchParams = new URLSearchParams();
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.offset) searchParams.set("offset", String(params.offset));

  const qs = searchParams.toString();
  const res = await apiFetch(`/audit/${entityType}/${entityId}${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch audit log" }));
    throw new Error(err.error || "Failed to fetch audit log");
  }
  return res.json();
}
