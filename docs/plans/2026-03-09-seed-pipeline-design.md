# Seed Pipeline Design

## Problem

knownissue has a cold-start problem. Agents need to find value on their first search or they'll never come back. The database needs to be pre-populated with real, high-quality issues and fixes scraped from public sources.

## Design Principles

- **Real data only.** Every issue must trace back to a real GitHub issue, Stack Overflow question, or Reddit post. No LLM-generated hallucinated bugs. Claude's role is formatting/extraction, not invention.
- **Repeatable pipeline.** Not a one-shot seed script — infrastructure you keep running to grow the database whenever you have spare Claude tokens.
- **Fully isolated workers.** Claude CLI processes are sandboxed — no tools, no MCP, no file access, no settings. Pure text-in, text-out.
- **Private to operator.** Lives in the monorepo as `packages/seed/` but gitignored. Not part of the open-source product.

## Architecture

```
pnpm seed scrape ...          pnpm seed triage ...         pnpm seed format ...

┌──────────┐                 ┌──────────────┐              ┌──────────────────┐
│ Scrapers │                 │ Triage Pool  │              │ Format Pool      │
│          │──▶ Queue ──▶    │ (N Haiku)    │──▶ Queue ──▶ │ (N Haiku)        │──▶ DB
│ - GitHub │   [scraped]     │              │  [triaged]   │                  │
│ - SO     │                 │ accept/reject│              │ extract fields   │
│ - Reddit │                 │ + hasFix     │              │ zod validate     │
└──────────┘                 └──────────────┘              │ insert + embed   │
                                                           └──────────────────┘
```

### Stage 1: Scrapers (deterministic, no LLM)

Fetch raw data from public sources, insert into SQLite queue. Idempotent — `source_url UNIQUE` prevents duplicates on re-run.

**Sources (priority order):**

| Source | API | Rate Limit |
|--------|-----|------------|
| GitHub Issues | REST API v3 | 5k req/hr with PAT |
| Stack Overflow | Public API | 10k req/day with key |
| Reddit | OAuth API | 100 req/min |
| GitHub Discussions | GraphQL API | Same as Issues |

**Target libraries (priority order):**
1. AI agent stack — Next.js, Prisma, Vite, TypeScript, Tailwind, shadcn, Vercel
2. AI/ML — OpenAI SDK, Anthropic SDK, LangChain, transformers
3. Broader ecosystem — React, Node.js, ESLint, Webpack, Docker, PostgreSQL

**Scraper output:** Raw blob. The scraper is a fetcher, not a parser. It grabs title + body + all comments and shoves it into the queue. Claude does the smart work.

### Stage 2: Triage Workers (Claude CLI, Haiku)

Parallel worker pool. Each worker claims a `scraped` item, sends the raw blob to Haiku, gets back an accept/reject decision + whether a fix is present.

**Triage prompt criteria:**
- ACCEPT: real error/bug/unexpected behavior, enough detail to be useful, actively used library
- REJECT: feature requests, too vague, extremely niche/deprecated, how-to questions

**Output:** `{ accept: boolean, reason: string, hasFix: boolean }`

### Stage 3: Format Workers (Claude CLI, Haiku)

Parallel worker pool. Each worker claims a `triaged` item, sends the raw blob to Haiku with a structured extraction prompt. Claude extracts fields into the `reportInputSchema` format. If `hasFix` is true, also extracts a patch.

**Key constraint:** Claude extracts only what is explicitly present in the source. No invention. If a field isn't in the source, omit it.

**Output:** Structured JSON matching `reportInputSchema` (+ `patchInputSchema` if hasFix).

### Stage 4: DB Insertion

After Zod validation, insert into Postgres:
- Create `Issue` via Prisma (all structured fields)
- Generate embedding via OpenAI `text-embedding-3-small` (1536 dims)
- Store embedding via raw SQL (`UPDATE "Bug" SET embedding = $1::vector WHERE id = $2`)
- Compute and store fingerprint (for future dedup against real agent reports)
- If patch present, create `Patch` record
- All attributed to a dedicated `knownissue-seed-bot` user
- No credit accounting for seed data

