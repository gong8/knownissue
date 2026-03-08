# Road to Deployment

Production deployment plan for knownissue. Work through each phase in order — later phases depend on earlier ones.

---

## Phase 1: Security Fixes

These are non-negotiable. The app is exploitable without them.

### 1.1 Implement Clerk JWT Signature Verification

**File:** `apps/api/src/middleware/auth.ts`

**Problem:** Clerk JWTs are decoded from base64 but the signature is never verified. Anyone can craft a fake JWT with an arbitrary `sub` claim and impersonate any user.

**Fix:**
- Install `@clerk/backend` or use Clerk's JWKS endpoint to verify JWT signatures
- Replace the manual `Buffer.from(parts[1], "base64url")` decode with proper verification
- Reject tokens with invalid/expired signatures

**Acceptance:** Auth middleware rejects forged JWTs. Only tokens signed by Clerk are accepted.

---

### 1.2 Make CORS Configurable

**File:** `apps/api/src/index.ts`

**Problem:** CORS origin is hardcoded to `http://localhost:3000`. Production frontend will be on a different domain and all requests will be blocked.

**Fix:**
- Add `CORS_ORIGIN` (or `ALLOWED_ORIGINS`) environment variable
- Parse comma-separated origins from env
- Fall back to `http://localhost:3000` for local dev

**Acceptance:** CORS origin is read from environment. Production domain is allowed.

---

### 1.3 Add Rate Limiting

**Files:** `apps/api/src/index.ts`, new middleware

**Problem:** No rate limiting on any endpoint. Vulnerable to brute-force and resource exhaustion.

**Fix:**
- Add a rate limiting middleware (e.g. `hono-rate-limiter` or custom with in-memory store)
- Global limit: ~100 requests per 15 minutes per IP
- Stricter limit on auth and search endpoints
- Return `429 Too Many Requests` when exceeded

**Acceptance:** Rapid repeated requests from the same IP are throttled.

---

### 1.4 Add Security Headers

**File:** `apps/api/src/index.ts` (new middleware)

**Problem:** No security headers set. Vulnerable to clickjacking, MIME sniffing, etc.

**Fix:** Add middleware that sets:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy: default-src 'self'` (adjust as needed)

**Acceptance:** Response headers include all security headers.

---

### 1.5 Fix Production Error Handler

**File:** `apps/api/src/index.ts`

**Problem:** Global error handler returns `err.message` to the client, leaking internal details.

**Fix:**
- In production (`NODE_ENV=production`), return generic `"Internal server error"` message
- Keep detailed messages in development
- Log the full error server-side regardless

**Acceptance:** Production API responses never leak stack traces or internal error details.

---

### 1.6 Update Vulnerable Dependencies

**File:** `apps/api/package.json`

**Problem:** `@hono/node-server` has an authorization bypass CVE (need >= 1.19.10). Other minor CVEs in transitive deps.

**Fix:**
- `pnpm update @hono/node-server`
- `pnpm update hono`
- Run `pnpm audit` and resolve remaining highs

**Acceptance:** `pnpm audit` shows zero high-severity vulnerabilities.

---

## Phase 2: Error Handling & Robustness

### 2.1 Add Global Error Boundary

**File:** `apps/web/src/app/error.tsx` (new)

**Problem:** No error boundary. Unhandled errors show a blank page or raw Next.js error.

**Fix:**
- Create `error.tsx` with a user-friendly error page
- Include a "Try again" button that calls `reset()`
- Style consistently with the rest of the app

**Acceptance:** Runtime errors show a styled error page instead of crashing.

---

### 2.2 Add 404 Page

**File:** `apps/web/src/app/not-found.tsx` (new)

**Problem:** No custom 404 page. Users hitting bad URLs get the default Next.js 404.

**Fix:**
- Create `not-found.tsx` with a styled "Page not found" message
- Include navigation back to dashboard

**Acceptance:** Invalid routes show a branded 404 page.

---

### 2.3 Validate Environment Variables at Startup

**Files:** `apps/api/src/index.ts`, `apps/web/src/lib/env.ts` (new)

**Problem:** Missing env vars cause silent failures or cryptic errors at runtime.

**Fix:**
- On API startup, check that `DATABASE_URL` is set. Warn if `OPENAI_API_KEY` is missing.
- On web build, validate `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `NEXT_PUBLIC_API_URL` are set.
- Fail fast with a clear error message if required vars are missing.

**Acceptance:** App refuses to start with a clear message if required env vars are missing.

---

### 2.4 Validate Pagination Parameters

**File:** `apps/api/src/routes/bugs.ts`

**Problem:** `page` and `limit` query params are parsed with `parseInt()` without validation. Non-numeric values produce `NaN`.

**Fix:**
- Clamp `page` to >= 1, `limit` to 1–50
- Return 400 if values are non-numeric

**Acceptance:** `GET /bugs?page=abc` returns a 400 error, not a broken query.

---

### 2.5 Add Health Check with DB Verification

**File:** `apps/api/src/routes/auth.ts`

**Problem:** Current `/health` endpoint returns `{ status: "ok" }` without checking anything.

