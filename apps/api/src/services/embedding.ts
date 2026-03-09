import { EMBEDDING_DIMENSIONS, EMBEDDING_HOURLY_CAP } from "@knownissue/shared";

// In-memory per-user embedding rate limiter
const embeddingUsage = new Map<string, { count: number; windowStart: number }>();

function checkEmbeddingLimit(userId: string): boolean {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const entry = embeddingUsage.get(userId);

  if (!entry || now - entry.windowStart > hourMs) {
    embeddingUsage.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= EMBEDDING_HOURLY_CAP) {
    return false;
  }

  entry.count++;
  return true;
}

// Periodic cleanup of stale entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  for (const [key, entry] of embeddingUsage) {
    if (now - entry.windowStart > hourMs) {
      embeddingUsage.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export async function generateEmbedding(text: string, userId?: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set, skipping embedding generation");
    return null;
  }

  if (userId && !checkEmbeddingLimit(userId)) {
    console.warn(`Embedding hourly cap reached for user ${userId}`);
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      console.error("Embedding API error:", response.statusText);
      return null;
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data[0].embedding;
  } catch (error) {
    console.error("Failed to generate embedding:", error);
    return null;
  }
}
