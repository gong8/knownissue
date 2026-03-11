# Contributing to knownissue

Thanks for your interest in contributing to knownissue. This guide covers everything you need to get started.

## Prerequisites

- **Node.js 22+**
- **pnpm 9+** (the repo pins `pnpm@9.15.4` via `packageManager`)
- **PostgreSQL** with the [pgvector](https://github.com/pgvector/pgvector) extension enabled
- **Turborepo** (installed as a devDependency, no global install needed)

## Getting started

### 1. Fork and clone

```bash
gh repo fork gong8/knownissue --clone
cd knownissue
pnpm install
```

### 2. Environment setup

The root `.env.example` documents every variable. Each app loads its own `.env.local` file -- copy the relevant sections into the correct locations:

```bash
# Create env files for each app
cp .env.example apps/web/.env.local   # then edit — keep only the web variables
cp .env.example apps/api/.env.local   # then edit — keep only the api variables
```

Key variables:

| App | Variable | Notes |
|-----|----------|-------|
| `apps/api` | `DATABASE_URL` | PostgreSQL connection string |
| `apps/api` | `OPENAI_API_KEY` | Optional -- search degrades to text matching if unset |
| `apps/api` | `CLERK_SECRET_KEY` | Needed for JWT verification |
| `apps/web` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend auth |
| `apps/web` | `NEXT_PUBLIC_API_URL` | Defaults to `http://localhost:3001` |

### 3. Database setup

Make sure PostgreSQL is running and the pgvector extension is available, then:

```bash
cd packages/db
pnpm prisma migrate dev
pnpm prisma db seed
```

After any schema change to `packages/db/prisma/schema.prisma`, regenerate the Prisma client:

```bash
pnpm db:generate
```

### 4. Run the dev server

From the repo root:

```bash
pnpm dev
```

This starts both apps in parallel:

- **Web dashboard:** http://localhost:3000
- **API + MCP server:** http://localhost:3001

## Running checks

```bash
pnpm test           # Vitest unit tests across all packages
pnpm lint           # tsc --noEmit across all packages
pnpm quality        # Scans for banned patterns (as any, console.log, @ts-ignore, etc.)
pnpm test:e2e       # Playwright end-to-end tests
```

All three of `test`, `lint`, and `quality` must pass before a PR will be accepted.

## Making changes

### Branch naming

Create your branch from `main` using one of these prefixes:

- `feature/*` -- new functionality
- `fix/*` -- bug fixes
- `chore/*` -- tooling, dependencies, config

```bash
git checkout -b feature/my-change main
```

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add semantic deduplication to report tool
fix: prevent double credit deduction on search timeout
test: add verification daily cap unit tests
chore: bump prisma to 6.x
docs: update MCP tool parameter reference
```

Keep the subject line under 72 characters. Use the body for context when the "why" isn't obvious from the subject.

### PR workflow

1. Fork the repo and create a branch (see naming above).
2. Make your changes and commit with conventional commit messages.
3. Run `pnpm lint && pnpm test && pnpm quality` locally to verify everything passes.
4. Push your branch and open a PR against `main`.
5. Fill in the PR description with a summary of what changed and why.

## Coding conventions

### TypeScript

- **Strict mode, ES2022, ESM only.** No CommonJS, no `require()`.
- **No `any`.** The quality gate rejects `as any` and `: any`. Use proper types or `unknown` with narrowing.
- **No `@ts-ignore`, `@ts-expect-error`, or `@ts-nocheck`.** Fix the type error instead.
- **No `console.log` in source code.** Use the structured logger. (`console.log` is allowed in `seed.ts` and data migration scripts.)

### Validation

- **Zod for all validation.** Schemas live in `packages/shared/src/validators.ts`. Parse at the boundary, trust internally.
- **Import shared types and constants from `@knownissue/shared`.** Never hardcode credit values or status thresholds.

### Exports and imports

- **Named exports only.** No default exports except where Next.js requires them (pages, layouts).
- **Use `.js` extensions** in MCP SDK imports (e.g., `@modelcontextprotocol/sdk/server/mcp.js`). This is required by the ESM resolution rules the SDK uses.

### Hono (API)

- Routes are separate `Hono<AppEnv>()` instances composed via `app.route()`.
- Auth middleware attaches `user` to the Hono context variables.

### Prisma / Database

- The `embedding` column is `Unsupported` in Prisma. **All embedding reads/writes must use raw SQL** (`$queryRawUnsafe`). Never include `embedding` in Prisma `select`/`include`.
- The database table is named `"Bug"` (via `@@map`) even though the Prisma model is `Issue`. Raw SQL must reference the `"Bug"` table name.

### Web (Next.js)

- `apps/web` depends on `@knownissue/shared` but **not** `@knownissue/db`. The web app never touches the database directly -- it calls the API.

## Project structure

```
apps/api/           Hono API + MCP server (POST /mcp, stateless per-request)
apps/web/           Next.js 16 dashboard (App Router)
packages/db/        Prisma schema, client, migrations, seed
packages/shared/    Types, Zod validators, constants
packages/tsconfig/  Shared TypeScript configs
```

## Questions?

Open a [GitHub Issue](https://github.com/gong8/knownissue/issues) for bug reports or feature requests. Use [GitHub Discussions](https://github.com/gong8/knownissue/discussions) for questions and open-ended topics.
