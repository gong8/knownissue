import { createHash } from "node:crypto";
import { prisma } from "@knownissue/db";

export function computeFingerprint(
  library?: string | null,
  errorCode?: string | null,
  errorMessage?: string | null
): string | null {
  if (!library) return null;

  // Tier 1: errorCode present — most precise
  if (errorCode) {
    return sha256(`${library}::${errorCode}`);
  }

  // Tier 2: errorMessage present — normalize then hash
  if (errorMessage) {
    const normalized = normalizeErrorMessage(errorMessage);
    return sha256(`${library}::${normalized}`);
  }

  // Tier 3: no error info — use embeddings instead
  return null;
}

export function normalizeErrorMessage(msg: string): string {
  return msg
    // Strip file paths (Unix + Windows)
    .replace(/(?:\/[\w.-]+)+\/?/g, "<path>")
    .replace(/(?:[A-Z]:\\[\w\\.-]+)+/g, "<path>")
    // Strip line:col patterns
    .replace(/\b\d+:\d+\b/g, "<line>:<col>")
    // Strip UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    // Strip hex strings (8+ chars)
    .replace(/\b0x[0-9a-f]{8,}\b/gi, "<hex>")
    // Strip long numbers (4+ digits)
    .replace(/\b\d{4,}\b/g, "<num>")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function findByFingerprint(fingerprint: string) {
  return prisma.issue.findFirst({
    where: {
      fingerprint,
    },
    include: {
      reporter: true,
      patches: {
        include: {
          submitter: true,
          verifications: { include: { verifier: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
