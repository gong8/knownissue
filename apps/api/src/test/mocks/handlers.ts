import { http, HttpResponse } from "msw";
import { EMBEDDING_DIMENSIONS } from "@knownissue/shared";

/**
 * Generate a deterministic mock embedding vector.
 * Uses a simple seed-based approach so the same text always produces the same vector.
 */
export function mockEmbedding(seed = 0): number[] {
  const arr = new Array(EMBEDDING_DIMENSIONS);
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    arr[i] = Math.sin(seed + i) * 0.5;
  }
  return arr;
}

export const handlers = [
  // Mock OpenAI embeddings API
  http.post("https://api.openai.com/v1/embeddings", async ({ request }) => {
    const body = (await request.json()) as { input: string };
    const text = typeof body.input === "string" ? body.input : "";

    // Generate deterministic embedding from text
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed += text.charCodeAt(i);
    }

    return HttpResponse.json({
      object: "list",
      data: [
        {
          object: "embedding",
          embedding: mockEmbedding(seed),
          index: 0,
        },
      ],
      model: "text-embedding-3-small",
      usage: {
        prompt_tokens: text.split(" ").length,
        total_tokens: text.split(" ").length,
      },
    });
  }),
];
