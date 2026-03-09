import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

// ── Mock dependencies ──────────────────────────────────────────────────────

vi.mock("@knownissue/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    oAuthAccessToken: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(),
}));

import { prisma } from "@knownissue/db";
import { verifyToken } from "@clerk/backend";
import { Hono } from "hono";
import { SIGNUP_BONUS } from "@knownissue/shared";

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  oAuthAccessToken: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

const mockVerifyToken = verifyToken as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Set required env vars
  process.env.CLERK_SECRET_KEY = "sk_test_abc";
  process.env.API_BASE_URL = "http://localhost:3001";
});

// ── Helper: create a Hono app with auth middleware ─────────────────────────

async function createTestApp(middlewareType: "auth" | "mcp" = "auth") {
  // Import fresh to pick up mocks
  const { authMiddleware, mcpAuthMiddleware } = await import("../middleware/auth");

  type TestEnv = {
    Variables: {
      user: { id: string; clerkId: string; credits: number };
    };
  };

  const app = new Hono<TestEnv>();
  const middleware = middlewareType === "mcp" ? mcpAuthMiddleware : authMiddleware;
  app.use("/*", middleware);
  app.get("/test", (c) => {
    const user = c.get("user");
    return c.json({ userId: user.id });
  });

  return app;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// ── Token Extraction ───────────────────────────────────────────────────────

describe("Token Extraction", () => {
  it("extracts Bearer token (case-insensitive)", async () => {
    const app = await createTestApp();

    const token = "ki_test-token-abc";
    const hash = sha256(token);

    mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue({
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
      resource: null,
      scopes: ["mcp:tools"],
      user: {
        id: "user-1",
        clerkId: "clerk_1",
        avatarUrl: null,
        credits: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Test with "Bearer" (standard case)
    const res1 = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res1.status).toBe(200);

    // Test with "bearer" (lowercase)
    const res2 = await app.request("/test", {
      headers: { Authorization: `bearer ${token}` },
    });
    expect(res2.status).toBe(200);

    // Test with "BEARER" (uppercase)
    const res3 = await app.request("/test", {
      headers: { Authorization: `BEARER ${token}` },
    });
    expect(res3.status).toBe(200);
  });
});

// ── No Token ───────────────────────────────────────────────────────────────

describe("No Token", () => {
  it("returns 401 when no Authorization header", async () => {
    const app = await createTestApp();

    const res = await app.request("/test");
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header has no Bearer prefix", async () => {
    const app = await createTestApp();

    const res = await app.request("/test", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header is empty", async () => {
    const app = await createTestApp();

    const res = await app.request("/test", {
      headers: { Authorization: "" },
    });
    expect(res.status).toBe(401);
  });
});

// ── Invalid Token ──────────────────────────────────────────────────────────

describe("Invalid Token", () => {
  it("returns 401 for unknown ki_ token", async () => {
    const app = await createTestApp();

    mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue(null);
    mockVerifyToken.mockRejectedValue(new Error("Invalid"));

    const res = await app.request("/test", {
      headers: { Authorization: "Bearer ki_unknown-token" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for random non-ki_ non-JWT token", async () => {
    const app = await createTestApp();

    mockVerifyToken.mockRejectedValue(new Error("Invalid"));

    const res = await app.request("/test", {
      headers: { Authorization: "Bearer completely-random-garbage" },
    });
    expect(res.status).toBe(401);
  });
});

// ── knownissue OAuth Token (ki_) ───────────────────────────────────────────

describe("knownissue OAuth Token (ki_)", () => {
  const token = "ki_valid-test-token";
  const hash = sha256(token);

  const validTokenRecord = {
    tokenHash: hash,
    expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    revokedAt: null,
    resource: null,
    scopes: ["mcp:tools"],
    user: {
      id: "user-ki",
      clerkId: "clerk_ki",
      avatarUrl: null,
      credits: 50,
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
    },
  };

  it("validates hash and returns user", async () => {
    const app = await createTestApp();

    mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue(validTokenRecord);

    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("user-ki");
  });

  it("rejects expired token", async () => {
    const app = await createTestApp();

    mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue({
      ...validTokenRecord,
      expiresAt: new Date(Date.now() - 1000), // expired 1s ago
    });
    mockVerifyToken.mockRejectedValue(new Error("Invalid"));

    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects revoked token", async () => {
    const app = await createTestApp();

    mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue({
      ...validTokenRecord,
      revokedAt: new Date(), // revoked
    });
    mockVerifyToken.mockRejectedValue(new Error("Invalid"));

    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects token with mismatched resource", async () => {
    const app = await createTestApp();

    mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue({
      ...validTokenRecord,
      resource: "https://other-server.com", // wrong resource
    });
    mockVerifyToken.mockRejectedValue(new Error("Invalid"));

    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("accepts token with matching resource", async () => {
    const app = await createTestApp();

    mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue({
      ...validTokenRecord,
      resource: "http://localhost:3001", // matches API_BASE_URL
    });

    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it("normalizes trailing slash in resource comparison", async () => {
    const app = await createTestApp();

    mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue({
      ...validTokenRecord,
      resource: "http://localhost:3001/", // trailing slash
    });

    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });
});

// ── Clerk JWT ──────────────────────────────────────────────────────────────

describe("Clerk JWT", () => {
  it("validates JWT and returns existing user", async () => {
    const app = await createTestApp();

    mockVerifyToken.mockResolvedValue({
      sub: "clerk_user_abc",
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-existing",
      clerkId: "clerk_user_abc",
      avatarUrl: null,
      credits: 25,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.request("/test", {
      headers: { Authorization: "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.fake" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("user-existing");
  });

  it("auto-creates user on first Clerk login", async () => {
    const app = await createTestApp();

    mockVerifyToken.mockResolvedValue({
      sub: "clerk_user_new",
    });
    mockPrisma.user.findUnique.mockResolvedValue(null); // not found
    mockPrisma.user.create.mockResolvedValue({
      id: "user-auto-created",
      clerkId: "clerk_user_new",
      avatarUrl: null,
      credits: SIGNUP_BONUS,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.request("/test", {
      headers: { Authorization: "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.fake" },
    });
    expect(res.status).toBe(200);

    // Verify user was created with SIGNUP_BONUS
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        clerkId: "clerk_user_new",
        credits: SIGNUP_BONUS,
      },
    });
  });

  it("rejects when verifyToken throws", async () => {
    const app = await createTestApp();

    mockVerifyToken.mockRejectedValue(new Error("Token verification failed"));

    const res = await app.request("/test", {
      headers: { Authorization: "Bearer invalid-jwt" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects when JWT has no sub claim", async () => {
    const app = await createTestApp();

    mockVerifyToken.mockResolvedValue({
      sub: null,
    });

    const res = await app.request("/test", {
      headers: { Authorization: "Bearer jwt-no-sub" },
    });
    expect(res.status).toBe(401);
  });
});

// ── MCP Auth Middleware ────────────────────────────────────────────────────

describe("MCP Auth Middleware", () => {
  it("returns WWW-Authenticate with resource_metadata on no token", async () => {
    const app = await createTestApp("mcp");

    const res = await app.request("/test");
    expect(res.status).toBe(401);

    const wwwAuth = res.headers.get("WWW-Authenticate");
    expect(wwwAuth).toBeDefined();
    expect(wwwAuth).toContain("resource_metadata=");
    expect(wwwAuth).toContain("oauth-protected-resource");
    expect(wwwAuth).toContain('scope="mcp:tools"');
  });

  it("returns WWW-Authenticate with error details on invalid token", async () => {
    const app = await createTestApp("mcp");

    mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue(null);
    mockVerifyToken.mockRejectedValue(new Error("Invalid"));

    const res = await app.request("/test", {
      headers: { Authorization: "Bearer ki_invalid-token" },
    });
    expect(res.status).toBe(401);

    const wwwAuth = res.headers.get("WWW-Authenticate");
    expect(wwwAuth).toContain("invalid_token");
    expect(wwwAuth).toContain("resource_metadata=");
  });
});

// ── MCP Scope Enforcement ──────────────────────────────────────────────────

describe("MCP Scope Enforcement", () => {
  it("rejects OAuth token without mcp:tools scope", async () => {
    const app = await createTestApp("mcp");

    const token = "ki_no-scope-token";
    const hash = sha256(token);

    mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue({
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
      resource: null,
      scopes: ["read:profile"], // wrong scope
      user: {
        id: "user-no-scope",
        clerkId: "clerk_ns",
        avatarUrl: null,
        credits: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toContain("insufficient scope");

    const wwwAuth = res.headers.get("WWW-Authenticate");
    expect(wwwAuth).toContain("insufficient_scope");
    expect(wwwAuth).toContain("mcp:tools");
  });

  it("accepts OAuth token with mcp:tools scope", async () => {
    const app = await createTestApp("mcp");

    const token = "ki_has-scope-token";
    const hash = sha256(token);

    mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue({
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
      resource: null,
      scopes: ["mcp:tools"],
      user: {
        id: "user-scoped",
        clerkId: "clerk_s",
        avatarUrl: null,
        credits: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it("allows Clerk JWT through MCP middleware (no scope restriction)", async () => {
    const app = await createTestApp("mcp");

    mockVerifyToken.mockResolvedValue({
      sub: "clerk_user_mcp",
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-clerk-mcp",
      clerkId: "clerk_user_mcp",
      avatarUrl: null,
      credits: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.request("/test", {
      headers: { Authorization: "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.clerk-jwt" },
    });
    // Clerk JWTs have no scopes property, so scope check is skipped
    expect(res.status).toBe(200);
  });

  it("rejects OAuth token with empty scopes array", async () => {
    const app = await createTestApp("mcp");

    const token = "ki_empty-scope";
    const hash = sha256(token);

    mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue({
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
      resource: null,
      scopes: [], // empty scopes
      user: {
        id: "user-empty-scope",
        clerkId: "clerk_es",
        avatarUrl: null,
        credits: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Empty array is truthy, so scope check runs and fails
    expect(res.status).toBe(403);
  });
});
