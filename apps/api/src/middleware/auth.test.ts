import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createHash } from "node:crypto";
import type { AppEnv } from "../lib/types";
import type { User } from "@knownissue/shared";

// Mock Prisma
vi.mock("@knownissue/db", () => ({
  prisma: {
    oAuthAccessToken: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock Clerk
vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(),
}));

// Mock oauth utils
vi.mock("../oauth/utils", () => ({
  getApiBaseUrl: vi.fn(),
}));

import {
  authMiddleware,
  optionalAuthMiddleware,
  mcpAuthMiddleware,
} from "./auth";
import { prisma } from "@knownissue/db";
import { verifyToken } from "@clerk/backend";
import { getApiBaseUrl } from "../oauth/utils";

const now = new Date();
const futureDate = new Date(Date.now() + 60 * 60 * 1000);
const pastDate = new Date(Date.now() - 60 * 60 * 1000);

const mockDbUser = {
  id: "user-1",
  clerkId: "clerk-1",
  avatarUrl: null,
  credits: 10,
  createdAt: now,
  updatedAt: now,
};

const expectedUser: User = {
  id: "user-1",
  clerkId: "clerk-1",
  avatarUrl: null,
  credits: 10,
  createdAt: now,
  updatedAt: now,
};

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

describe("authMiddleware", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getApiBaseUrl).mockReturnValue("http://localhost:3001");
  });

  function createApp() {
    const app = new Hono<AppEnv>();
    app.use("*", authMiddleware);
    app.get("/test", (c) => {
      const user = c.get("user");
      return c.json({ userId: user.id, credits: user.credits });
    });
    return app;
  }

  it("returns 401 when no Authorization header", async () => {
    const app = createApp();
    const res = await app.request("/test");
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header is not Bearer", async () => {
    const app = createApp();
    const res = await app.request("/test", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when Bearer token is empty", async () => {
    const app = createApp();
    const res = await app.request("/test", {
      headers: { Authorization: "Bearer " },
    });
    expect(res.status).toBe(401);
  });

  it("extracts token case-insensitively (bearer vs Bearer)", async () => {
    // Token that won't match any strategy
    vi.mocked(verifyToken).mockRejectedValue(new Error("invalid"));

    const app = createApp();
    const res = await app.request("/test", {
      headers: { Authorization: "bearer some-jwt-token" },
    });
    // Should attempt auth (not 401 for missing token) but fail validation
    expect(res.status).toBe(401);
    // verifyToken should have been called since the token doesn't start with "ki_"
    expect(verifyToken).toHaveBeenCalled();
  });

  describe("knownissue OAuth token (ki_ prefix)", () => {
    it("authenticates valid ki_ token", async () => {
      const token = "ki_test_token_abc123";
      const hash = sha256(token);

      vi.mocked(prisma.oAuthAccessToken.findUnique).mockResolvedValue({
        tokenHash: hash,
        expiresAt: futureDate,
        revokedAt: null,
        scopes: ["mcp:tools"],
        resource: null,
        user: mockDbUser,
      } as never);

      const app = createApp();
      const res = await app.request("/test", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe("user-1");
    });

    it("returns 401 for ki_ token not found in DB", async () => {
      vi.mocked(prisma.oAuthAccessToken.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await app.request("/test", {
        headers: { Authorization: "Bearer ki_nonexistent_token" },
      });

      expect(res.status).toBe(401);
    });

    it("returns 401 for revoked ki_ token", async () => {
      const token = "ki_revoked_token";
      const hash = sha256(token);

      vi.mocked(prisma.oAuthAccessToken.findUnique).mockResolvedValue({
        tokenHash: hash,
        expiresAt: futureDate,
        revokedAt: new Date(), // revoked
        scopes: ["mcp:tools"],
        resource: null,
        user: mockDbUser,
      } as never);

      const app = createApp();
      const res = await app.request("/test", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(401);
    });

    it("returns 401 for expired ki_ token", async () => {
      const token = "ki_expired_token";
      const hash = sha256(token);

      vi.mocked(prisma.oAuthAccessToken.findUnique).mockResolvedValue({
        tokenHash: hash,
        expiresAt: pastDate, // expired
        revokedAt: null,
        scopes: ["mcp:tools"],
        resource: null,
        user: mockDbUser,
      } as never);

      const app = createApp();
      const res = await app.request("/test", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(401);
    });

    it("returns 401 when resource does not match server base URL", async () => {
      const token = "ki_wrong_resource";
      const hash = sha256(token);

      vi.mocked(prisma.oAuthAccessToken.findUnique).mockResolvedValue({
        tokenHash: hash,
        expiresAt: futureDate,
        revokedAt: null,
        scopes: ["mcp:tools"],
        resource: "http://other-server:3001", // wrong resource
        user: mockDbUser,
      } as never);

      const app = createApp();
      const res = await app.request("/test", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(401);
    });

    it("allows ki_ token with matching resource", async () => {
      const token = "ki_correct_resource";
      const hash = sha256(token);

      vi.mocked(prisma.oAuthAccessToken.findUnique).mockResolvedValue({
        tokenHash: hash,
        expiresAt: futureDate,
        revokedAt: null,
        scopes: ["mcp:tools"],
        resource: "http://localhost:3001", // matches mock getApiBaseUrl
        user: mockDbUser,
      } as never);

      const app = createApp();
      const res = await app.request("/test", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });
  });

  describe("Clerk JWT", () => {
    it("authenticates valid Clerk JWT for existing user", async () => {
      vi.mocked(verifyToken).mockResolvedValue({ sub: "clerk-user-1" } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockDbUser as never);

      const app = createApp();
      const res = await app.request("/test", {
        headers: { Authorization: "Bearer clerk-jwt-token" },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe("user-1");
    });

    it("creates new user for Clerk JWT with unknown sub", async () => {
      vi.mocked(verifyToken).mockResolvedValue({ sub: "clerk-new-user" } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue({
        ...mockDbUser,
        id: "user-new",
        clerkId: "clerk-new-user",
        credits: 5,
      } as never);

      const app = createApp();
      const res = await app.request("/test", {
        headers: { Authorization: "Bearer clerk-jwt-new-user" },
      });

      expect(res.status).toBe(200);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clerkId: "clerk-new-user",
          displayName: expect.any(String),
          credits: 5, // SIGNUP_BONUS
        }),
      });
    });

    it("returns 401 when Clerk verifyToken throws", async () => {
      vi.mocked(verifyToken).mockRejectedValue(new Error("Invalid JWT"));

      const app = createApp();
      const res = await app.request("/test", {
        headers: { Authorization: "Bearer invalid-jwt" },
      });

      expect(res.status).toBe(401);
    });

    it("returns 401 when Clerk JWT has no sub", async () => {
      vi.mocked(verifyToken).mockResolvedValue({ sub: "" } as never);

      const app = createApp();
      const res = await app.request("/test", {
        headers: { Authorization: "Bearer no-sub-jwt" },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("strategy order", () => {
    it("tries ki_ strategy first, skips Clerk if ki_ succeeds", async () => {
      const token = "ki_valid";
      vi.mocked(prisma.oAuthAccessToken.findUnique).mockResolvedValue({
        tokenHash: sha256(token),
        expiresAt: futureDate,
        revokedAt: null,
        scopes: ["mcp:tools"],
        resource: null,
        user: mockDbUser,
      } as never);

      const app = createApp();
      await app.request("/test", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(prisma.oAuthAccessToken.findUnique).toHaveBeenCalled();
      expect(verifyToken).not.toHaveBeenCalled();
    });

    it("falls through to Clerk when ki_ token not found", async () => {
      const token = "ki_unknown";
      vi.mocked(prisma.oAuthAccessToken.findUnique).mockResolvedValue(null);
      vi.mocked(verifyToken).mockRejectedValue(new Error("not a JWT"));

      const app = createApp();
      await app.request("/test", {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Both strategies attempted
      expect(prisma.oAuthAccessToken.findUnique).toHaveBeenCalled();
      expect(verifyToken).toHaveBeenCalled();
    });

    it("skips ki_ strategy for non-ki_ tokens", async () => {
      vi.mocked(verifyToken).mockRejectedValue(new Error("invalid"));

      const app = createApp();
      await app.request("/test", {
        headers: { Authorization: "Bearer jwt-like-token" },
      });

      // ki_ lookup should not happen
      expect(prisma.oAuthAccessToken.findUnique).not.toHaveBeenCalled();
      expect(verifyToken).toHaveBeenCalled();
    });
  });
});

describe("optionalAuthMiddleware", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getApiBaseUrl).mockReturnValue("http://localhost:3001");
  });

  function createApp() {
    const app = new Hono<AppEnv>();
    app.use("*", optionalAuthMiddleware);
    app.get("/test", (c) => {
      const user = c.get("user");
      return c.json({ authenticated: !!user, userId: user?.id ?? null });
    });
    return app;
  }

  it("passes through without auth header", async () => {
    const app = createApp();
    const res = await app.request("/test");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
    expect(body.userId).toBeNull();
  });

  it("sets user when valid token provided", async () => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: "clerk-1" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockDbUser as never);

    const app = createApp();
    const res = await app.request("/test", {
      headers: { Authorization: "Bearer valid-jwt" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.userId).toBe("user-1");
  });

  it("passes through without user when token is invalid", async () => {
    vi.mocked(verifyToken).mockRejectedValue(new Error("bad token"));

    const app = createApp();
    const res = await app.request("/test", {
      headers: { Authorization: "Bearer bad-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });
});

describe("mcpAuthMiddleware", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getApiBaseUrl).mockReturnValue("http://localhost:3001");
  });

  function createApp() {
    const app = new Hono<AppEnv>();
    app.use("*", mcpAuthMiddleware);
    app.get("/test", (c) => {
      const user = c.get("user");
      return c.json({ userId: user.id });
    });
    return app;
  }

  it("returns 401 with WWW-Authenticate when no token", async () => {
    const app = createApp();
    const res = await app.request("/test");

    expect(res.status).toBe(401);
    const wwwAuth = res.headers.get("WWW-Authenticate");
    expect(wwwAuth).toContain("Bearer");
    expect(wwwAuth).toContain("resource_metadata=");
    expect(wwwAuth).toContain("oauth-protected-resource");
    expect(wwwAuth).toContain('scope="mcp:tools"');

    const body = await res.json();
    expect(body.error).toBe("Authorization required");
  });

  it("returns 401 with invalid_token error for bad token", async () => {
    vi.mocked(verifyToken).mockRejectedValue(new Error("invalid"));

    const app = createApp();
    const res = await app.request("/test", {
      headers: { Authorization: "Bearer bad-token" },
    });

    expect(res.status).toBe(401);
    const wwwAuth = res.headers.get("WWW-Authenticate");
    expect(wwwAuth).toContain('error="invalid_token"');
    expect(wwwAuth).toContain("error_description=");
  });

  it("returns 403 when OAuth token lacks mcp:tools scope", async () => {
    const token = "ki_no_scope";
    vi.mocked(prisma.oAuthAccessToken.findUnique).mockResolvedValue({
      tokenHash: sha256(token),
      expiresAt: futureDate,
      revokedAt: null,
      scopes: ["other:scope"], // missing mcp:tools
      resource: null,
      user: mockDbUser,
    } as never);

    const app = createApp();
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(403);
    const wwwAuth = res.headers.get("WWW-Authenticate");
    expect(wwwAuth).toContain('error="insufficient_scope"');
    expect(wwwAuth).toContain('scope="mcp:tools"');

    const body = await res.json();
    expect(body.error).toContain("insufficient scope");
  });

  it("allows OAuth token with mcp:tools scope", async () => {
    const token = "ki_has_scope";
    vi.mocked(prisma.oAuthAccessToken.findUnique).mockResolvedValue({
      tokenHash: sha256(token),
      expiresAt: futureDate,
      revokedAt: null,
      scopes: ["mcp:tools"],
      resource: null,
      user: mockDbUser,
    } as never);

    const app = createApp();
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("user-1");
  });

  it("allows Clerk JWT without scope check (no scopes = Clerk)", async () => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: "clerk-1" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockDbUser as never);

    const app = createApp();
    const res = await app.request("/test", {
      headers: { Authorization: "Bearer clerk-jwt" },
    });

    // Clerk tokens have no scopes — should pass without scope check
    expect(res.status).toBe(200);
  });

  it("returns 403 when OAuth token has empty scopes array", async () => {
    const token = "ki_empty_scopes";
    vi.mocked(prisma.oAuthAccessToken.findUnique).mockResolvedValue({
      tokenHash: sha256(token),
      expiresAt: futureDate,
      revokedAt: null,
      scopes: [], // empty scopes — still an OAuth token
      resource: null,
      user: mockDbUser,
    } as never);

    const app = createApp();
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Empty array is truthy, so scope check runs and fails
    // Actually, empty array is truthy in JS but `result.scopes` being []
    // means the condition `result.scopes && !result.scopes.includes("mcp:tools")`
    // evaluates to true ([] is truthy, and [].includes("mcp:tools") is false)
    expect(res.status).toBe(403);
  });
});
