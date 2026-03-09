import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createHash } from "node:crypto";

// ── Mocks ───────────────────────────────────────────────────────────────

const mockPrisma = {
  oAuthClient: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  oAuthAuthorizationCode: {
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  oAuthAccessToken: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  oAuthRefreshToken: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock("@knownissue/db", () => ({ prisma: mockPrisma }));

vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(),
}));

import { verifyToken } from "@clerk/backend";

const mockVerifyToken = verifyToken as ReturnType<typeof vi.fn>;

// ── Helpers ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLERK_PUBLISHABLE_KEY = "pk_test_abc";
  process.env.CLERK_SECRET_KEY = "sk_test_abc";
  process.env.API_BASE_URL = "http://localhost:3001";
  process.env.API_PORT = "3001";
});

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// ══════════════════════════════════════════════════════════════════════════
// OAuth Utils
// ══════════════════════════════════════════════════════════════════════════

describe("OAuth Utils", () => {
  // Import utils directly (no Prisma dependency)
  let utils: typeof import("./utils");

  beforeEach(async () => {
    utils = await import("./utils");
  });

  describe("hashToken", () => {
    it("returns SHA-256 hex digest", () => {
      const hash = utils.hashToken("test-token");
      expect(hash).toBe(sha256("test-token"));
      expect(hash).toHaveLength(64);
    });

    it("produces different hashes for different tokens", () => {
      const h1 = utils.hashToken("token-a");
      const h2 = utils.hashToken("token-b");
      expect(h1).not.toBe(h2);
    });

    it("produces consistent hashes for same input", () => {
      const h1 = utils.hashToken("same-token");
      const h2 = utils.hashToken("same-token");
      expect(h1).toBe(h2);
    });
  });

  describe("generateToken", () => {
    it("starts with the given prefix", () => {
      const token = utils.generateToken("ki_");
      expect(token.startsWith("ki_")).toBe(true);
    });

    it("generates unique tokens each call", () => {
      const t1 = utils.generateToken("ki_");
      const t2 = utils.generateToken("ki_");
      expect(t1).not.toBe(t2);
    });

    it("has sufficient length for security", () => {
      const token = utils.generateToken("ki_");
      // 32 random bytes in base64url = ~43 chars + prefix
      expect(token.length).toBeGreaterThan(40);
    });
  });

  describe("generateClientId", () => {
    it("starts with dyn_ prefix", () => {
      const id = utils.generateClientId();
      expect(id.startsWith("dyn_")).toBe(true);
    });

    it("generates unique IDs", () => {
      const id1 = utils.generateClientId();
      const id2 = utils.generateClientId();
      expect(id1).not.toBe(id2);
    });
  });

  describe("generateAuthCode", () => {
    it("generates a non-empty string", () => {
      const code = utils.generateAuthCode();
      expect(code.length).toBeGreaterThan(0);
    });

    it("generates unique codes", () => {
      const c1 = utils.generateAuthCode();
      const c2 = utils.generateAuthCode();
      expect(c1).not.toBe(c2);
    });
  });

  describe("verifyPkce", () => {
    it("returns true for valid PKCE pair", () => {
      const codeVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const codeChallenge = createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");

      expect(utils.verifyPkce(codeVerifier, codeChallenge)).toBe(true);
    });

    it("returns false for invalid PKCE pair", () => {
      const codeVerifier = "correct-verifier";
      const wrongChallenge = createHash("sha256")
        .update("wrong-verifier")
        .digest("base64url");

      expect(utils.verifyPkce(codeVerifier, wrongChallenge)).toBe(false);
    });

    it("returns false for length mismatch", () => {
      expect(utils.verifyPkce("short", "ab")).toBe(false);
    });
  });

  describe("isValidRedirectUri", () => {
    it("accepts localhost with http", () => {
      expect(utils.isValidRedirectUri("http://localhost:8080/callback")).toBe(true);
    });

    it("accepts localhost with https", () => {
      expect(utils.isValidRedirectUri("https://localhost/callback")).toBe(true);
    });

    it("accepts 127.0.0.1", () => {
      expect(utils.isValidRedirectUri("http://127.0.0.1:3000/callback")).toBe(true);
    });

    it("accepts IPv6 loopback [::1]", () => {
      expect(utils.isValidRedirectUri("http://[::1]:3000/callback")).toBe(true);
    });

    it("accepts HTTPS remote URIs", () => {
      expect(utils.isValidRedirectUri("https://example.com/callback")).toBe(true);
    });

    it("rejects HTTP remote URIs", () => {
      expect(utils.isValidRedirectUri("http://example.com/callback")).toBe(false);
    });

    it("accepts private-use URI schemes (native apps)", () => {
      expect(utils.isValidRedirectUri("vscode://callback")).toBe(true);
      expect(utils.isValidRedirectUri("com.example.app://auth")).toBe(true);
    });

    it("rejects invalid URIs", () => {
      expect(utils.isValidRedirectUri("not a url")).toBe(false);
      expect(utils.isValidRedirectUri("")).toBe(false);
    });
  });

  describe("getApiBaseUrl", () => {
    it("returns API_BASE_URL when set", () => {
      process.env.API_BASE_URL = "https://api.knownissue.dev";
      expect(utils.getApiBaseUrl()).toBe("https://api.knownissue.dev");
    });

    it("strips trailing slashes", () => {
      process.env.API_BASE_URL = "https://api.knownissue.dev///";
      expect(utils.getApiBaseUrl()).toBe("https://api.knownissue.dev");
    });

    it("falls back to localhost with API_PORT", () => {
      delete process.env.API_BASE_URL;
      process.env.API_PORT = "4000";
      expect(utils.getApiBaseUrl()).toBe("http://localhost:4000");
    });

    it("defaults to port 3001 when no env vars set", () => {
      delete process.env.API_BASE_URL;
      delete process.env.API_PORT;
      expect(utils.getApiBaseUrl()).toBe("http://localhost:3001");
    });
  });

  describe("constants", () => {
    it("exports expected token prefixes", () => {
      expect(utils.ACCESS_TOKEN_PREFIX).toBe("ki_");
      expect(utils.REFRESH_TOKEN_PREFIX).toBe("kir_");
      expect(utils.CLIENT_ID_PREFIX).toBe("dyn_");
    });

    it("exports expected TTL values", () => {
      expect(utils.ACCESS_TOKEN_TTL).toBe(60 * 60 * 1000); // 1 hour
      expect(utils.REFRESH_TOKEN_TTL).toBe(30 * 24 * 60 * 60 * 1000); // 30 days
      expect(utils.AUTH_CODE_TTL).toBe(60 * 1000); // 60 seconds
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// OAuth Metadata
// ══════════════════════════════════════════════════════════════════════════

describe("OAuth Metadata", () => {
  let app: Hono;

  beforeEach(async () => {
    const { metadata } = await import("./metadata");
    app = new Hono();
    app.route("/", metadata);
  });

  describe("GET /.well-known/oauth-protected-resource", () => {
    it("returns protected resource metadata", async () => {
      const res = await app.request("/.well-known/oauth-protected-resource");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.resource).toBe("http://localhost:3001");
      expect(body.authorization_servers).toEqual(["http://localhost:3001"]);
      expect(body.scopes_supported).toEqual(["mcp:tools"]);
      expect(body.bearer_methods_supported).toEqual(["header"]);
    });
  });

  describe("GET /.well-known/oauth-authorization-server", () => {
    it("returns authorization server metadata", async () => {
      const res = await app.request("/.well-known/oauth-authorization-server");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.issuer).toBe("http://localhost:3001");
      expect(body.authorization_endpoint).toBe(
        "http://localhost:3001/oauth/authorize"
      );
      expect(body.token_endpoint).toBe("http://localhost:3001/oauth/token");
      expect(body.registration_endpoint).toBe(
        "http://localhost:3001/oauth/register"
      );
      expect(body.revocation_endpoint).toBe(
        "http://localhost:3001/oauth/revoke"
      );
      expect(body.response_types_supported).toEqual(["code"]);
      expect(body.grant_types_supported).toEqual([
        "authorization_code",
        "refresh_token",
      ]);
      expect(body.code_challenge_methods_supported).toEqual(["S256"]);
      expect(body.scopes_supported).toEqual(["mcp:tools"]);
      expect(body.token_endpoint_auth_methods_supported).toEqual(["none"]);
      expect(body.client_id_metadata_document_supported).toBe(false);
    });
  });

  describe("RFC 8414 path-suffixed endpoints", () => {
    it("serves protected resource metadata at /mcp suffix", async () => {
      const res = await app.request(
        "/.well-known/oauth-protected-resource/mcp"
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.resource).toBe("http://localhost:3001");
    });

    it("serves auth server metadata at /mcp suffix", async () => {
      const res = await app.request(
        "/.well-known/oauth-authorization-server/mcp"
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.issuer).toBe("http://localhost:3001");
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// OAuth Register
// ══════════════════════════════════════════════════════════════════════════

describe("OAuth Register", () => {
  let app: Hono;

  beforeEach(async () => {
    const { register } = await import("./register");
    app = new Hono();
    app.route("/", register);
  });

  describe("POST /oauth/register", () => {
    it("registers a new client with valid metadata", async () => {
      mockPrisma.oAuthClient.create.mockResolvedValue({});

      const res = await app.request("/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Test Client",
          redirect_uris: ["http://localhost:8080/callback"],
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.client_id).toBeDefined();
      expect(body.client_id).toMatch(/^dyn_/);
      expect(body.client_name).toBe("Test Client");
      expect(body.redirect_uris).toEqual([
        "http://localhost:8080/callback",
      ]);
      expect(body.grant_types).toEqual(["authorization_code"]);
      expect(body.response_types).toEqual(["code"]);
      expect(body.token_endpoint_auth_method).toBe("none");
      expect(body.client_id_issued_at).toBeDefined();

      // Verify Cache-Control headers
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("Pragma")).toBe("no-cache");
    });

    it("accepts custom grant_types and response_types", async () => {
      mockPrisma.oAuthClient.create.mockResolvedValue({});

      const res = await app.request("/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Full Client",
          redirect_uris: ["http://localhost:3000/callback"],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.grant_types).toEqual([
        "authorization_code",
        "refresh_token",
      ]);
    });

    it("rejects missing client_name", async () => {
      const res = await app.request("/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:8080/callback"],
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_client_metadata");
      expect(body.error_description).toContain("client_name");
    });

    it("rejects missing redirect_uris", async () => {
      const res = await app.request("/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "No URIs",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_client_metadata");
      expect(body.error_description).toContain("redirect_uris");
    });

    it("rejects empty redirect_uris array", async () => {
      const res = await app.request("/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Empty URIs",
          redirect_uris: [],
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_client_metadata");
    });

    it("rejects invalid redirect_uri (plain HTTP remote)", async () => {
      const res = await app.request("/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Bad URI",
          redirect_uris: ["http://example.com/callback"],
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_redirect_uri");
    });

    it("rejects unsupported grant_types", async () => {
      const res = await app.request("/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Bad Grants",
          redirect_uris: ["http://localhost:3000/callback"],
          grant_types: ["client_credentials"],
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_client_metadata");
      expect(body.error_description).toContain("grant_type");
    });

    it("rejects unsupported response_types", async () => {
      const res = await app.request("/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Bad Response",
          redirect_uris: ["http://localhost:3000/callback"],
          response_types: ["token"],
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_client_metadata");
      expect(body.error_description).toContain("response_type");
    });

    it("rejects invalid JSON body", async () => {
      const res = await app.request("/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_client_metadata");
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// OAuth Authorize
// ══════════════════════════════════════════════════════════════════════════

describe("OAuth Authorize", () => {
  let app: Hono;

  const validClient = {
    clientId: "dyn_test-client",
    clientName: "Test App",
    redirectUris: ["http://localhost:8080/callback"],
    grantTypes: ["authorization_code"],
  };

  beforeEach(async () => {
    const { authorize } = await import("./authorize");
    app = new Hono();
    app.route("/", authorize);
  });

  describe("GET /oauth/authorize", () => {
    it("returns 400 when client_id is missing", async () => {
      const res = await app.request(
        "/oauth/authorize?redirect_uri=http://localhost:8080/callback"
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_request");
    });

    it("returns 400 when redirect_uri is missing", async () => {
      const res = await app.request(
        "/oauth/authorize?client_id=dyn_test"
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_request");
    });

    it("returns 400 when client_id is unknown", async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(null);

      const res = await app.request(
        "/oauth/authorize?client_id=dyn_unknown&redirect_uri=http://localhost:8080/callback"
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_client");
    });

    it("returns 400 when redirect_uri is not registered", async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(validClient);

      const res = await app.request(
        "/oauth/authorize?client_id=dyn_test-client&redirect_uri=http://localhost:9999/wrong"
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_request");
      expect(body.error_description).toContain("redirect_uri");
    });

    it("redirects with error when response_type is missing", async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(validClient);

      const res = await app.request(
        "/oauth/authorize?client_id=dyn_test-client&redirect_uri=http://localhost:8080/callback&code_challenge=abc&code_challenge_method=S256"
      );

      // Missing response_type -> redirect error (not JSON error, since redirect_uri is valid)
      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("error=invalid_request");
    });

    it("redirects with error when response_type is not 'code'", async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(validClient);

      const res = await app.request(
        "/oauth/authorize?client_id=dyn_test-client&redirect_uri=http://localhost:8080/callback&response_type=token&code_challenge=abc&code_challenge_method=S256"
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("error=unsupported_response_type");
    });

    it("redirects with error when code_challenge_method is not S256", async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(validClient);

      const res = await app.request(
        "/oauth/authorize?client_id=dyn_test-client&redirect_uri=http://localhost:8080/callback&response_type=code&code_challenge=abc&code_challenge_method=plain"
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("error=invalid_request");
    });

    it("redirects with error for unsupported scope", async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(validClient);

      const res = await app.request(
        "/oauth/authorize?client_id=dyn_test-client&redirect_uri=http://localhost:8080/callback&response_type=code&code_challenge=abc&code_challenge_method=S256&scope=admin:full"
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("error=invalid_scope");
    });

    it("preserves state parameter in error redirects", async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(validClient);

      const res = await app.request(
        "/oauth/authorize?client_id=dyn_test-client&redirect_uri=http://localhost:8080/callback&response_type=token&code_challenge=abc&code_challenge_method=S256&state=xyz123"
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("state=xyz123");
    });

    it("returns 500 when CLERK_PUBLISHABLE_KEY is not set", async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(validClient);
      delete process.env.CLERK_PUBLISHABLE_KEY;

      const res = await app.request(
        "/oauth/authorize?client_id=dyn_test-client&redirect_uri=http://localhost:8080/callback&response_type=code&code_challenge=abc&code_challenge_method=S256"
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("server_error");
    });

    it("serves consent HTML page with valid parameters", async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(validClient);

      const res = await app.request(
        "/oauth/authorize?client_id=dyn_test-client&redirect_uri=http://localhost:8080/callback&response_type=code&code_challenge=abc&code_challenge_method=S256"
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("knownissue");
      expect(html).toContain("Test App");
      expect(html).toContain(process.env.CLERK_PUBLISHABLE_KEY!);
    });
  });

  describe("POST /oauth/approve", () => {
    it("returns 400 for invalid request body", async () => {
      const res = await app.request("/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_request");
    });

    it("returns 400 when required fields are missing", async () => {
      const res = await app.request("/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: "dyn_test" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_request");
      expect(body.error_description).toContain("Missing required fields");
    });

    it("returns 500 when CLERK_SECRET_KEY is not configured", async () => {
      delete process.env.CLERK_SECRET_KEY;

      const res = await app.request("/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "dyn_test",
          redirect_uri: "http://localhost:8080/callback",
          code_challenge: "abc",
          session_token: "token",
        }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("server_error");
    });

    it("returns 403 when Clerk session token is invalid", async () => {
      mockVerifyToken.mockRejectedValue(new Error("Invalid token"));

      const res = await app.request("/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "dyn_test",
          redirect_uri: "http://localhost:8080/callback",
          code_challenge: "abc",
          session_token: "bad-token",
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("access_denied");
    });

    it("returns 403 when Clerk token has no sub", async () => {
      mockVerifyToken.mockResolvedValue({ sub: "" });

      const res = await app.request("/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "dyn_test",
          redirect_uri: "http://localhost:8080/callback",
          code_challenge: "abc",
          session_token: "no-sub-token",
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("access_denied");
    });

    it("returns 400 when client_id is unknown", async () => {
      mockVerifyToken.mockResolvedValue({ sub: "clerk-user-1" });
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(null);

      const res = await app.request("/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "dyn_unknown",
          redirect_uri: "http://localhost:8080/callback",
          code_challenge: "abc",
          session_token: "valid-token",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_client");
    });

    it("returns 400 when redirect_uri is not registered", async () => {
      mockVerifyToken.mockResolvedValue({ sub: "clerk-user-1" });
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(validClient);

      const res = await app.request("/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "dyn_test-client",
          redirect_uri: "http://localhost:9999/wrong",
          code_challenge: "abc",
          session_token: "valid-token",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_request");
    });

    it("returns 400 for unsupported scope", async () => {
      mockVerifyToken.mockResolvedValue({ sub: "clerk-user-1" });
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(validClient);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        clerkId: "clerk-user-1",
        credits: 10,
      });

      const res = await app.request("/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "dyn_test-client",
          redirect_uri: "http://localhost:8080/callback",
          code_challenge: "abc",
          session_token: "valid-token",
          scope: "admin:full",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_scope");
    });

    it("creates auth code and returns redirect URL for valid request", async () => {
      mockVerifyToken.mockResolvedValue({ sub: "clerk-user-1" });
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(validClient);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        clerkId: "clerk-user-1",
        credits: 10,
      });
      mockPrisma.oAuthAuthorizationCode.create.mockResolvedValue({});

      const res = await app.request("/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "dyn_test-client",
          redirect_uri: "http://localhost:8080/callback",
          code_challenge: "abc",
          session_token: "valid-token",
          state: "mystate",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.redirect).toContain("http://localhost:8080/callback");
      expect(body.redirect).toContain("code=");
      expect(body.redirect).toContain("state=mystate");

      // Auth code should be stored with hash
      expect(mockPrisma.oAuthAuthorizationCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clientId: "dyn_test-client",
          userId: "user-1",
          redirectUri: "http://localhost:8080/callback",
          codeChallenge: "abc",
          scopes: ["mcp:tools"],
        }),
      });
    });

    it("auto-creates user on first OAuth approval", async () => {
      mockVerifyToken.mockResolvedValue({ sub: "clerk-new-user" });
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(validClient);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: "new-user",
        clerkId: "clerk-new-user",
        credits: 5,
      });
      mockPrisma.oAuthAuthorizationCode.create.mockResolvedValue({});

      const res = await app.request("/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "dyn_test-client",
          redirect_uri: "http://localhost:8080/callback",
          code_challenge: "abc",
          session_token: "valid-token",
        }),
      });

      expect(res.status).toBe(200);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clerkId: "clerk-new-user",
          credits: 5, // SIGNUP_BONUS
        }),
      });
    });

    it("stores resource when provided", async () => {
      mockVerifyToken.mockResolvedValue({ sub: "clerk-user-1" });
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(validClient);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        clerkId: "clerk-user-1",
      });
      mockPrisma.oAuthAuthorizationCode.create.mockResolvedValue({});

      await app.request("/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "dyn_test-client",
          redirect_uri: "http://localhost:8080/callback",
          code_challenge: "abc",
          session_token: "valid-token",
          resource: "http://localhost:3001",
        }),
      });

      expect(mockPrisma.oAuthAuthorizationCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          resource: "http://localhost:3001",
        }),
      });
    });

    it("stores null resource when not provided", async () => {
      mockVerifyToken.mockResolvedValue({ sub: "clerk-user-1" });
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(validClient);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        clerkId: "clerk-user-1",
      });
      mockPrisma.oAuthAuthorizationCode.create.mockResolvedValue({});

      await app.request("/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "dyn_test-client",
          redirect_uri: "http://localhost:8080/callback",
          code_challenge: "abc",
          session_token: "valid-token",
        }),
      });

      expect(mockPrisma.oAuthAuthorizationCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          resource: null,
        }),
      });
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// OAuth Token
// ══════════════════════════════════════════════════════════════════════════

