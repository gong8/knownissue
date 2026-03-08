import { prisma } from "@knownissue/db";
import {
  MIN_TITLE_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  DUPLICATE_WARN_THRESHOLD,
  DUPLICATE_REJECT_THRESHOLD,
} from "@knownissue/shared";
import { generateEmbedding } from "./embedding";

export function validateContent(
  title: string,
  description: string
): { valid: boolean; reason?: string } {
  if (title.length < MIN_TITLE_LENGTH) {
    return {
      valid: false,
      reason: `Title must be at least ${MIN_TITLE_LENGTH} characters`,
    };
  }

  if (description.length < MIN_DESCRIPTION_LENGTH) {
    return {
      valid: false,
      reason: `Description must be at least ${MIN_DESCRIPTION_LENGTH} characters`,
    };
  }

  return { valid: true };
}

export async function checkDuplicate(
  title: string,
  description: string
): Promise<{
  isDuplicate: boolean;
  warning?: string;
  similarBugs?: Array<{ id: string; title: string; similarity: number }>;
}> {
  const embedding = await generateEmbedding(`${title} ${description}`);

  if (!embedding) {
    // Can't check for duplicates without embeddings
    return { isDuplicate: false };
  }

  const vectorStr = `[${embedding.join(",")}]`;

  // Query for similar bugs using pgvector cosine distance
  const similarBugs = await prisma.$queryRaw<
    Array<{ id: string; title: string; similarity: number }>
  >`
    SELECT id, title, 1 - (embedding <=> ${vectorStr}::vector) as similarity
    FROM "Bug"
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT 5
  `;

  const highSimilarity = similarBugs.filter(
    (bug) => bug.similarity >= DUPLICATE_WARN_THRESHOLD
  );

  if (highSimilarity.some((bug) => bug.similarity >= DUPLICATE_REJECT_THRESHOLD)) {
    return {
      isDuplicate: true,
      warning: "A very similar bug already exists",
      similarBugs: highSimilarity,
    };
  }

  if (highSimilarity.length > 0) {
    return {
      isDuplicate: false,
      warning: "Similar bugs found — please check if yours is a duplicate",
      similarBugs: highSimilarity,
    };
  }

  return { isDuplicate: false };
}