**Fix:**
- Run a simple DB query (e.g. `SELECT 1`) in the health check
- Return `{ status: "ok", db: "connected" }` or `{ status: "degraded", db: "disconnected" }`

**Acceptance:** Health check actually verifies the database connection.

---

## Phase 3: Database Production Readiness

### 3.1 Switch to Prisma Migrate

**Directory:** `packages/db`

**Problem:** Using `prisma db push` which has no migration history, no rollbacks, and is not safe for production.

**Fix:**
- Run `prisma migrate dev --name init` to create the initial migration from current schema
- Replace `db:push` script with `db:migrate` using `prisma migrate deploy`
- Commit the `migrations/` directory

**Acceptance:** Schema changes go through versioned migrations. `prisma migrate deploy` runs in production.

---

### 3.2 Add Database Constraints

**File:** `packages/db/prisma/schema.prisma`

**Problem:** Some integrity rules are only enforced in application code, not at the DB level.

**Fix:**
- Add `onDelete` behavior to all relations (e.g. `Cascade` for patches when bug deleted, `Restrict` for users)
- Ensure credits cannot go below 0 (already handled in SQL, but verify)

**Acceptance:** Database rejects invalid data even if application code is bypassed.

---

### 3.3 Add Missing Database Indexes

**File:** `packages/db/prisma/schema.prisma`

**Problem:** Foreign key columns (`reporterId`, `bugId`, `submitterId`, `reviewerId`) are not indexed. Queries will slow down as data grows.

**Fix:**
- Add `@@index` for frequently queried foreign keys
- Consider a vector index on `embedding` for similarity search performance

**Acceptance:** `EXPLAIN ANALYZE` on common queries shows index usage.

---

## Phase 4: Deployment Infrastructure

### 4.1 Hosting Stack (Decided)

| Component | Domain | Platform | Notes |
|-----------|--------|----------|-------|
| Web | `knownissue.dev` | **Vercel** | Next.js auto-detection, free tier |
| API + MCP | `mcp.knownissue.dev` | **AWS ECS Fargate** | Containerized, no server management, $10k credits |
| Database | — | **AWS RDS Postgres** | pgvector extension, managed backups, Multi-AZ |

MCP endpoint: `https://mcp.knownissue.dev/mcp` — clean separation between the dashboard and the API/MCP server.

---

### 4.2 Infrastructure-as-Code: SST v3

**IaC:** SST v3 (TypeScript, Pulumi engine under the hood)

**File:** `sst.config.ts` — manages VPC, RDS, ECS Cluster, Service, ALB, secrets

**What SST provisions:**
- VPC with fck-nat (~$3/mo vs $30+ managed NAT)
- RDS Postgres 16.4 (`t4g.micro`, 20GB, auto-generated credentials)
- ECS Cluster + Fargate Service (0.5 vCPU, 1GB, 2-10 tasks, auto-scaling)
- ALB on HTTP (Cloudflare handles SSL termination), health checks every 15s

**Dockerfile:** Multi-stage build at repo root using `turbo prune --docker`

**Note:** No `domain` in SST config — DNS and SSL are managed by Cloudflare, not Route53/ACM.

---

### 4.3 Set Up Secrets and Environment

**SST secrets** (set once before first deploy):
```bash
npx sst secret set ClerkSecretKey "sk_live_..." --stage production
npx sst secret set OpenaiApiKey "sk-..." --stage production
```

**Status:** Done (currently set with test keys — swap for production keys before launch).

**Injected automatically by SST config:**
- `DATABASE_URL` — constructed from RDS resource properties
- `CLERK_SECRET_KEY` — from SST secret
- `OPENAI_API_KEY` — from SST secret
- `CORS_ORIGIN` — `https://knownissue.dev`
- `NODE_ENV=production`, `API_PORT=3001`

**Vercel env vars** (set in Vercel dashboard):
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — production Clerk publishable key
- `NEXT_PUBLIC_API_URL` — `https://mcp.knownissue.dev`
- `CLERK_SECRET_KEY` — production Clerk secret key

---

### 4.4 Deploy Sequence (First Time)

**Prerequisites completed:**
- [x] AWS OIDC identity provider created (`token.actions.githubusercontent.com`)
- [x] IAM role created: `github-actions-knownissue` (`arn:aws:iam::208569836255:role/github-actions-knownissue`)
- [x] `AWS_ROLE_ARN` added as GitHub Actions secret (both `production` and `staging` environments)
- [x] SST secrets set (test keys — update to production keys before launch)
- [x] GitHub environments created (`production`, `staging`)

**Remaining steps:**
1. Install Docker Desktop and ensure it's running
2. Run `npx sst deploy --stage production` (~5-10 min — provisions VPC, RDS, ECS, ALB, Docker build + ECR push)
3. Copy the ALB URL from SST output (e.g. `Api-XXXX.us-east-1.elb.amazonaws.com`)
4. In Cloudflare DNS for `knownissue.dev`:
   - Add CNAME: `mcp` → ALB URL (proxy enabled, orange cloud)
   - Set SSL/TLS mode to **Flexible** (Cloudflare terminates SSL, ALB receives HTTP)