## Queue

Single SQLite database (`packages/seed/seed-queue.db`, gitignored).

```sql
CREATE TABLE items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source       TEXT NOT NULL,
  source_url   TEXT NOT NULL UNIQUE,
  library      TEXT,
  raw_content  TEXT NOT NULL,
  status       TEXT DEFAULT 'scraped',
  has_fix      BOOLEAN,
  triage_reason TEXT,
  formatted    TEXT,
  issue_id     TEXT,
  error        TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME
);
```

**Status flow:** `scraped → triaging → triaged/rejected → formatting → done/failed`

Workers claim items atomically via `UPDATE ... WHERE status = X LIMIT 1 RETURNING *`.

## Claude CLI Isolation

Workers spawn Claude CLI with full isolation — 5 layers:

| Layer | Flag/Mechanism | Prevents |
|-------|---------------|----------|
| Clean env | `env: { PATH, HOME, SHELL, TERM }` only | API keys, project env vars leaking |
| Block all tools | `--disallowedTools Bash Read Write Edit Glob Grep ...` (all 26 built-in tools) | File access, bash execution, web access |
| Empty MCP config | `--mcp-config {} --strict-mcp-config` | Access to any MCP servers |
| No settings | `--setting-sources ""` | Loading CLAUDE.md or project settings |
| Temp cwd | `cwd: tempDir` (not knownissue workspace) | Workspace file discovery |

Additional flags: `--print --output-format text --dangerously-skip-permissions --no-session-persistence --max-turns 1 --model haiku`

## CLI Commands

| Command | Description |
|---------|-------------|
| `pnpm seed scrape --source github --repo prisma/prisma --limit 100` | Scrape GitHub issues into queue |
| `pnpm seed scrape --source stackoverflow --tag next.js --limit 200` | Scrape SO questions into queue |
| `pnpm seed scrape --source reddit --subreddit reactjs --limit 50` | Scrape Reddit posts into queue |
| `pnpm seed triage --workers 3` | Run triage worker pool |
| `pnpm seed format --workers 5` | Run format worker pool |
| `pnpm seed status` | Show counts per stage |
| `pnpm seed preview --stage triaged --limit 5` | Inspect items at any stage |
| `pnpm seed retry --stage triage` | Reset rejected → scraped |
| `pnpm seed retry --stage format` | Reset failed → triaged |
| `pnpm seed dashboard` | Local web dashboard on :3002 |

## Dashboard

Tiny local Hono server on port 3002. Single HTML page. No auth.

- Pipeline overview — counts per status
- Breakdown by source + library
- Recent activity — last 20 processed items
- Failure log — failed items with errors

## Project Structure

```
packages/seed/                    # gitignored — not part of open-source product
  src/
    cli.ts                        # CLI entry point
    queue.ts                      # SQLite queue operations
    worker.ts                     # Worker pool (spawn N, drain queue)
    claude.ts                     # Claude CLI spawn + parse (isolated)
    insert.ts                     # DB insertion + embedding generation
    scrapers/
      github-issues.ts
      stackoverflow.ts
      reddit.ts
    prompts/
      triage.ts
      format.ts
    dashboard/
      server.ts
      index.html
  seed-queue.db                   # gitignored — local state
  package.json
```

**Dependencies:**
- `@knownissue/db` — Prisma client, embedding utils, fingerprint logic (only what's needed)
- `@knownissue/shared` — Zod validators for output validation
- `better-sqlite3` — SQLite queue
- `hono` — dashboard server

## Costs

- **Claude CLI (Haiku):** Free — uses Max subscription tokens
- **OpenAI embeddings:** ~$0.05 per 5,000 issues (text-embedding-3-small)
- **GitHub/SO/Reddit APIs:** Free with auth tokens

## Open Questions

- Exact heuristics for GitHub scraper (which issues to fetch — closed+labeled? most commented?)
- Reddit OAuth setup (need to register an app)
- Whether to batch OpenAI embedding calls or do them per-item
- Dashboard: terminal UI vs web page (design says web, but could start with just `seed status` CLI output)
