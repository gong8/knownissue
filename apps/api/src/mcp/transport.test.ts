import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import type { User } from "@knownissue/shared";

// Mock auth middleware to inject user
vi.mock("../middleware/auth", () => ({
  mcpAuthMiddleware: vi
    .fn()
    .mockImplementation(async (_c: unknown, next: () => Promise<void>) => next()),
}));

// Mock createMcpServer — we don't need real MCP processing for transport tests
vi.mock("./server", () => ({
  createMcpServer: vi.fn().mockReturnValue({
    connect: vi.fn(),
    close: vi.fn(),
  }),
}));

// Mock WebStandardStreamableHTTPServerTransport as a class
vi.mock("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js", () => {
  class MockTransport {
    handleRequest() {
      return Promise.resolve(
        new Response(JSON.stringify({ jsonrpc: "2.0", result: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
  }
  return { WebStandardStreamableHTTPServerTransport: MockTransport };
});

// Mock rate limiter to pass through
vi.mock("hono-rate-limiter", () => ({
  rateLimiter: vi.fn().mockImplementation(() => async (_c: unknown, next: () => Promise<void>) => next()),
}));

import { mcp } from "./transport";

const mockUser: User = {
  id: "user-1",
  clerkId: "clerk-1",
  avatarUrl: null,
  credits: 10,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

/**
 * Create an app with the mcp route mounted and optional user injection.
 */
function createApp(user?: User) {
  const app = new Hono<AppEnv>();

  if (user) {
    app.use("*", async (c, next) => {
      c.set("user", user);
      return next();
    });
  }

  app.route("/", mcp);
  return app;
}

describe("MCP Transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset CORS_ORIGIN for each test
    delete process.env.CORS_ORIGIN;
  });

  describe("method restrictions (stateless mode)", () => {
    it("returns 405 for GET requests", async () => {
      const app = createApp(mockUser);
      const res = await app.request("/mcp", { method: "GET" });

      expect(res.status).toBe(405);
      const body = await res.json();
      expect(body.error).toContain("Method not allowed");
      expect(res.headers.get("Allow")).toBe("POST");
    });

    it("returns 405 for DELETE requests", async () => {
      const app = createApp(mockUser);
      const res = await app.request("/mcp", { method: "DELETE" });

      expect(res.status).toBe(405);
      const body = await res.json();
      expect(body.error).toContain("Method not allowed");
    });

    it("returns 405 for PUT requests", async () => {
      const app = createApp(mockUser);
      const res = await app.request("/mcp", { method: "PUT" });

      expect(res.status).toBe(405);
    });
  });

  describe("CORS / Origin validation", () => {
    it("allows POST without Origin header (non-browser client)", async () => {
      const app = createApp(mockUser);
      const res = await app.request("/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/list",
          id: 1,
        }),
      });

      // Should reach the MCP handler (200) — not blocked by CORS
      expect(res.status).toBe(200);
    });

    it("returns 403 for POST with invalid Origin", async () => {
      const app = createApp(mockUser);
      const res = await app.request("/mcp", {
        method: "POST",
        headers: {
          Origin: "https://evil.example.com",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/list",
          id: 1,
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.message).toContain("Forbidden");
    });

    it("returns 204 with CORS headers for OPTIONS with allowed Origin", async () => {
      const app = createApp(mockUser);
      const res = await app.request("/mcp", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3000",
        },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        "http://localhost:3000"
      );
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
      expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
        "Authorization"
      );
      expect(res.headers.get("Access-Control-Max-Age")).toBe("86400");
    });

    it("returns 403 for OPTIONS with disallowed Origin", async () => {
      const app = createApp(mockUser);
      const res = await app.request("/mcp", {
        method: "OPTIONS",
        headers: {
          Origin: "https://attacker.com",
        },
      });

      expect(res.status).toBe(403);
    });

    it("allows POST with valid Origin and adds CORS headers", async () => {
      const app = createApp(mockUser);
      const res = await app.request("/mcp", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/list",
          id: 1,
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        "http://localhost:3000"
      );
    });

    it("uses CORS_ORIGIN env var when set", async () => {
      process.env.CORS_ORIGIN = "https://knownissue.dev,https://mcp.knownissue.dev";

      const app = createApp(mockUser);

      // Default localhost should now be rejected
      const res1 = await app.request("/mcp", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:3000" },
      });
      expect(res1.status).toBe(403);

      // Configured origin should work
      const res2 = await app.request("/mcp", {
        method: "OPTIONS",
        headers: { Origin: "https://knownissue.dev" },
      });
      expect(res2.status).toBe(204);
      expect(res2.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://knownissue.dev"
      );
    });
  });

  describe("CORS headers on errors", () => {
    it("includes CORS headers on POST responses with valid Origin", async () => {
      const app = createApp(mockUser);
      const res = await app.request("/mcp", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/list",
          id: 1,
        }),
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        "http://localhost:3000"
      );
      expect(res.headers.get("Access-Control-Expose-Headers")).toContain(
        "Mcp-Session-Id"
      );
    });
  });

  describe("stateless mode enforcements", () => {
    it("GET returns 405 with Allow: POST header", async () => {
      const app = createApp(mockUser);
      const res = await app.request("/mcp", { method: "GET" });

      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
    });

    it("DELETE returns 405 with Allow: POST header", async () => {
      const app = createApp(mockUser);
      const res = await app.request("/mcp", { method: "DELETE" });

      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
    });
  });
});
