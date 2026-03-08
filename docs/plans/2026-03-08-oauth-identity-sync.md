# OAuth 2.1 Identity Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace GitHub PAT auth with OAuth 2.1 using Clerk as the identity provider, eliminating split identities between MCP agents and web dashboard users.

**Architecture:** knownissue API becomes an OAuth 2.1 Authorization Server (RFC 8414, RFC 7591, RFC 9728). Clerk handles user authentication via its JS SDK embedded in a consent page served by Hono. MCP clients discover OAuth endpoints via `.well-known` metadata, dynamically register, then authenticate through a browser-based flow. Web dashboard continues using Clerk JWTs directly. Both paths resolve to the same User via `clerkId`.

**Tech Stack:** Hono (OAuth routes), Prisma (OAuth tables), `@clerk/clerk-js` (browser sign-in), `@clerk/backend` (token verification), `node:crypto` (PKCE, token hashing).

**Design doc:** `docs/plans/2026-03-08-oauth-identity-sync-design.md`

---

### Task 1: Schema Migration — OAuth Tables + User Model Changes

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/shared/src/types.ts`

**Step 1: Add OAuth models to Prisma schema**

Add these four models at the end of `packages/db/prisma/schema.prisma`:

```prisma
model OAuthClient {
  id           String   @id @default(uuid())
  clientId     String   @unique
  clientName   String
  redirectUris String[]
  grantTypes   String[]
  createdAt    DateTime @default(now())

  authCodes    OAuthAuthorizationCode[]
  accessTokens OAuthAccessToken[]
}

model OAuthAuthorizationCode {
  id            String    @id @default(uuid())
  code          String    @unique
  clientId      String
  client        OAuthClient @relation(fields: [clientId], references: [clientId])
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  redirectUri   String
  codeChallenge String
  scopes        String[]
  expiresAt     DateTime
  usedAt        DateTime?
  createdAt     DateTime  @default(now())
}

model OAuthAccessToken {
  id        String    @id @default(uuid())
  tokenHash String    @unique
  clientId  String
  client    OAuthClient @relation(fields: [clientId], references: [clientId])
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  scopes    String[]
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  refreshToken OAuthRefreshToken?
}

model OAuthRefreshToken {
  id            String    @id @default(uuid())
  tokenHash     String    @unique
  accessTokenId String    @unique
  accessToken   OAuthAccessToken @relation(fields: [accessTokenId], references: [id], onDelete: Cascade)
  expiresAt     DateTime
  revokedAt     DateTime?
  createdAt     DateTime  @default(now())
}
```

**Step 2: Update User model**

In the existing `User` model in `packages/db/prisma/schema.prisma`, change:

```prisma
model User {
  id             String   @id @default(uuid())
  githubUsername  String?  @unique    // was: String @unique — now nullable
  clerkId        String   @unique    // was: String? @unique — now required
  avatarUrl      String?
  credits        Int      @default(5)
  role           Role     @default(user)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  bugs               Bug[]
  patches            Patch[]
  verifications      Verification[]
  patchAccesses      PatchAccess[]
  creditTransactions CreditTransaction[]
  auditLogs          AuditLog[]
  oauthAuthCodes     OAuthAuthorizationCode[]
  oauthAccessTokens  OAuthAccessToken[]
}
```

**Step 3: Update User type in shared package**

In `packages/shared/src/types.ts`, change the User interface:

```typescript
export interface User {
  id: string;
  githubUsername: string | null;  // was: string — now nullable
  clerkId: string;               // was: string | null — now required
  avatarUrl: string | null;
  credits: number;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}
```

**Step 4: Run migration**

```bash
cd packages/db && pnpm prisma migrate dev --name oauth-identity-sync
```

Expected: migration applies, 4 new tables created, User columns altered.

**Step 5: Regenerate Prisma client**

```bash
pnpm db:generate
```

**Step 6: Commit**

```bash
git add packages/db/prisma/ packages/shared/src/types.ts
git commit -m "feat: add OAuth tables, make githubUsername nullable, clerkId required"
```

---

### Task 2: OAuth Utility Functions

**Files:**
- Create: `apps/api/src/oauth/utils.ts`

**Step 1: Create utils module**

Create `apps/api/src/oauth/utils.ts` with PKCE verification, token generation, and hashing:

```typescript
import { createHash, randomBytes } from "node:crypto";

// Token prefixes
export const ACCESS_TOKEN_PREFIX = "ki_";
export const REFRESH_TOKEN_PREFIX = "kir_";
export const CLIENT_ID_PREFIX = "dyn_";

// Lifetimes
export const ACCESS_TOKEN_TTL = 60 * 60 * 1000;         // 1 hour
export const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
export const AUTH_CODE_TTL = 60 * 1000;                  // 60 seconds

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

export function generateClientId(): string {
  return `${CLIENT_ID_PREFIX}${randomBytes(16).toString("base64url")}`;
}

export function generateAuthCode(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Verify PKCE S256 code_challenge matches code_verifier.
 * challenge = BASE64URL(SHA256(verifier))
 */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const expected = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return expected === codeChallenge;
}