5. Run Prisma migration against production DB:
   ```bash
   npx sst tunnel --stage production
   # In another terminal:
   DATABASE_URL="postgresql://..." pnpm --filter @knownissue/db db:migrate
   ```
6. Connect repo to Vercel:
   - Import `gong8/knownissue`, root directory: `apps/web`
   - Build command: `cd ../.. && pnpm build --filter=@knownissue/web...`
   - Set env vars: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL=https://mcp.knownissue.dev`, `CLERK_SECRET_KEY`
7. In Cloudflare DNS: point `knownissue.dev` to Vercel (CNAME to `cname.vercel-dns.com`)
8. Swap Clerk test keys for production keys:
   - Create Clerk production instance at dashboard.clerk.com
   - Update SST secret: `npx sst secret set ClerkSecretKey "sk_live_..." --stage production`
   - Update Vercel env vars with `pk_live_...` and `sk_live_...`
   - Redeploy both services

---

### 4.5 CI/CD Pipeline

**`.github/workflows/ci.yml`** — runs on every push/PR to `main` or `dev`:
- Install pnpm, Node 22, generate Prisma client
- Quality check (`pnpm quality` — bans `@ts-ignore`, `as any`, `eslint-disable`, `console.log`, etc.)
- Lint (`tsc --noEmit` across all packages)
- Build (full monorepo)

**`.github/workflows/deploy.yml`** — runs on push to `main` (production) or `dev` (staging):
- CI gate (quality + lint + build must pass)
- AWS OIDC authentication (no long-lived credentials)
- `npx sst deploy --stage production|staging`
- SST handles: Docker build, ECR push, ECS service update, health check wait

**Concurrency:** Parallel deployments are prevented. Running deploys are never cancelled.

**Branching:** `dev` → staging, `main` → production. Branch protection on `main` (require PR, no force push).

---

### 4.6 Quality Gate

**Script:** `scripts/quality.sh`, run via `pnpm quality`

**Hard fails (blocks CI):**
- `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`
- `eslint-disable`
- `as any` / `: any`
- `debugger` statements
- `console.log` in source code (allows `console.error`/`warn`/`info`, excludes seed scripts)

**Warnings (visible but don't fail):**
- `TODO` / `FIXME` / `HACK` markers

---

## Phase 5: SEO & Polish

See also: `plans/seo-optimisation.md`

### 5.1 Add robots.txt and sitemap

**Files:** `apps/web/public/robots.txt`, `apps/web/src/app/sitemap.ts`

---

### 5.2 Add Open Graph Meta Tags

**File:** `apps/web/src/app/layout.tsx` and per-page metadata

Add `openGraph` and `twitter` metadata for link previews.

---

### 5.3 Add Monitoring

- Error tracking: Sentry (free tier)
- Analytics: Vercel Analytics or PostHog

---

## Checklist

- [x] **Phase 1: Security**
  - [x] 1.1 JWT signature verification — `verifyToken` from `@clerk/backend`
  - [x] 1.2 Configurable CORS — reads `CORS_ORIGIN` env var
  - [x] 1.3 Rate limiting — `hono-rate-limiter` (100 req / 15 min per IP)
  - [x] 1.4 Security headers — X-Frame-Options, X-Content-Type-Options, HSTS
  - [x] 1.5 Production error handler — hides internals when `NODE_ENV=production`
  - [x] 1.6 Update vulnerable deps — updated hono + @hono/node-server
- [x] **Phase 2: Error Handling**
  - [x] 2.1 Error boundary — `apps/web/src/app/error.tsx`
  - [x] 2.2 404 page — `apps/web/src/app/not-found.tsx`
  - [x] 2.3 Env validation — API fails fast if `DATABASE_URL` or `CLERK_SECRET_KEY` missing
  - [x] 2.4 Pagination validation — clamps page/limit, rejects NaN
  - [x] 2.5 Health check with DB — `GET /health` runs `SELECT 1` against Postgres
- [x] **Phase 3: Database**
  - [x] 3.1 Prisma migrate — initial migration `20260308045821_init` created and applied
  - [x] 3.2 DB constraints — `onDelete: Cascade` on all relations
  - [x] 3.3 Missing indexes — added `@@index` on reporterId, bugId, submitterId
- [ ] **Phase 4: Deployment**
  - [x] 4.1 Hosting stack — Vercel + ECS Fargate + RDS Postgres
  - [x] 4.2 IaC — `sst.config.ts` (SST v3), `Dockerfile`, `.dockerignore`
  - [x] 4.3 Secrets — SST secrets set (test keys), GitHub env secrets configured
  - [ ] 4.4 First deploy — need Docker running, then `npx sst deploy`, Cloudflare DNS, Vercel setup
  - [x] 4.5 CI/CD — `.github/workflows/ci.yml` + `deploy.yml` (OIDC, quality gate, concurrency)
  - [x] 4.6 Quality gate — `pnpm quality` bans unsafe patterns, runs in CI
- [ ] **Phase 5: SEO & Polish**
  - [ ] 5.1 robots.txt + sitemap
  - [ ] 5.2 OG meta tags
  - [ ] 5.3 Monitoring
