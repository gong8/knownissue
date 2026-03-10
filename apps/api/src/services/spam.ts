import { prisma } from "@knownissue/db";
import {
  DUPLICATE_WARN_THRESHOLD,
  DUPLICATE_REJECT_THRESHOLD,
} from "@knownissue/shared";
import { generateEmbedding } from "./embedding";

export function validateContent(
  title: string | null,
  description: string | null
): { valid: boolean; reason?: string } {
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
  _fingerprint?: string | null,
  userId?: string
): Promise<{
  isDuplicate: boolean;
  warning?: string;
  similarIssues?: Array<{ id: string; title: string; similarity: number }>;
  embedding?: number[];
}> {
  // Embedding similarity check (fingerprint is already checked by caller)
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
      embedding,
    };
  }

  if (highSimilarity.length > 0) {
    return {
      isDuplicate: false,
      warning: "Similar issues found — please check if yours is a duplicate",
      similarIssues: highSimilarity,
      embedding,
    };
  }

  return { isDuplicate: false, embedding };
}