/**
 * Validate redirect URI: must be localhost or HTTPS.
 */
export function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return true;
    }
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Get the API base URL from environment.
 */
export function getApiBaseUrl(): string {
  return process.env.API_BASE_URL || `http://localhost:${process.env.API_PORT || 3001}`;
}
```

**Step 2: Commit**

```bash
git add apps/api/src/oauth/utils.ts
git commit -m "feat: add OAuth utility functions (PKCE, tokens, hashing)"
```

---

### Task 3: OAuth Constants in Shared Package

**Files:**
- Modify: `packages/shared/src/constants.ts`

**Step 1: Add OAuth constants**

Append to `packages/shared/src/constants.ts`:

```typescript
// OAuth 2.1
export const OAUTH_ACCESS_TOKEN_TTL = 60 * 60 * 1000;           // 1 hour
export const OAUTH_REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
export const OAUTH_AUTH_CODE_TTL = 60 * 1000;                     // 60 seconds
export const OAUTH_SCOPES = ["mcp:tools"] as const;
```

**Step 2: Commit**

```bash
git add packages/shared/src/constants.ts
git commit -m "feat: add OAuth constants to shared package"
```

---

### Task 4: Discovery Endpoints (`.well-known`)

**Files:**
- Create: `apps/api/src/oauth/metadata.ts`

**Step 1: Create metadata routes**

Create `apps/api/src/oauth/metadata.ts`:

```typescript
import { Hono } from "hono";
import { getApiBaseUrl } from "./utils";

const metadata = new Hono();

// RFC 9728 — Protected Resource Metadata
metadata.get("/.well-known/oauth-protected-resource", (c) => {
  const baseUrl = getApiBaseUrl();
  return c.json({
    resource: baseUrl,
    authorization_servers: [baseUrl],
    scopes_supported: ["mcp:tools"],
  });
});

// RFC 8414 — Authorization Server Metadata
metadata.get("/.well-known/oauth-authorization-server", (c) => {
  const baseUrl = getApiBaseUrl();
  return c.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp:tools"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

export { metadata };
```

**Step 2: Commit**

```bash
git add apps/api/src/oauth/metadata.ts
git commit -m "feat: add .well-known OAuth discovery endpoints"
```

---

### Task 5: Dynamic Client Registration

**Files:**
- Create: `apps/api/src/oauth/register.ts`

**Step 1: Create registration endpoint**

Create `apps/api/src/oauth/register.ts`:

```typescript
import { Hono } from "hono";
import { prisma } from "@knownissue/db";
import { generateClientId, isValidRedirectUri } from "./utils";

const register = new Hono();

// RFC 7591 — Dynamic Client Registration
register.post("/oauth/register", async (c) => {
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid_client_metadata" }, 400);
  }

  const { client_name, redirect_uris, grant_types, response_types } = body as {
    client_name?: string;
    redirect_uris?: string[];
    grant_types?: string[];
    response_types?: string[];
  };

  if (!client_name || typeof client_name !== "string") {
    return c.json({ error: "invalid_client_metadata", error_description: "client_name is required" }, 400);
  }

  if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return c.json({ error: "invalid_client_metadata", error_description: "redirect_uris is required" }, 400);
  }

  for (const uri of redirect_uris) {
    if (!isValidRedirectUri(uri)) {
      return c.json({
        error: "invalid_redirect_uri",
        error_description: `Invalid redirect URI: ${uri}. Must be localhost or HTTPS.`,
      }, 400);
    }
  }

  const resolvedGrantTypes = grant_types ?? ["authorization_code"];
  const resolvedResponseTypes = response_types ?? ["code"];

  const clientId = generateClientId();

  await prisma.oAuthClient.create({
    data: {
      clientId,
      clientName: client_name,
      redirectUris: redirect_uris,
      grantTypes: resolvedGrantTypes,
      responseTypes: resolvedResponseTypes,
    },
  });

  return c.json({
    client_id: clientId,
    client_name,
    redirect_uris,
    grant_types: resolvedGrantTypes,
    response_types: resolvedResponseTypes,
  }, 201);
});

export { register };
```

**Step 2: Commit**

```bash
git add apps/api/src/oauth/register.ts
git commit -m "feat: add dynamic client registration endpoint (RFC 7591)"
```

---

### Task 6: Authorization Endpoint + Consent Page

**Files:**
- Create: `apps/api/src/oauth/authorize.ts`

This is the most complex task. The `/oauth/authorize` endpoint validates params and serves an HTML page with Clerk's JS SDK for sign-in and consent. The `/oauth/approve` endpoint handles the form submission.

**Step 1: Create the authorize routes**

Create `apps/api/src/oauth/authorize.ts`:

```typescript
import { Hono } from "hono";
import { html } from "hono/html";
import { verifyToken } from "@clerk/backend";
import { prisma } from "@knownissue/db";
import { SIGNUP_BONUS } from "@knownissue/shared";
import { generateAuthCode, hashToken, AUTH_CODE_TTL } from "./utils";

const authorize = new Hono();

