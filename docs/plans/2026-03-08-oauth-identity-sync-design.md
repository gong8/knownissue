# OAuth 2.1 Identity Sync Design

Full identity sync via OAuth 2.1 with Clerk as the upstream identity provider, following the MCP spec's Third-Party Authorization Flow.

## Problem

Two independent auth paths create split identities:

- **MCP agents**: GitHub PAT → lookup by `githubUsername` → auto-create User (no `clerkId`)
- **Web dashboard**: Clerk JWT → lookup by `clerkId` → auto-create User (fake `githubUsername`)

Same human, two User records, split credits/bugs/patches. No linking mechanism exists.

Secondary issues: GitHub API hit on every MCP request (no caching), copy-pasted middleware, Clerk user creation extracts fields that don't exist in standard JWTs.

## Solution

knownissue's API becomes an **OAuth 2.1 Authorization Server** with Clerk as the upstream **Identity Provider**. Both MCP agents and web dashboard authenticate through Clerk. One `clerkId` = one User.

```
MCP Client (Claude Code, Cursor, etc.)
    │
    ├── POST /mcp → 401 Unauthorized
    │   WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource"
    │
    ├── GET /.well-known/oauth-protected-resource (discovery)
    ├── GET /.well-known/oauth-authorization-server (discovery)
    │
    ├── POST /oauth/register (Dynamic Client Registration)
    │
    ├── GET /oauth/authorize → Clerk sign-in → consent → auth code → redirect to client
    │
    ├── POST /oauth/token (exchange code for access token)
    │
    └── POST /mcp with Authorization: Bearer ki_xxx
```

Web dashboard: unchanged (Clerk JWT via apiFetch).

## OAuth Endpoints

All endpoints in `apps/api/src/oauth/`. No auth required on discovery/registration.

### Discovery

**`GET /.well-known/oauth-protected-resource`** (RFC 9728)

```json
{
  "resource": "https://api.knownissue.dev",
  "authorization_servers": ["https://api.knownissue.dev"],
  "scopes_supported": ["mcp:tools"]
}
```

**`GET /.well-known/oauth-authorization-server`** (RFC 8414)

```json
{
  "issuer": "https://api.knownissue.dev",
  "authorization_endpoint": "https://api.knownissue.dev/oauth/authorize",
  "token_endpoint": "https://api.knownissue.dev/oauth/token",
  "registration_endpoint": "https://api.knownissue.dev/oauth/register",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["mcp:tools"],
  "token_endpoint_auth_methods_supported": ["none"]
}
```

Base URL is derived from `API_BASE_URL` env var. In dev: `http://localhost:3001`.

### Dynamic Client Registration

**`POST /oauth/register`** (RFC 7591)

Request:
```json
{
  "client_name": "Claude Code",
  "redirect_uris": ["http://localhost:12345/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"]
}
```

Response:
```json
{
  "client_id": "dyn_xxxxxxxxxxxxxxxx",
  "client_name": "Claude Code",
  "redirect_uris": ["http://localhost:12345/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"]
}
```

Public clients only (no client_secret). Stored in `OAuthClient` table.

### Authorization

**`GET /oauth/authorize`**

Required params: `client_id`, `redirect_uri`, `response_type=code`, `code_challenge`, `code_challenge_method=S256`, `scope=mcp:tools`.

Optional: `state` (opaque, returned to client).

Flow:
1. Validate params (client_id exists, redirect_uri matches registration, S256 required)
2. Store OAuth params in encrypted cookie
3. Return minimal HTML page that loads `@clerk/clerk-js`
4. Page checks Clerk session — if not signed in, renders Clerk `<SignIn />`
5. Once signed in, shows consent: "Grant [client_name] access to knownissue?"
6. On approve → POST to `/oauth/approve` with Clerk session token + OAuth params

**`POST /oauth/approve`** (internal, called by the consent page)

1. Verify Clerk session token via `@clerk/backend`
2. Find or create User by `clerkId` (extract GitHub username from Clerk external accounts if available)
3. Generate random authorization code, store hash in `OAuthAuthorizationCode`
4. Redirect to `redirect_uri?code=xxx&state=yyy`

Authorization codes expire in 60 seconds and are single-use.

### Token Exchange

**`POST /oauth/token`**

Grant type `authorization_code`:
- Validate `code`, `code_verifier` (PKCE), `redirect_uri`, `client_id`
- Mark code as used
- Generate access token (`ki_` prefix) and refresh token (`kir_` prefix)
- Store hashes (SHA-256) in `OAuthAccessToken` and `OAuthRefreshToken`

Grant type `refresh_token`:
- Validate refresh token, check not expired/revoked
- Revoke old access token + refresh token
- Issue new pair (token rotation)