describe("OAuth Token", () => {
  let app: Hono;

  beforeEach(async () => {
    const { token } = await import("./token");
    app = new Hono();
    app.route("/", token);
  });

  describe("POST / (unsupported grant_type)", () => {
    it("returns 400 for unsupported grant_type", async () => {
      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "client_credentials" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("unsupported_grant_type");
    });

    it("returns 400 for missing grant_type", async () => {
      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("unsupported_grant_type");
    });
  });

  describe("authorization_code grant", () => {
    const validCodeChallenge = createHash("sha256")
      .update("test-code-verifier")
      .digest("base64url");

    const validAuthCode = {
      code: sha256("test-auth-code"),
      clientId: "dyn_test-client",
      userId: "user-1",
      redirectUri: "http://localhost:8080/callback",
      codeChallenge: validCodeChallenge,
      scopes: ["mcp:tools"],
      resource: null,
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
      usedAt: null,
    };

    it("returns 400 when required fields are missing", async () => {
      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: "test-code",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_request");
      expect(body.error_description).toContain("Missing required fields");
    });

    it("returns 400 when auth code is not found", async () => {
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue(null);

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: "unknown-code",
          code_verifier: "test-code-verifier",
          redirect_uri: "http://localhost:8080/callback",
          client_id: "dyn_test-client",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
      expect(body.error_description).toContain("Invalid authorization code");
    });

    it("returns 400 when auth code is expired", async () => {
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        ...validAuthCode,
        expiresAt: new Date(Date.now() - 1000), // expired
      });

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: "test-auth-code",
          code_verifier: "test-code-verifier",
          redirect_uri: "http://localhost:8080/callback",
          client_id: "dyn_test-client",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
      expect(body.error_description).toContain("expired");
    });

    it("returns 400 when client_id does not match", async () => {
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue(
        validAuthCode
      );

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: "test-auth-code",
          code_verifier: "test-code-verifier",
          redirect_uri: "http://localhost:8080/callback",
          client_id: "dyn_wrong-client",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
      expect(body.error_description).toContain("Client ID");
    });

    it("returns 400 when redirect_uri does not match", async () => {
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue(
        validAuthCode
      );

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: "test-auth-code",
          code_verifier: "test-code-verifier",
          redirect_uri: "http://localhost:9999/wrong",
          client_id: "dyn_test-client",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
      expect(body.error_description).toContain("Redirect URI");
    });

    it("returns 400 when PKCE verification fails", async () => {
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue(
        validAuthCode
      );

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: "test-auth-code",
          code_verifier: "wrong-verifier",
          redirect_uri: "http://localhost:8080/callback",
          client_id: "dyn_test-client",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
      expect(body.error_description).toContain("PKCE");
    });

    it("returns 400 when resource indicator does not match", async () => {
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        ...validAuthCode,
        resource: "http://localhost:3001",
      });

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: "test-auth-code",
          code_verifier: "test-code-verifier",
          redirect_uri: "http://localhost:8080/callback",
          client_id: "dyn_test-client",
          resource: "http://other-server:3001",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
      expect(body.error_description).toContain("Resource indicator");
    });

    it("returns 400 and revokes tokens when auth code is already used", async () => {
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue(
        validAuthCode
      );
      // updateMany returns count=0 meaning code was already used
      mockPrisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({
        count: 0,
      });
      // Previous tokens exist
      mockPrisma.oAuthAccessToken.findMany.mockResolvedValue([
        { id: "token-1" },
      ]);
      mockPrisma.$transaction.mockResolvedValue([]);

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: "test-auth-code",
          code_verifier: "test-code-verifier",
          redirect_uri: "http://localhost:8080/callback",
          client_id: "dyn_test-client",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
      expect(body.error_description).toContain("already been used");

      // Should have revoked previously issued tokens
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("returns tokens on successful exchange", async () => {
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue(
        validAuthCode
      );
      mockPrisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.oAuthAccessToken.create.mockResolvedValue({
        id: "access-token-1",
      });
      mockPrisma.oAuthRefreshToken.create.mockResolvedValue({});

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: "test-auth-code",
          code_verifier: "test-code-verifier",
          redirect_uri: "http://localhost:8080/callback",
          client_id: "dyn_test-client",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.access_token).toMatch(/^ki_/);
      expect(body.refresh_token).toMatch(/^kir_/);
      expect(body.token_type).toBe("Bearer");
      expect(body.expires_in).toBe(3600);
      expect(body.scope).toBe("mcp:tools");

      // Cache headers
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("Pragma")).toBe("no-cache");
    });

    it("includes resource in token response when present", async () => {
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        ...validAuthCode,
        resource: "http://localhost:3001",
      });
      mockPrisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.oAuthAccessToken.create.mockResolvedValue({
        id: "access-token-1",
      });
      mockPrisma.oAuthRefreshToken.create.mockResolvedValue({});

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: "test-auth-code",
          code_verifier: "test-code-verifier",
          redirect_uri: "http://localhost:8080/callback",
          client_id: "dyn_test-client",
          resource: "http://localhost:3001",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.resource).toBe("http://localhost:3001");
    });

    it("accepts form-urlencoded body", async () => {
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue(
        validAuthCode
      );
      mockPrisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.oAuthAccessToken.create.mockResolvedValue({
        id: "access-token-1",
      });
      mockPrisma.oAuthRefreshToken.create.mockResolvedValue({});

      const formBody = new URLSearchParams({
        grant_type: "authorization_code",
        code: "test-auth-code",
        code_verifier: "test-code-verifier",
        redirect_uri: "http://localhost:8080/callback",
        client_id: "dyn_test-client",
      });

      const res = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody.toString(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.access_token).toBeDefined();
    });
  });

  describe("refresh_token grant", () => {
    const validRefreshTokenRecord = {
      id: "refresh-1",
      tokenHash: sha256("kir_test-refresh-token"),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      accessTokenId: "access-1",
      accessToken: {
        id: "access-1",
        clientId: "dyn_test-client",
        userId: "user-1",
        scopes: ["mcp:tools"],
        resource: null,
      },
    };

    it("returns 400 when required fields are missing", async () => {
      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_request");
      expect(body.error_description).toContain("Missing required fields");
    });

    it("returns 400 when refresh token is not found", async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue(null);

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: "kir_unknown",
          client_id: "dyn_test-client",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
      expect(body.error_description).toContain("Invalid refresh token");
    });

    it("returns 400 when refresh token is revoked", async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        ...validRefreshTokenRecord,
        revokedAt: new Date(), // revoked
      });

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: "kir_test-refresh-token",
          client_id: "dyn_test-client",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
      expect(body.error_description).toContain("revoked");
    });

    it("returns 400 when refresh token is expired", async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        ...validRefreshTokenRecord,
        expiresAt: new Date(Date.now() - 1000), // expired
      });

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: "kir_test-refresh-token",
          client_id: "dyn_test-client",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
      expect(body.error_description).toContain("expired");
    });

    it("returns 400 when client_id does not match", async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue(
        validRefreshTokenRecord
      );

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: "kir_test-refresh-token",
          client_id: "dyn_wrong-client",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
      expect(body.error_description).toContain("Client ID");
    });

    it("rotates tokens on successful refresh", async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue(
        validRefreshTokenRecord
      );
      mockPrisma.$transaction.mockResolvedValue([]);
      mockPrisma.oAuthAccessToken.create.mockResolvedValue({
        id: "new-access-1",
      });
      mockPrisma.oAuthRefreshToken.create.mockResolvedValue({});

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: "kir_test-refresh-token",
          client_id: "dyn_test-client",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.access_token).toMatch(/^ki_/);
      expect(body.refresh_token).toMatch(/^kir_/);
      expect(body.token_type).toBe("Bearer");
      expect(body.expires_in).toBe(3600);
      expect(body.scope).toBe("mcp:tools");

      // Old tokens should be revoked via transaction
      expect(mockPrisma.$transaction).toHaveBeenCalled();

      // Cache headers
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("Pragma")).toBe("no-cache");
    });

    it("includes resource in refresh token response when present", async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        ...validRefreshTokenRecord,
        accessToken: {
          ...validRefreshTokenRecord.accessToken,
          resource: "http://localhost:3001",
        },
      });
      mockPrisma.$transaction.mockResolvedValue([]);
      mockPrisma.oAuthAccessToken.create.mockResolvedValue({
        id: "new-access-1",
      });
      mockPrisma.oAuthRefreshToken.create.mockResolvedValue({});

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: "kir_test-refresh-token",
          client_id: "dyn_test-client",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.resource).toBe("http://localhost:3001");
    });

    it("preserves scopes from original access token", async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        ...validRefreshTokenRecord,
        accessToken: {
          ...validRefreshTokenRecord.accessToken,
          scopes: ["mcp:tools"],
        },
      });
      mockPrisma.$transaction.mockResolvedValue([]);
      mockPrisma.oAuthAccessToken.create.mockResolvedValue({
        id: "new-access-1",
      });
      mockPrisma.oAuthRefreshToken.create.mockResolvedValue({});

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: "kir_test-refresh-token",
          client_id: "dyn_test-client",
        }),
      });

      expect(res.status).toBe(200);

      // New access token should have same scopes
      expect(mockPrisma.oAuthAccessToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scopes: ["mcp:tools"],
          userId: "user-1",
        }),
      });
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// OAuth Revoke
// ══════════════════════════════════════════════════════════════════════════

