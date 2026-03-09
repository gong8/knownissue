import { prisma } from "@knownissue/db";
import {
  DUPLICATE_WARN_THRESHOLD,
  DUPLICATE_REJECT_THRESHOLD,
} from "@knownissue/shared";
import { generateEmbedding } from "./embedding";
import { findByFingerprint } from "./fingerprint";

export function validateContent(
  title: string | null,
  description: string | null
): { valid: boolean; reason?: string } {
  // At least one of errorMessage or description must be present
  // (enforced by Zod .refine, but double-check here)
  if (!title && !description) {
    return {
      valid: false,
      reason: "At least one of errorMessage or description is required",
    };
  }

  return { valid: true };
}

export async function checkDuplicate(
  text: string,
  fingerprint?: string | null,
  userId?: string
): Promise<{
  isDuplicate: boolean;
  warning?: string;
  similarIssues?: Array<{ id: string; title: string; similarity: number }>;
}> {
  // Tier 1: fingerprint check (fast, free)
  if (fingerprint) {
    const existing = await findByFingerprint(fingerprint);
    if (existing) {
      return {
        isDuplicate: true,
        warning: "An issue with the same error signature already exists",
        similarIssues: [{
          id: existing.id,
          title: existing.title ?? existing.errorMessage ?? "Untitled",
          similarity: 1.0,
        }],
      };
    }
  }

  // Tier 2/3: embedding similarity check
  const embedding = await generateEmbedding(text, userId);

  if (!embedding) {
    return { isDuplicate: false };
  }

  const vectorStr = `[${embedding.join(",")}]`;

  const similarIssues = await prisma.$queryRaw<
    Array<{ id: string; title: string; similarity: number }>
  >`
    SELECT id, title, 1 - (embedding <=> ${vectorStr}::vector) as similarity
    FROM "Bug"
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT 5
  `;

  const highSimilarity = similarIssues.filter(
    (issue) => issue.similarity >= DUPLICATE_WARN_THRESHOLD
  );

  if (highSimilarity.some((issue) => issue.similarity >= DUPLICATE_REJECT_THRESHOLD)) {
    return {
      isDuplicate: true,
      warning: "A very similar issue already exists",
      similarIssues: highSimilarity,
    };
  }

  if (highSimilarity.length > 0) {
    return {
      isDuplicate: false,
      warning: "Similar issues found — please check if yours is a duplicate",
      similarIssues: highSimilarity,
    };
  }

  return { isDuplicate: false };
}