Response:
```json
{
  "access_token": "ki_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "kir_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

Token lifetimes: access token 1 hour, refresh token 30 days.

## Data Model

Four new tables:

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
  id              String    @id @default(uuid())
  code            String    @unique
  clientId        String
  client          OAuthClient @relation(fields: [clientId], references: [clientId])
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  redirectUri     String
  codeChallenge   String
  scopes          String[]
  expiresAt       DateTime
  usedAt          DateTime?
  createdAt       DateTime  @default(now())
}

model OAuthAccessToken {
  id           String    @id @default(uuid())
  tokenHash    String    @unique
  clientId     String
  client       OAuthClient @relation(fields: [clientId], references: [clientId])
  userId       String
  user         User      @relation(fields: [userId], references: [id])
  scopes       String[]
  expiresAt    DateTime
  revokedAt    DateTime?
  createdAt    DateTime  @default(now())

  refreshToken OAuthRefreshToken?
}

model OAuthRefreshToken {
  id            String    @id @default(uuid())
  tokenHash     String    @unique
  accessTokenId String    @unique
  accessToken   OAuthAccessToken @relation(fields: [accessTokenId], references: [id])
  expiresAt     DateTime
  revokedAt     DateTime?
  createdAt     DateTime  @default(now())
}
```

User model changes:

```prisma
model User {
  githubUsername  String?  @unique  // was: String @unique (now nullable)
  clerkId        String   @unique  // was: String? @unique (now required)

  // new relations
  oauthAuthCodes    OAuthAuthorizationCode[]
  oauthAccessTokens OAuthAccessToken[]
}
```

## Auth Middleware

Single middleware with three strategies in priority order:

```
1. knownissue token (ki_xxx) → SHA-256 hash → lookup OAuthAccessToken → get userId
2. Clerk JWT                 → verifyToken with secretKey → find User by clerkId
3. GitHub PAT (deprecated)   → validate against GitHub API → find User by githubUsername
```

Strategy 1: primary MCP auth path.
Strategy 2: web dashboard path.
Strategy 3: backward compatibility, removed before launch.

Both required and optional variants share one function with a `required: boolean` parameter instead of copy-pasting.

The MCP endpoint (`POST /mcp`) returns the spec-compliant 401 with `WWW-Authenticate` header when no valid auth is present:

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://api.knownissue.dev/.well-known/oauth-protected-resource"
```

## Clerk Integration at /oauth/authorize

The authorize endpoint serves a minimal HTML page from Hono that loads Clerk's JS SDK (`@clerk/clerk-js`). No Next.js dependency.

The page:
1. Initializes Clerk with `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (renamed to `CLERK_PUBLISHABLE_KEY` for the API)
2. Checks `clerk.user` — if null, mounts `clerk.mountSignIn(element)` for sign-in
3. After sign-in, shows consent screen (app name, requested scope, approve/deny)
4. Approve submits a form POST to `/oauth/approve` with the Clerk session token

The `/oauth/approve` handler:
1. Extracts Clerk session token from the request
2. Verifies it via `verifyToken` from `@clerk/backend`
3. Extracts `clerkId` from JWT `sub` claim
4. Finds or creates User:
   - If Clerk user has GitHub OAuth external account → extract `githubUsername`
   - Otherwise `githubUsername` stays null (dashboard prompts to connect GitHub later)
5. Generates authorization code → redirects to client

Environment variables needed for the API:
- `CLERK_PUBLISHABLE_KEY` (for the JS SDK in the HTML page)
- `CLERK_SECRET_KEY` (for backend token verification — already exists)

## Identity Model

With OAuth, `clerkId` is the canonical identity. Every User has one.

`githubUsername` becomes optional — set when:
- User signed up via Clerk GitHub OAuth (extracted from external accounts)
- User connects GitHub in their Clerk profile

The "Require GitHub link" is enforced in the web dashboard UX (banner/modal prompting connection), not as a schema constraint.

## Removals

- **GitHub PAT auth strategy**: deprecated immediately, removed before launch
- **Copy-pasted `optionalAuthMiddleware`**: replaced by `resolveAuth(required)` factory
- **`user-${clerkId.slice(0,8)}` fallback username**: no longer needed
- **GitHub API call on every request**: eliminated entirely
- **`githubUsername` as required field**: made nullable

## Security

- PKCE required (S256 only, no `plain`) for all clients
- Authorization codes: 60-second expiry, single-use, stored as hash
- Access tokens: 1-hour expiry, stored as SHA-256 hash
- Refresh tokens: 30-day expiry, rotation on use, stored as hash
- Redirect URIs: must be localhost URLs or HTTPS
- All OAuth endpoints served over HTTPS in production
- Dynamic client registration: open (no approval needed), but clients are public-only
- Clerk session tokens verified cryptographically via `@clerk/backend`

## File Structure

```
apps/api/src/
  oauth/
    metadata.ts        # /.well-known endpoints
    register.ts        # POST /oauth/register
    authorize.ts       # GET /oauth/authorize, POST /oauth/approve
    token.ts           # POST /oauth/token
    templates/
      authorize.html   # Minimal Clerk sign-in + consent page
    utils.ts           # PKCE verification, token generation, hashing
  middleware/
    auth.ts            # Rewritten: 3-strategy cascade, resolveAuth factory
  mcp/
    transport.ts       # Updated: 401 with WWW-Authenticate header
```

## Migration Path

1. Schema migration: add OAuth tables, make `githubUsername` nullable, make `clerkId` required
2. Data migration: link existing GitHub-PAT-only users to Clerk accounts (manual for small user count)
3. Deploy OAuth endpoints alongside existing auth
4. Update CORS to allow `/oauth/authorize` page resources
5. Update `POST /mcp` to return proper 401 with WWW-Authenticate
6. MCP clients auto-discover OAuth flow on next connection
7. Deprecate GitHub PAT strategy
8. Remove GitHub PAT strategy before production launch