describe("OAuth Revoke", () => {
  let app: Hono;

  beforeEach(async () => {
    const { revoke } = await import("./revoke");
    app = new Hono();
    app.route("/", revoke);
  });

  describe("POST /oauth/revoke", () => {
    it("returns 400 when token is missing", async () => {
      const res = await app.request("/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_request");
    });

    it("returns 200 for unknown access token (RFC 7009)", async () => {
      mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue(null);

      const res = await app.request("/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "ki_unknown-token" }),
      });

      // RFC 7009: always return 200 regardless
      expect(res.status).toBe(200);
    });

    it("revokes access token and associated refresh tokens", async () => {
      const tokenId = "access-token-id";
      mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue({
        id: tokenId,
        tokenHash: sha256("ki_valid-token"),
        revokedAt: null,
      });
      mockPrisma.$transaction.mockResolvedValue([]);

      const res = await app.request("/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "ki_valid-token" }),
      });

      expect(res.status).toBe(200);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("returns 200 for already-revoked access token", async () => {
      mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue({
        id: "access-1",
        tokenHash: sha256("ki_revoked"),
        revokedAt: new Date(), // already revoked
      });

      const res = await app.request("/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "ki_revoked" }),
      });

      expect(res.status).toBe(200);
      // No transaction should happen for already-revoked tokens
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("revokes refresh token and associated access token", async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        id: "refresh-1",
        tokenHash: sha256("kir_valid-refresh"),
        revokedAt: null,
        accessTokenId: "access-1",
      });
      mockPrisma.$transaction.mockResolvedValue([]);

      const res = await app.request("/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "kir_valid-refresh",
          token_type_hint: "refresh_token",
        }),
      });

      expect(res.status).toBe(200);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("uses token_type_hint to optimize lookup order", async () => {
      // With refresh_token hint, should try refresh first
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        id: "refresh-1",
        tokenHash: sha256("kir_hinted"),
        revokedAt: null,
        accessTokenId: "access-1",
      });
      mockPrisma.$transaction.mockResolvedValue([]);

      await app.request("/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "kir_hinted",
          token_type_hint: "refresh_token",
        }),
      });

      // Refresh token lookup should have been attempted
      expect(mockPrisma.oAuthRefreshToken.findUnique).toHaveBeenCalled();
    });

    it("tries access token first without hint (default)", async () => {
      // Token doesn't match ki_ prefix so access lookup is skipped,
      // then refresh doesn't match kir_ prefix either
      mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue(null);
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue(null);

      const res = await app.request("/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "ki_unknown" }),
      });

      // Should still return 200
      expect(res.status).toBe(200);
    });

    it("returns 200 for already-revoked refresh token", async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        id: "refresh-1",
        tokenHash: sha256("kir_revoked"),
        revokedAt: new Date(), // already revoked
        accessTokenId: "access-1",
      });

      const res = await app.request("/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "kir_revoked",
          token_type_hint: "refresh_token",
        }),
      });

      expect(res.status).toBe(200);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("accepts form-urlencoded body", async () => {
      mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue(null);

      const formBody = new URLSearchParams({
        token: "ki_form-token",
      });

      const res = await app.request("/oauth/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody.toString(),
      });

      expect(res.status).toBe(200);
    });

    it("returns 200 for token that does not match any prefix", async () => {
      // Token without ki_ or kir_ prefix should not match either strategy
      const res = await app.request("/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "random-token-no-prefix" }),
      });

      // Still returns 200 per RFC 7009
      expect(res.status).toBe(200);
      expect(mockPrisma.oAuthAccessToken.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.oAuthRefreshToken.findUnique).not.toHaveBeenCalled();
    });
  });
});
