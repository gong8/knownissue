import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EMBEDDING_HOURLY_CAP, EMBEDDING_DIMENSIONS } from "@knownissue/shared";

// Store original env
const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  // Reset module registry so each test starts with a clean rate limiter
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("generateEmbedding", () => {
  it("returns null when OPENAI_API_KEY is not set", async () => {
    delete process.env.OPENAI_API_KEY;
    const { generateEmbedding } = await import("./embedding");

    const result = await generateEmbedding("test text");

    expect(result).toBeNull();
  });

  it("returns an embedding array when API key is set", async () => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    const { generateEmbedding } = await import("./embedding");

    const result = await generateEmbedding("test text");

    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("returns deterministic embeddings for the same input", async () => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    const { generateEmbedding } = await import("./embedding");

    const a = await generateEmbedding("identical text");
    const b = await generateEmbedding("identical text");

    expect(a).toEqual(b);
  });

  it("returns different embeddings for different input", async () => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    const { generateEmbedding } = await import("./embedding");

    const a = await generateEmbedding("first text");
    const b = await generateEmbedding("completely different text");

    expect(a).not.toEqual(b);
  });

  it("returns null on fetch error", async () => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    const { generateEmbedding } = await import("./embedding");

    // Override global fetch to throw
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await generateEmbedding("test text");

    expect(result).toBeNull();

    globalThis.fetch = originalFetch;
  });

  it("returns null on non-ok HTTP response", async () => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    const { generateEmbedding } = await import("./embedding");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: "Rate Limited",
    });

    const result = await generateEmbedding("test text");

    expect(result).toBeNull();

    globalThis.fetch = originalFetch;
  });

  describe("rate limiting", () => {
    it("allows requests without userId (no rate limiting)", async () => {
      process.env.OPENAI_API_KEY = "sk-test-key";
      const { generateEmbedding } = await import("./embedding");

      // Without userId, rate limiting is bypassed
      const result = await generateEmbedding("test text");
      expect(result).not.toBeNull();
    });

    it("allows requests up to the hourly cap", async () => {
      process.env.OPENAI_API_KEY = "sk-test-key";
      const { generateEmbedding } = await import("./embedding");

      // First request should succeed
      const result = await generateEmbedding("text", "user-rate-test");
      expect(result).not.toBeNull();
    });

    it("returns null when hourly cap is exceeded for a user", async () => {
      process.env.OPENAI_API_KEY = "sk-test-key";
      const { generateEmbedding } = await import("./embedding");

      // Exhaust the rate limit
      for (let i = 0; i < EMBEDDING_HOURLY_CAP; i++) {
        await generateEmbedding(`text ${i}`, "user-flood");
      }

      // Next request should be rate limited
      const result = await generateEmbedding("one more", "user-flood");
      expect(result).toBeNull();
    });

    it("rate limits are per-user", async () => {
      process.env.OPENAI_API_KEY = "sk-test-key";
      const { generateEmbedding } = await import("./embedding");

      // Exhaust limit for user-a
      for (let i = 0; i < EMBEDDING_HOURLY_CAP; i++) {
        await generateEmbedding(`text ${i}`, "user-a");
      }

      // user-b should still be able to generate embeddings
      const result = await generateEmbedding("hello", "user-b");
      expect(result).not.toBeNull();
    });
  });
});