// GET /oauth/authorize — validate params, serve consent page
authorize.get("/oauth/authorize", async (c) => {
  const clientId = c.req.query("client_id");
  const redirectUri = c.req.query("redirect_uri");
  const responseType = c.req.query("response_type");
  const codeChallenge = c.req.query("code_challenge");
  const codeChallengeMethod = c.req.query("code_challenge_method");
  const scope = c.req.query("scope");
  const state = c.req.query("state") ?? "";

  // Validate required params
  if (!clientId || !redirectUri || !responseType || !codeChallenge || !codeChallengeMethod) {
    return c.json({ error: "invalid_request", error_description: "Missing required parameters" }, 400);
  }

  if (responseType !== "code") {
    return c.json({ error: "unsupported_response_type" }, 400);
  }

  if (codeChallengeMethod !== "S256") {
    return c.json({ error: "invalid_request", error_description: "Only S256 code_challenge_method is supported" }, 400);
  }

  // Validate client
  const client = await prisma.oAuthClient.findUnique({
    where: { clientId },
  });

  if (!client) {
    return c.json({ error: "invalid_client", error_description: "Unknown client_id" }, 400);
  }

  if (!client.redirectUris.includes(redirectUri)) {
    return c.json({ error: "invalid_request", error_description: "redirect_uri does not match registration" }, 400);
  }

  const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
  if (!clerkPublishableKey) {
    return c.json({ error: "server_error", error_description: "OAuth not configured" }, 500);
  }

  // Serve the consent page
  const page = html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Authorize — knownissue</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
      background: #0a0a0a; color: #e5e5e5;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 1rem;
    }
    .container { max-width: 420px; width: 100%; }
    .header { text-align: center; margin-bottom: 2rem; }
    .header h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
    .header p { font-size: 0.8rem; color: #a3a3a3; }
    #clerk-auth { margin-bottom: 1.5rem; }
    .consent { display: none; }
    .consent.visible { display: block; }
    .consent-box {
      border: 1px solid #262626; border-radius: 8px; padding: 1.25rem;
      background: #141414; margin-bottom: 1rem;
    }
    .consent-box p { font-size: 0.85rem; line-height: 1.5; }
    .consent-box .app-name { color: #fff; font-weight: 600; }
    .consent-box .scope { color: #a3a3a3; font-size: 0.75rem; margin-top: 0.5rem; }
    .buttons { display: flex; gap: 0.75rem; }
    .buttons button {
      flex: 1; padding: 0.6rem; border-radius: 6px; border: none;
      font-family: inherit; font-size: 0.85rem; cursor: pointer;
      font-weight: 500;
    }
    .btn-approve { background: #fff; color: #0a0a0a; }
    .btn-deny { background: #262626; color: #e5e5e5; }
    .btn-approve:hover { background: #d4d4d4; }
    .btn-deny:hover { background: #333; }
    .error { color: #ef4444; font-size: 0.8rem; margin-top: 0.5rem; display: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>[knownissue]</h1>
      <p>shared bug memory for AI agents</p>
    </div>
    <div id="clerk-auth"></div>
    <div id="consent" class="consent">
      <div class="consent-box">
        <p><span class="app-name">${client.clientName}</span> wants to access your knownissue account.</p>
        <p class="scope">Scope: ${scope || "mcp:tools"}</p>
      </div>
      <form id="approve-form" method="POST" action="/oauth/approve">
        <input type="hidden" name="client_id" value="${clientId}" />
        <input type="hidden" name="redirect_uri" value="${redirectUri}" />
        <input type="hidden" name="code_challenge" value="${codeChallenge}" />
        <input type="hidden" name="scope" value="${scope || "mcp:tools"}" />
        <input type="hidden" name="state" value="${state}" />
        <input type="hidden" name="session_token" id="session-token" value="" />
        <div class="buttons">
          <button type="button" class="btn-deny" onclick="window.close()">Deny</button>
          <button type="submit" class="btn-approve">Approve</button>
        </div>
      </form>
      <p id="error" class="error"></p>
    </div>
  </div>
  <script
    async
    crossorigin="anonymous"
    data-clerk-publishable-key="${clerkPublishableKey}"
    src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js"
    type="text/javascript"
  ></script>
  <script>
    window.addEventListener('load', async () => {
      const clerkEl = document.getElementById('clerk-auth');
      const consentEl = document.getElementById('consent');
      const tokenInput = document.getElementById('session-token');
      const errorEl = document.getElementById('error');

      await window.Clerk.load();

      if (window.Clerk.user) {
        // Already signed in — show consent
        const token = await window.Clerk.session.getToken();
        tokenInput.value = token;
        consentEl.classList.add('visible');
      } else {
        // Not signed in — mount sign-in
        window.Clerk.mountSignIn(clerkEl, {
          afterSignInUrl: window.location.href,
          afterSignUpUrl: window.location.href,
        });

        // Watch for sign-in completion
        window.Clerk.addListener(async ({ user }) => {
          if (user) {
            window.Clerk.unmountSignIn(clerkEl);
            clerkEl.style.display = 'none';
            const token = await window.Clerk.session.getToken();
            tokenInput.value = token;
            consentEl.classList.add('visible');
          }
        });
      }

      // Handle form submit
      document.getElementById('approve-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = await window.Clerk.session.getToken();
        tokenInput.value = token;
        const formData = new FormData(e.target);
        try {
          const resp = await fetch('/oauth/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.fromEntries(formData)),
          });
          if (resp.redirected) {
            window.location.href = resp.url;
          } else if (resp.ok) {
            const data = await resp.json();
            if (data.redirect) window.location.href = data.redirect;
          } else {
            const data = await resp.json().catch(() => ({}));
            errorEl.textContent = data.error_description || 'Authorization failed';
            errorEl.style.display = 'block';
          }
        } catch (err) {
          errorEl.textContent = 'Network error. Please try again.';
          errorEl.style.display = 'block';
        }
      });
    });
  </script>
</body>
</html>`;

  return c.html(page);
});

// POST /oauth/approve — verify Clerk session, generate auth code
authorize.post("/oauth/approve", async (c) => {
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid_request" }, 400);
  }

  const { client_id, redirect_uri, code_challenge, scope, state, session_token } = body as {
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
    scope: string;
    state: string;
    session_token: string;
  };

  if (!session_token) {
    return c.json({ error: "access_denied", error_description: "No session token" }, 403);
  }

  // Verify Clerk session token
  let clerkUserId: string;
  try {
    const payload = await verifyToken(session_token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    clerkUserId = payload.sub;
  } catch {
    return c.json({ error: "access_denied", error_description: "Invalid session" }, 403);
  }

  // Validate client
  const client = await prisma.oAuthClient.findUnique({
    where: { clientId: client_id },
  });

  if (!client || !client.redirectUris.includes(redirect_uri)) {
    return c.json({ error: "invalid_client" }, 400);
  }

  // Find or create user by clerkId
  let user = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        clerkId: clerkUserId,
        credits: SIGNUP_BONUS,
      },
    });
  }

  // Generate authorization code
  const code = generateAuthCode();
  const scopes = (scope || "mcp:tools").split(" ");

  await prisma.oAuthAuthorizationCode.create({
    data: {
      code: hashToken(code),
      clientId: client_id,
      userId: user.id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      scopes,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL),
    },
  });

  // Build redirect URL
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  return c.json({ redirect: redirectUrl.toString() });
});

export { authorize };
```

**Step 2: Commit**

```bash
git add apps/api/src/oauth/authorize.ts
git commit -m "feat: add OAuth authorize endpoint with Clerk consent page"
```

---

### Task 7: Token Exchange Endpoint

**Files:**
- Create: `apps/api/src/oauth/token.ts`

**Step 1: Create token endpoint**

Create `apps/api/src/oauth/token.ts`:

```typescript
import { Hono } from "hono";
import { prisma } from "@knownissue/db";
import {
  hashToken,
  generateToken,
  verifyPkce,
  ACCESS_TOKEN_PREFIX,
  REFRESH_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
} from "./utils";

const token = new Hono();

// POST /oauth/token — exchange code or refresh token for access token
token.post("/oauth/token", async (c) => {
  // Accept both JSON and form-encoded (OAuth spec uses form-encoded)
  let body: Record<string, string>;
  const contentType = c.req.header("content-type") || "";

  if (contentType.includes("application/json")) {
    body = (await c.req.json().catch(() => null)) as Record<string, string>;
  } else {
    const formData = await c.req.parseBody();
    body = formData as Record<string, string>;
  }

  if (!body) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const grantType = body.grant_type;

  if (grantType === "authorization_code") {
    return handleAuthCodeGrant(c, body);
  } else if (grantType === "refresh_token") {
    return handleRefreshGrant(c, body);
  } else {
    return c.json({ error: "unsupported_grant_type" }, 400);
  }
});

async function handleAuthCodeGrant(c: any, body: Record<string, string>) {
  const { code, code_verifier, redirect_uri, client_id } = body;

  if (!code || !code_verifier || !redirect_uri || !client_id) {
    return c.json({ error: "invalid_request", error_description: "Missing required parameters" }, 400);
  }

  const codeHash = hashToken(code);

  // Look up authorization code
  const authCode = await prisma.oAuthAuthorizationCode.findUnique({
    where: { code: codeHash },
  });

  if (!authCode) {
    return c.json({ error: "invalid_grant", error_description: "Invalid authorization code" }, 400);
  }

  // Check expiry
  if (new Date() > authCode.expiresAt) {
    return c.json({ error: "invalid_grant", error_description: "Authorization code expired" }, 400);
  }

  // Check single-use
  if (authCode.usedAt) {
    return c.json({ error: "invalid_grant", error_description: "Authorization code already used" }, 400);
  }

  // Check client_id matches
  if (authCode.clientId !== client_id) {
    return c.json({ error: "invalid_grant", error_description: "client_id mismatch" }, 400);
  }

  // Check redirect_uri matches
  if (authCode.redirectUri !== redirect_uri) {
    return c.json({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, 400);
  }

  // Verify PKCE
  if (!verifyPkce(code_verifier, authCode.codeChallenge)) {
    return c.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
  }

  // Mark code as used
  await prisma.oAuthAuthorizationCode.update({
    where: { code: codeHash },
    data: { usedAt: new Date() },
  });

  // Generate tokens
  const accessToken = generateToken(ACCESS_TOKEN_PREFIX);
  const refreshToken = generateToken(REFRESH_TOKEN_PREFIX);

  const accessTokenRecord = await prisma.oAuthAccessToken.create({
    data: {
      tokenHash: hashToken(accessToken),
      clientId: client_id,
      userId: authCode.userId,
      scopes: authCode.scopes,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL),
    },
  });

  await prisma.oAuthRefreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      accessTokenId: accessTokenRecord.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL),
    },
  });

  return c.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL / 1000),
    refresh_token: refreshToken,
  });
}

async function handleRefreshGrant(c: any, body: Record<string, string>) {
  const { refresh_token: refreshTokenValue, client_id } = body;

  if (!refreshTokenValue || !client_id) {
    return c.json({ error: "invalid_request", error_description: "Missing required parameters" }, 400);
  }

  const refreshHash = hashToken(refreshTokenValue);

  const refreshRecord = await prisma.oAuthRefreshToken.findUnique({
    where: { tokenHash: refreshHash },
    include: { accessToken: true },
  });

  if (!refreshRecord) {
    return c.json({ error: "invalid_grant", error_description: "Invalid refresh token" }, 400);
  }

  if (refreshRecord.revokedAt) {
    return c.json({ error: "invalid_grant", error_description: "Refresh token revoked" }, 400);
  }

  if (new Date() > refreshRecord.expiresAt) {
    return c.json({ error: "invalid_grant", error_description: "Refresh token expired" }, 400);
  }

  if (refreshRecord.accessToken.clientId !== client_id) {
    return c.json({ error: "invalid_grant", error_description: "client_id mismatch" }, 400);
  }

  // Revoke old tokens (rotation)
  await prisma.$transaction([
    prisma.oAuthRefreshToken.update({
      where: { id: refreshRecord.id },
      data: { revokedAt: new Date() },
    }),
    prisma.oAuthAccessToken.update({
      where: { id: refreshRecord.accessTokenId },
      data: { revokedAt: new Date() },
    }),
  ]);

  // Issue new tokens
  const newAccessToken = generateToken(ACCESS_TOKEN_PREFIX);
  const newRefreshToken = generateToken(REFRESH_TOKEN_PREFIX);

  const newAccessTokenRecord = await prisma.oAuthAccessToken.create({
    data: {
      tokenHash: hashToken(newAccessToken),
      clientId: client_id,
      userId: refreshRecord.accessToken.userId,
      scopes: refreshRecord.accessToken.scopes,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL),
    },
  });

  await prisma.oAuthRefreshToken.create({
    data: {
      tokenHash: hashToken(newRefreshToken),
      accessTokenId: newAccessTokenRecord.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL),
    },
  });

  return c.json({
    access_token: newAccessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL / 1000),
    refresh_token: newRefreshToken,
  });
}

export { token };
```

**Step 2: Commit**

```bash
git add apps/api/src/oauth/token.ts
git commit -m "feat: add OAuth token exchange endpoint (auth code + refresh)"
```

---

### Task 8: Rewrite Auth Middleware

**Files:**
- Modify: `apps/api/src/middleware/auth.ts`

The middleware gets rewritten with a 3-strategy cascade:
1. knownissue access token (`ki_` prefix)
2. Clerk JWT
3. GitHub PAT (deprecated, kept temporarily)

Both `authMiddleware` and `optionalAuthMiddleware` use a single `resolveAuth` factory.

**Step 1: Rewrite `apps/api/src/middleware/auth.ts`**

```typescript
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createHash } from "node:crypto";
import { verifyToken } from "@clerk/backend";
import { prisma } from "@knownissue/db";
import { SIGNUP_BONUS } from "@knownissue/shared";
import type { User } from "@knownissue/shared";
import type { AppEnv } from "../lib/types";
import { getApiBaseUrl } from "../oauth/utils";

// GitHub token cache (deprecated path — will be removed before launch)
const validGhCache = new Map<string, { user: User; expiresAt: number }>();
const invalidGhCache = new Map<string, number>();
const GH_VALID_TTL = 5 * 60 * 1000;
const GH_INVALID_TTL = 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of validGhCache) if (now > v.expiresAt) validGhCache.delete(k);
  for (const [k, v] of invalidGhCache) if (now > v) invalidGhCache.delete(k);
}, 60_000).unref();

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function toUser(row: {
  id: string;
  githubUsername: string | null;
  clerkId: string | null;
  avatarUrl: string | null;
  credits: number;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}): User {
  return {
    id: row.id,
    githubUsername: row.githubUsername,
    clerkId: row.clerkId!,
    avatarUrl: row.avatarUrl,
    credits: row.credits,
    role: row.role as User["role"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Strategy 1: knownissue OAuth access token (ki_xxx)
 */
async function authenticateKnownissueToken(token: string): Promise<User | null> {
  if (!token.startsWith("ki_")) return null;

  const hash = sha256(token);
  const record = await prisma.oAuthAccessToken.findUnique({
    where: { tokenHash: hash },
    include: { user: true },
  });

  if (!record) return null;
  if (record.revokedAt) return null;
  if (new Date() > record.expiresAt) return null;

  return toUser(record.user);
}

/**
 * Strategy 2: Clerk JWT
 */
async function authenticateClerkJwt(token: string): Promise<User | null> {
  try {
    const authorizedParties = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
      : ["http://localhost:3000"];

    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
      authorizedParties,
    });

    const clerkUserId = payload.sub;
    if (!clerkUserId) return null;

    let user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          clerkId: clerkUserId,
          credits: SIGNUP_BONUS,
        },
      });
    }

    return toUser(user);
  } catch {
    return null;
  }
}

/**
 * Strategy 3: GitHub PAT (DEPRECATED — remove before launch)
 */
async function authenticateGitHubPat(token: string): Promise<User | null> {
  const hash = sha256(token);

  // Check caches
  const cached = validGhCache.get(hash);
  if (cached && Date.now() <= cached.expiresAt) return cached.user;

  const invalidAt = invalidGhCache.get(hash);
  if (invalidAt && Date.now() <= invalidAt) return null;

  try {
    const resp = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "knownissue-API",
      },
    });

    if (!resp.ok) {
      invalidGhCache.set(hash, Date.now() + GH_INVALID_TTL);
      return null;
    }

    const gh = (await resp.json()) as { login: string; avatar_url: string };

    let user = await prisma.user.findUnique({
      where: { githubUsername: gh.login },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          githubUsername: gh.login,
          clerkId: `gh_${gh.login}`, // temporary placeholder until Clerk link
          avatarUrl: gh.avatar_url,
          credits: SIGNUP_BONUS,
        },
      });
    }

    const userData = toUser(user);
    validGhCache.set(hash, { user: userData, expiresAt: Date.now() + GH_VALID_TTL });
    return userData;
  } catch {
    return null;
  }
}

/**
 * Resolve auth: tries all strategies in order.
 */
async function resolveUser(token: string): Promise<User | null> {
  // Strategy 1: knownissue token
  const kiUser = await authenticateKnownissueToken(token);
  if (kiUser) return kiUser;

  // Strategy 2: Clerk JWT
  const clerkUser = await authenticateClerkJwt(token);
  if (clerkUser) return clerkUser;

  // Strategy 3: GitHub PAT (deprecated)
  const ghUser = await authenticateGitHubPat(token);
  if (ghUser) return ghUser;

  return null;
}

function extractToken(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const auth = c.req.header("Authorization");
  if (!auth) return null;
  const token = auth.replace("Bearer ", "");
  return token || null;
}

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = extractToken(c);

  if (!token) {
    throw new HTTPException(401, { message: "Authorization header required" });
  }

  const user = await resolveUser(token);

  if (!user) {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }

  c.set("user", user);
  return next();
});

export const optionalAuthMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = extractToken(c);

  if (token) {
    const user = await resolveUser(token);
    if (user) {
      c.set("user", user);
    }
  }

  return next();
});

/**
 * MCP-specific auth middleware: returns OAuth-compliant 401 with WWW-Authenticate.
 */
export const mcpAuthMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = extractToken(c);

  if (!token) {
    const baseUrl = getApiBaseUrl();
    c.header(
      "WWW-Authenticate",
      `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
    );
    throw new HTTPException(401, { message: "Authorization required" });
  }

  const user = await resolveUser(token);

  if (!user) {
    const baseUrl = getApiBaseUrl();
    c.header(
      "WWW-Authenticate",
      `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
    );
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }

  c.set("user", user);
  return next();
});
```

**Step 2: Commit**

```bash
git add apps/api/src/middleware/auth.ts
git commit -m "feat: rewrite auth middleware with 3-strategy cascade + mcpAuthMiddleware"
```

---

### Task 9: Wire Up MCP Transport with OAuth 401

**Files:**
- Modify: `apps/api/src/mcp/transport.ts`

**Step 1: Update MCP transport to use `mcpAuthMiddleware`**

Replace the auth import and usage in `apps/api/src/mcp/transport.ts`:

```typescript
import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "./server";
import { mcpAuthMiddleware } from "../middleware/auth";
import type { AppEnv } from "../lib/types";

const mcp = new Hono<AppEnv>();

// MCP endpoint - requires auth (returns OAuth-compliant 401)
mcp.use("/mcp/*", mcpAuthMiddleware);
mcp.use("/mcp", mcpAuthMiddleware);

// POST /mcp - handle MCP JSON-RPC requests
mcp.post("/mcp", async (c) => {
  const user = c.get("user");
  const server = createMcpServer(user.id);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });

  await server.connect(transport);

  const response = await transport.handleRequest(c.req.raw);

  await server.close();

  return response;
});

// GET /mcp - informational endpoint for server metadata
mcp.get("/mcp", async (c) => {
  return c.json({
    name: "knownissue",
    version: "3.0.0",
    description: "knownissue MCP Server — shared bug memory for AI coding agents",
    tools: ["search", "report", "patch", "get_patch", "verify"],
    note: "Use POST /mcp with JSON-RPC to interact with tools. All responses include _meta.credits_remaining. SSE not available in stateless mode.",
  });
});

// DELETE /mcp - session termination
mcp.delete("/mcp", async (c) => {
  return c.json({ message: "Session terminated" });
});

export { mcp };
```

**Step 2: Commit**

```bash
git add apps/api/src/mcp/transport.ts
git commit -m "feat: use mcpAuthMiddleware with WWW-Authenticate 401 on MCP endpoint"
```

---

### Task 10: Wire OAuth Routes into Hono App

**Files:**
- Modify: `apps/api/src/index.ts`

**Step 1: Import and mount OAuth routes**

Add imports for the OAuth modules and mount them in `apps/api/src/index.ts`:

After the existing route imports (line ~14), add:

```typescript
import { metadata } from "./oauth/metadata";
import { register } from "./oauth/register";
import { authorize } from "./oauth/authorize";
import { token } from "./oauth/token";
```

After the existing `app.route("/", mcp);` (line ~76), add:

```typescript
// OAuth 2.1 endpoints
app.route("/", metadata);
app.route("/", register);
app.route("/", authorize);
app.route("/", token);
```

Also add `CLERK_PUBLISHABLE_KEY` to the required env vars check. Change lines 18-23:

```typescript
const required = ["DATABASE_URL", "CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY"] as const;
```

**Step 2: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat: mount OAuth routes in Hono app, require CLERK_PUBLISHABLE_KEY"
```

---

### Task 11: Update Frontend for Nullable githubUsername

**Files:**
- Modify: `apps/web/src/app/(dashboard)/profile/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/bugs/[id]/bug-detail-client.tsx`
- Modify: `apps/web/src/app/(dashboard)/patches/[id]/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/bugs/[id]/page.tsx`

All references to `user.githubUsername` or `reporter?.githubUsername` need to handle `null`. The pattern is:

```typescript
// Before
user.githubUsername
// After
user.githubUsername ?? "anonymous"

// Before
user.githubUsername.slice(0, 2).toUpperCase()
// After
(user.githubUsername ?? "??").slice(0, 2).toUpperCase()
```

**Step 1: Update profile page**

In `apps/web/src/app/(dashboard)/profile/page.tsx`:
- Line 94: `alt={user.githubUsername}` → `alt={user.githubUsername ?? "user"}`
- Line 97: `{user.githubUsername.slice(0, 2).toUpperCase()}` → `{(user.githubUsername ?? "??").slice(0, 2).toUpperCase()}`
- Line 102: `{user.githubUsername}` → `{user.githubUsername ?? "anonymous"}`

**Step 2: Update bug detail client**

In `apps/web/src/app/(dashboard)/bugs/[id]/bug-detail-client.tsx`:
- Line 148: `{patch.submitter?.githubUsername}` → `{patch.submitter?.githubUsername ?? "anonymous"}`
- Line 204: `{v.verifier?.githubUsername}` → `{v.verifier?.githubUsername ?? "anonymous"}`
- Line 362: `{bug.reporter?.githubUsername}` → `{bug.reporter?.githubUsername ?? "anonymous"}`

(Lines 144, 358 already use `?? "??"` via the `initials()` helper so they're safe.)

**Step 3: Update bug page**

In `apps/web/src/app/(dashboard)/bugs/[id]/page.tsx`:
- Line 63: `name: bug.reporter?.githubUsername,` → `name: bug.reporter?.githubUsername ?? "anonymous",`

**Step 4: Update patches page**

In `apps/web/src/app/(dashboard)/patches/[id]/page.tsx`:
- Line 112: `{patch.submitter?.githubUsername}` → `{patch.submitter?.githubUsername ?? "anonymous"}`
- Line 246: `{v.verifier?.githubUsername}` → `{v.verifier?.githubUsername ?? "anonymous"}`

(Lines 107 already use `?? "??"` via `initials()` so they're safe.)

**Step 5: Commit**

```bash
git add apps/web/src/app/
git commit -m "fix: handle nullable githubUsername across dashboard UI"
```

---

### Task 12: Update Feed Route for Nullable githubUsername

**Files:**
- Modify: `apps/api/src/routes/feed.ts`

**Step 1: Update raw SQL queries**

In `apps/api/src/routes/feed.ts`, the raw SQL queries select `u."githubUsername" AS "actor"`. Since `githubUsername` is now nullable, update to use `COALESCE`:

- Line 146: `u."githubUsername" AS "actor",` → `COALESCE(u."githubUsername", 'anonymous') AS "actor",`
- Line 173: same change
- Line 201: same change

**Step 2: Commit**

```bash
git add apps/api/src/routes/feed.ts
git commit -m "fix: handle nullable githubUsername in feed SQL queries"
```

---

### Task 13: Update Auth Middleware toUser for Nullable Fields

**Files:**
- Modify: `apps/api/src/middleware/auth.ts`

The `toUser` function's `clerkId: row.clerkId!` assertion is now safe since `clerkId` is required. But the GitHub PAT deprecated path creates users with `clerkId: 'gh_${login}'` placeholder — this is intentional until they link via Clerk.

Verify: the `toUser` function in the middleware from Task 8 already handles `githubUsername: string | null` and `clerkId: string`. No extra changes needed if Task 8 was done correctly.

**Step 1: Verify type-check passes**

```bash
pnpm lint
```

Expected: no errors. If there are errors related to `githubUsername` being `string | null` where `string` is expected, fix them.

**Step 2: Commit (if any fixes were needed)**

```bash
git add -A && git commit -m "fix: resolve type errors from nullable githubUsername"
```

---

### Task 14: Add CLERK_PUBLISHABLE_KEY to API env

**Files:**
- Modify: `apps/api/.env.local`
- Modify: `.env.example` (if it exists)

**Step 1: Add the env var**

Add to `apps/api/.env.local`:
```
CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
```

Get the value from Clerk dashboard → API Keys → Publishable key (same one used in `apps/web/.env.local` as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`).

Also add `API_BASE_URL` for production:
```
API_BASE_URL=http://localhost:3001
```

**Step 2: Update `.env.example` if it exists**

Add:
```
CLERK_PUBLISHABLE_KEY=pk_test_...
API_BASE_URL=http://localhost:3001
```

**Step 3: Commit** (only `.env.example`, NOT `.env.local`)

```bash
git add .env.example
git commit -m "docs: add CLERK_PUBLISHABLE_KEY and API_BASE_URL to env example"
```

---

### Task 15: Update CORS for OAuth Consent Page

**Files:**
- Modify: `apps/api/src/index.ts`

**Step 1: Allow Clerk CDN in security headers**

The consent page loads `@clerk/clerk-js` from `cdn.jsdelivr.net`. The existing security headers (`X-Frame-Options: DENY`) are fine. But CORS needs to allow the consent page to make requests to `/oauth/approve`.

The consent page is served FROM the API domain, so it makes same-origin requests to `/oauth/approve`. No CORS changes needed for this.

However, the consent page is an HTML page, so we should skip the JSON content-type enforcement for `/oauth/authorize`. This is already handled since Hono's `c.html()` sets `text/html` automatically.

No changes needed. Move to next task.

---

### Task 16: Build Verification

**Step 1: Regenerate Prisma client**

```bash
pnpm db:generate
```

**Step 2: Type-check everything**

```bash
pnpm lint
```

Expected: clean pass. Fix any type errors.

**Step 3: Start dev server and verify endpoints**

```bash
pnpm dev
```

Then test the discovery endpoints:

```bash
curl http://localhost:3001/.well-known/oauth-protected-resource
curl http://localhost:3001/.well-known/oauth-authorization-server
```

Expected: JSON responses with correct URLs.

Test dynamic client registration:

```bash
curl -X POST http://localhost:3001/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"test","redirect_uris":["http://localhost:9999/callback"]}'
```

Expected: 201 response with `client_id` starting with `dyn_`.

Test MCP endpoint returns OAuth 401:

```bash
curl -v http://localhost:3001/mcp -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1}'
```

Expected: 401 with `WWW-Authenticate: Bearer resource_metadata="..."` header.

**Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: resolve build issues from OAuth integration"
```

---

### Task 17: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the Auth section in CLAUDE.md**

Replace the Auth section with:

```markdown
## Auth

Three-strategy auth middleware (`apps/api/src/middleware/auth.ts`):

1. **knownissue OAuth token** (`ki_` prefix) — validated via SHA-256 hash lookup in `OAuthAccessToken` table. Primary MCP auth path. Tokens issued through OAuth 2.1 flow.
2. **Clerk JWT** — verified via `@clerk/backend` `verifyToken` with cryptographic signature check, looks up by `clerkId`. This is how the web dashboard authenticates.
3. **GitHub PAT** (deprecated) — validates against `api.github.com/user` with caching, looks up by `githubUsername`. Will be removed before launch.

OAuth 2.1 endpoints in `apps/api/src/oauth/`:
- `GET /.well-known/oauth-protected-resource` — RFC 9728 Protected Resource Metadata
- `GET /.well-known/oauth-authorization-server` — RFC 8414 Authorization Server Metadata
- `POST /oauth/register` — RFC 7591 Dynamic Client Registration
- `GET /oauth/authorize` — serves Clerk sign-in + consent page
- `POST /oauth/approve` — verifies Clerk session, generates auth code
- `POST /oauth/token` — exchanges auth code or refresh token for access token

MCP endpoint returns `401 WWW-Authenticate: Bearer resource_metadata="..."` when unauthenticated, triggering MCP clients to start the OAuth flow.

Both strategies auto-create users with `SIGNUP_BONUS` (5) credits. The web frontend uses `@clerk/nextjs` middleware (`apps/web/src/proxy.ts`) to protect non-public routes.
```

**Step 2: Update the Environment variables section**

Add to the API env vars list:
- `CLERK_PUBLISHABLE_KEY` — required for the OAuth consent page
- `API_BASE_URL` — base URL for OAuth metadata (defaults to `http://localhost:3001`)

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with OAuth 2.1 auth architecture"
```
