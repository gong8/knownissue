# Seed Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a repeatable pipeline that scrapes real issues from GitHub/SO/Reddit, triages and formats them via Claude CLI (Haiku), and bulk-inserts them into the knownissue database with embeddings.

**Architecture:** Queue-based pipeline with three stages (scrape, triage, format+insert). SQLite queue for state management. Claude CLI spawned as isolated child processes for LLM work. Lives in `packages/seed/`, gitignored from the open-source repo.

**Tech Stack:** TypeScript, better-sqlite3, node:child_process (Claude CLI), OpenAI embeddings API, Prisma, Hono (dashboard)

**Design doc:** `docs/plans/2026-03-09-seed-pipeline-design.md`

---

## Phase 1: Scaffolding

### Task 1: Create package structure

**Files:**
- Create: `packages/seed/package.json`
- Create: `packages/seed/tsconfig.json`
- Create: `packages/seed/src/index.ts` (empty entry)
- Modify: `.gitignore` (add `packages/seed/`)

**Step 1: Create `packages/seed/package.json`**

```json
{
  "name": "@knownissue/seed",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "seed": "tsx src/cli.ts",
    "dashboard": "tsx src/dashboard/server.ts",
    "build": "tsc",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@knownissue/db": "workspace:*",
    "@knownissue/shared": "workspace:*",
    "better-sqlite3": "^11.0.0",
    "hono": "^4.7.0"
  },
  "devDependencies": {
    "@knownissue/tsconfig": "workspace:*",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^25.3.5",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3"
  }
}
```

**Step 2: Create `packages/seed/tsconfig.json`**

Reference the shared base config. Exclude the SQLite db file and dashboard HTML.

```json
{
  "extends": "@knownissue/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "*.db"]
}
```

Check `packages/tsconfig/base.json` for the exact base config shape and adjust if needed.

**Step 3: Create `packages/seed/src/index.ts`**

```typescript
// @knownissue/seed - pipeline entry point
// This package is gitignored and not part of the open-source product.
```

**Step 4: Add `packages/seed/` to root `.gitignore`**

Append to the end of `.gitignore`:

```
# Seed pipeline (private, not open-sourced)
packages/seed/
```

**Step 5: Install dependencies**

```bash
cd /Users/gong/Programming/Projects/knownissue && pnpm install
```

Verify the workspace link works:

```bash
pnpm --filter @knownissue/seed exec -- node -e "console.log('ok')"
```

**Step 6: Commit**

```bash
git add packages/seed/package.json packages/seed/tsconfig.json packages/seed/src/index.ts .gitignore
git commit -m "feat(seed): scaffold seed pipeline package"
```

---

## Phase 2: SQLite Queue

### Task 2: Implement the queue module

**Files:**
- Create: `packages/seed/src/queue.ts`

The queue is the central state store. All operations are synchronous (better-sqlite3 is sync). One table, atomic claim via `UPDATE ... RETURNING`.

**Step 1: Create `packages/seed/src/queue.ts`**

```typescript
import Database from "better-sqlite3";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "seed-queue.db");

export type ItemStatus =
  | "scraped"
  | "triaging"
  | "triaged"
  | "rejected"
  | "formatting"
  | "done"
  | "failed";

export interface QueueItem {
  id: number;
  source: string;
  source_url: string;
  library: string | null;
  raw_content: string;
  status: ItemStatus;
  has_fix: number | null; // SQLite boolean
  triage_reason: string | null;
  formatted: string | null;
  issue_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string | null;
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL"); // better concurrent read performance
    db.exec(`
      CREATE TABLE IF NOT EXISTS items (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        source       TEXT NOT NULL,
        source_url   TEXT NOT NULL UNIQUE,
        library      TEXT,
        raw_content  TEXT NOT NULL,
        status       TEXT DEFAULT 'scraped',
        has_fix      INTEGER,
        triage_reason TEXT,
        formatted    TEXT,
        issue_id     TEXT,
        error        TEXT,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
    `);
  }
  return db;
}

/** Insert a scraped item. Returns false if source_url already exists. */
export function enqueue(item: {
  source: string;
  source_url: string;
  library?: string;
  raw_content: string;
}): boolean {
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO items (source, source_url, library, raw_content) VALUES (?, ?, ?, ?)`
    ).run(item.source, item.source_url, item.library ?? null, item.raw_content);
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint")) {
      return false; // already exists
    }
    throw err;
  }
}

/** Atomically claim the next item at a given status. Returns null if queue is empty. */
export function claimNext(fromStatus: ItemStatus, toStatus: ItemStatus): QueueItem | null {
  const db = getDb();
  const item = db
    .prepare(
      `UPDATE items SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = (SELECT id FROM items WHERE status = ? ORDER BY id ASC LIMIT 1)
       RETURNING *`
    )
    .get(toStatus, fromStatus) as QueueItem | undefined;
  return item ?? null;
}

/** Mark an item as done with results. */
export function markDone(id: number, data: { formatted?: string; issue_id?: string }): void {
  const db = getDb();
  db.prepare(
    `UPDATE items SET status = 'done', formatted = ?, issue_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(data.formatted ?? null, data.issue_id ?? null, id);
}

/** Mark an item as triaged (accepted). */
export function markTriaged(id: number, hasFix: boolean, reason: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE items SET status = 'triaged', has_fix = ?, triage_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(hasFix ? 1 : 0, reason, id);
}

/** Mark an item as rejected. */
export function markRejected(id: number, reason: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE items SET status = 'rejected', triage_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(reason, id);
}

/** Mark an item as failed with error. */
export function markFailed(id: number, error: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE items SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(error, id);
}

/** Reset items from one status back to another (for retries). */
export function resetItems(fromStatus: ItemStatus, toStatus: ItemStatus): number {
  const db = getDb();
  const result = db
    .prepare(`UPDATE items SET status = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE status = ?`)
    .run(toStatus, fromStatus);
  return result.changes;
}

/** Get counts by status. */
export function getStatusCounts(): Record<string, number> {
  const db = getDb();
  const rows = db.prepare(`SELECT status, COUNT(*) as count FROM items GROUP BY status`).all() as {
    status: string;
    count: number;
  }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.count]));
}

/** Get counts by source and library. */
export function getBreakdown(): { source: string; library: string | null; count: number }[] {
  const db = getDb();
  return db
    .prepare(`SELECT source, library, COUNT(*) as count FROM items GROUP BY source, library ORDER BY count DESC`)
    .all() as { source: string; library: string | null; count: number }[];
}

/** Get recent items (for preview/dashboard). */
export function getRecent(options: {
  stage?: ItemStatus;
  limit?: number;
}): QueueItem[] {
  const db = getDb();
  const limit = options.limit ?? 20;
  if (options.stage) {
    return db
      .prepare(`SELECT * FROM items WHERE status = ? ORDER BY updated_at DESC LIMIT ?`)
      .all(options.stage, limit) as QueueItem[];
  }
  return db
    .prepare(`SELECT * FROM items ORDER BY updated_at DESC LIMIT ?`)
    .all(limit) as QueueItem[];
}

/** Get failed items with errors. */
export function getFailures(limit = 20): QueueItem[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM items WHERE status = 'failed' ORDER BY updated_at DESC LIMIT ?`)
    .all(limit) as QueueItem[];
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

**Step 2: Verify it compiles**

```bash
cd /Users/gong/Programming/Projects/knownissue && pnpm --filter @knownissue/seed exec -- npx tsx -e "import { getDb, getStatusCounts } from './src/queue.js'; getDb(); console.log(getStatusCounts());"
```

Expected: `{}` (empty counts)

**Step 3: Commit**

```bash
git add packages/seed/src/queue.ts
git commit -m "feat(seed): implement SQLite queue module"
```

---

## Phase 3: Claude CLI Wrapper

### Task 3: Implement isolated Claude CLI wrapper

**Files:**
- Create: `packages/seed/src/claude.ts`

This module spawns Claude CLI as a fully isolated text-in/text-out function. Uses `node:child_process.spawn` (not exec) for safety. Pattern taken from willow/cramkit/nasty-plot.

**Step 1: Create `packages/seed/src/claude.ts`**

```typescript
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const BASE_TEMP_DIR = join(tmpdir(), "knownissue-seed");

/** All built-in Claude Code tools - blocked to isolate the CLI. */
const BLOCKED_BUILTIN_TOOLS = [
  "Bash", "Read", "Write", "Edit", "Glob", "Grep",
  "WebFetch", "WebSearch", "Task", "TaskOutput", "NotebookEdit",
  "EnterPlanMode", "ExitPlanMode", "TodoWrite", "AskUserQuestion",
  "Skill", "TeamCreate", "TeamDelete", "SendMessage", "TaskStop",
  "TaskCreate", "TaskGet", "TaskUpdate", "TaskList", "LSP", "ToolSearch",
];

/** Minimal env - no API keys, no project vars. */
function cleanEnv(): Record<string, string | undefined> {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    SHELL: process.env.SHELL,
    TERM: process.env.TERM,
  };
}

/** Create a temp directory for this invocation. */
function createTempDir(): string {
  const dir = join(BASE_TEMP_DIR, randomUUID().slice(0, 8));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Clean up a temp directory. */
function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

export interface ClaudeResult {
  output: string;
  exitCode: number | null;
}

/**
 * Spawn an isolated Claude CLI process. Returns raw text output.
 * No tools, no MCP, no settings, no file access. Pure LLM.
 */
export async function runClaude(prompt: string, options?: {
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<ClaudeResult> {
  const model = options?.model ?? "haiku";
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const dir = createTempDir();

  // Write empty MCP config
  const mcpConfigPath = join(dir, "mcp.json");
  writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers: {} }));

  const args = [
    "--print",
    "--output-format", "text",
    "--dangerously-skip-permissions",
    "--disallowedTools", ...BLOCKED_BUILTIN_TOOLS,
    "--mcp-config", mcpConfigPath,
    "--strict-mcp-config",
    "--setting-sources", "",
    "--no-session-persistence",
    "--max-turns", "1",
    "--model", model,
    prompt,
  ];

  return new Promise<ClaudeResult>((resolve) => {
    const proc = spawn("claude", args, {
      cwd: dir,
      env: cleanEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", () => { /* discard stderr */ });

    // Timeout
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
    }, timeoutMs);

    // Abort signal
    if (options?.signal) {
      options.signal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
      }, { once: true });
    }

    proc.on("close", (code) => {
      clearTimeout(timer);
      cleanupDir(dir);
      const output = Buffer.concat(chunks).toString("utf-8").trim();
      resolve({ output, exitCode: code });
    });

    proc.on("error", () => {
      clearTimeout(timer);
      cleanupDir(dir);
      resolve({ output: "", exitCode: 1 });
    });
  });
}

/**
 * Run Claude and parse the output as JSON.
 * Throws if output is not valid JSON.
 */
export async function runClaudeJson<T = unknown>(prompt: string, options?: {
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<T> {
  const result = await runClaude(prompt, options);
  if (result.exitCode !== 0) {
    throw new Error(`Claude CLI exited with code ${result.exitCode}`);
  }
  // Claude sometimes wraps JSON in markdown code fences - strip them
  let text = result.output;
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Claude output is not valid JSON:\n${result.output.slice(0, 500)}`);
  }
}
```

**Step 2: Quick smoke test**

```bash
cd /Users/gong/Programming/Projects/knownissue && pnpm --filter @knownissue/seed exec -- npx tsx -e "
import { runClaude } from './src/claude.js';
const r = await runClaude('Respond with exactly: hello');
console.log('exit:', r.exitCode);
console.log('output:', r.output);
"
```

Expected: exit 0, output contains "hello"

**Step 3: Commit**

```bash
git add packages/seed/src/claude.ts
git commit -m "feat(seed): implement isolated Claude CLI wrapper"
```

---

## Phase 4: GitHub Issues Scraper

### Task 4: Implement the GitHub Issues scraper

**Files:**
- Create: `packages/seed/src/scrapers/github-issues.ts`

Uses the GitHub REST API. Fetches closed issues with comments (more likely to have solutions). Inserts raw blobs into the queue.

**Step 1: Create `packages/seed/src/scrapers/github-issues.ts`**

```typescript
import { enqueue } from "../queue.js";

const GITHUB_API = "https://api.github.com";

interface GitHubIssue {
  html_url: string;
  title: string;
  body: string | null;
  labels: { name: string }[];
  state: string;
  comments: number;
}

interface GitHubComment {
  body: string;
  user: { login: string };
  created_at: string;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "knownissue-seed",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText} - ${url}`);
  }
  return res.json() as Promise<T>;
}

/** Fetch issues from a repo. Defaults to closed issues sorted by comments. */
async function fetchIssues(
  repo: string,
  options: { state?: string; perPage?: number; page?: number; labels?: string }
): Promise<GitHubIssue[]> {
  const state = options.state ?? "closed";
  const perPage = options.perPage ?? 30;
  const page = options.page ?? 1;
  let url = `${GITHUB_API}/repos/${repo}/issues?state=${state}&sort=comments&direction=desc&per_page=${perPage}&page=${page}`;
  if (options.labels) {
    url += `&labels=${encodeURIComponent(options.labels)}`;
  }
  return fetchJson<GitHubIssue[]>(url);
}

/** Fetch comments for an issue. */
async function fetchComments(repo: string, issueNumber: number): Promise<GitHubComment[]> {
  return fetchJson<GitHubComment[]>(
    `${GITHUB_API}/repos/${repo}/issues/${issueNumber}/comments?per_page=30`
  );
}

/** Extract issue number from GitHub URL. */
function issueNumberFromUrl(url: string): number {
  const match = url.match(/\/issues\/(\d+)$/);
  if (!match) throw new Error(`Cannot parse issue number from ${url}`);
  return parseInt(match[1], 10);
}

/** Filter out PRs (GitHub issues API includes them) and feature requests. */
function isLikelyBug(issue: GitHubIssue): boolean {
  // GitHub API returns PRs mixed with issues - filter by absence of pull_request key
  if ("pull_request" in issue) return false;

  const labels = issue.labels.map((l) => l.name.toLowerCase());

  // Reject feature requests, enhancements, questions
  const rejectLabels = ["feature", "enhancement", "feature-request", "question", "wontfix", "duplicate", "stale"];
  if (labels.some((l) => rejectLabels.some((r) => l.includes(r)))) return false;

  // Must have a body
  if (!issue.body || issue.body.length < 50) return false;

  return true;
}

export interface ScrapeGitHubOptions {
  repo: string;
  limit: number;
  library?: string;
  state?: string;
  labels?: string;
  minComments?: number;
}

/**
 * Scrape GitHub issues from a repo and enqueue them.
 * Returns { enqueued, skipped, errors }.
 */
export async function scrapeGitHubIssues(options: ScrapeGitHubOptions): Promise<{
  enqueued: number;
  skipped: number;
  errors: number;
}> {
  const { repo, limit, state, labels } = options;
  const library = options.library ?? repo.split("/")[1];
  const minComments = options.minComments ?? 1;
  const perPage = 30;

  let enqueued = 0;
  let skipped = 0;
  let errors = 0;
  let page = 1;

  while (enqueued < limit) {
    const issues = await fetchIssues(repo, { state, perPage, page, labels });
    if (issues.length === 0) break;

    for (const issue of issues) {
      if (enqueued >= limit) break;

      // Filter: must look like a bug and have comments
      if (!isLikelyBug(issue) || issue.comments < minComments) {
        skipped++;
        continue;
      }

      try {
        // Fetch comments
        const comments = await fetchComments(repo, issueNumberFromUrl(issue.html_url));

        // Build raw blob
        const rawContent = [
          `# ${issue.title}`,
          "",
          issue.body ?? "",
          "",
          "---",
          "",
          ...comments.map((c) => `**${c.user.login}:**\n${c.body}\n\n---\n`),
        ].join("\n");

        const added = enqueue({
          source: "github_issue",
          source_url: issue.html_url,
          library,
          raw_content: rawContent,
        });

        if (added) {
          enqueued++;
          process.stdout.write(`\r  Enqueued: ${enqueued}/${limit}`);
        } else {
          skipped++; // already in queue
        }
      } catch {
        errors++;
      }
    }

    page++;
  }

  console.log(); // newline after progress
  return { enqueued, skipped, errors };
}
```

**Step 2: Smoke test with a real repo (small limit)**

```bash
cd /Users/gong/Programming/Projects/knownissue && GITHUB_TOKEN=$GITHUB_TOKEN pnpm --filter @knownissue/seed exec -- npx tsx -e "
import { scrapeGitHubIssues } from './src/scrapers/github-issues.js';
import { getStatusCounts } from './src/queue.js';
const result = await scrapeGitHubIssues({ repo: 'prisma/prisma', limit: 3 });
console.log('Result:', result);
console.log('Queue:', getStatusCounts());
"
```

Expected: 3 items enqueued, queue shows `{ scraped: 3 }`.

**Step 3: Commit**

```bash
git add packages/seed/src/scrapers/github-issues.ts
git commit -m "feat(seed): implement GitHub Issues scraper"
```

---

## Phase 5: Triage + Format Prompts

### Task 5: Create the prompt templates

**Files:**
- Create: `packages/seed/src/prompts/triage.ts`
- Create: `packages/seed/src/prompts/format.ts`

**Step 1: Create `packages/seed/src/prompts/triage.ts`**

```typescript
export function buildTriagePrompt(source: string, rawContent: string): string {
  return `You are a triage agent for knownissue, a shared debugging memory for AI coding agents.

You will receive a raw blob scraped from ${source}. Decide if this is a real, actionable coding issue that an AI coding agent would benefit from finding.

ACCEPT if:
- It describes a real error, bug, or unexpected behavior with a library or tool
- It has enough detail to be useful (error message, reproduction context, version info)
- It's about a library/tool that developers actively use
- Even if partially described, there's a clear technical issue

REJECT if:
- It's a feature request, not a bug
- It's too vague to be actionable (just "X doesn't work" with no detail)
- It's about an extremely niche or deprecated tool no one uses
- It's a how-to question, not an error
- It's spam, off-topic, or not about software
- The content is too short or garbled to extract anything useful

Also determine: does the blob contain a fix, solution, or workaround?

Respond with ONLY this JSON, no other text:
{"accept": true/false, "reason": "one sentence explanation", "hasFix": true/false}

---

RAW CONTENT:
${rawContent}`;
}
```

**Step 2: Create `packages/seed/src/prompts/format.ts`**

```typescript
export function buildFormatPrompt(source: string, rawContent: string, hasFix: boolean): string {
  const patchSection = hasFix
    ? `
The source contains a fix/solution/workaround. Also extract the patch.
Include the "patch" field in your output with:
- "explanation": what the fix does and why (min 10 chars)
- "steps": array of step objects. Each step is ONE of these types:
  - {"type": "code_change", "filePath": "path/to/file", "before": "old code", "after": "new code"}
  - {"type": "version_bump", "package": "package-name", "to": "new-version"}
  - {"type": "config_change", "file": "config-file", "key": "setting.key", "action": "set", "value": "new-value"}
  - {"type": "command", "command": "the command to run"}
  - {"type": "instruction", "text": "human-readable instruction"}

Use the most specific step type. If the fix is just "upgrade to version X", use version_bump.
If it's a code change, use code_change with before/after. If it's a workaround described
in words, use instruction.`
    : `The source does NOT contain a clear fix. Do NOT include a "patch" field.`;

  return `You are a formatting agent for knownissue, a shared debugging memory for AI coding agents.

You will receive a raw blob scraped from ${source}. Extract a structured issue report from it.

CRITICAL RULES:
- Extract ONLY what is explicitly present in the source material
- DO NOT invent, hallucinate, or infer details that are not stated
- If a field's value is not clearly present in the source, OMIT the field entirely
- Error messages and code snippets must be copied exactly as they appear

${patchSection}

Output ONLY valid JSON matching this schema (omit any fields not present in source):

{
  "report": {
    "errorMessage": "exact error text from the source",
    "description": "clear description of the issue, including reproduction steps if present",
    "library": "package name exactly as published on npm/pip/etc",
    "version": "affected version if mentioned",
    "ecosystem": "npm or pip or cargo or gem or go",
    "errorCode": "error code if present (e.g., ERR_MODULE_NOT_FOUND, P2024)",
    "stackTrace": "stack trace if present (first 20 lines max)",
    "triggerCode": "minimal code snippet that triggers the issue",
    "expectedBehavior": "what should happen",
    "actualBehavior": "what actually happens",
    "context": [{"name": "related-package", "version": "x.y.z", "role": "bundler/framework/runtime/etc"}],
    "runtime": "e.g., node 20.11.0, python 3.12, bun 1.0",
    "platform": "e.g., linux-x64, macos-arm64, windows-x64",
    "category": "crash|build|types|performance|behavior|config|compatibility|install|hallucination|deprecated",
    "severity": "low|medium|high|critical",
    "title": "short summary of the issue (under 100 chars)",
    "tags": ["relevant", "tags"]
  }${hasFix ? `,
  "patch": {
    "explanation": "what the fix does and why it works",
    "steps": [...]
  }` : ""}
}

---

RAW CONTENT:
${rawContent}`;
}
```

**Step 3: Commit**

```bash
git add packages/seed/src/prompts/
git commit -m "feat(seed): add triage and format prompt templates"
```

---

## Phase 6: Worker Pool

### Task 6: Implement the worker pool

**Files:**
- Create: `packages/seed/src/worker.ts`

Generic worker pool that claims items from the queue and processes them with a handler function. Used by both triage and format stages.

**Step 1: Create `packages/seed/src/worker.ts`**

```typescript
import { claimNext, type ItemStatus, type QueueItem } from "./queue.js";

export interface WorkerPoolOptions {
  /** Number of concurrent workers */
  concurrency: number;
  /** Which status to claim from */
  fromStatus: ItemStatus;
  /** Which status to set while processing */
  toStatus: ItemStatus;
  /** Handler function - processes one item */
  handler: (item: QueueItem) => Promise<void>;
  /** Called when a worker starts processing */
  onStart?: (workerId: number, item: QueueItem) => void;
  /** Called when a worker finishes an item */
  onDone?: (workerId: number, item: QueueItem) => void;
  /** Called when a worker hits an error */
  onError?: (workerId: number, item: QueueItem, error: Error) => void;
  /** Abort signal to stop the pool */
  signal?: AbortSignal;
}

/**
 * Run a worker pool that drains the queue.
 * Returns when queue is empty or signal is aborted.
 */
export async function runWorkerPool(options: WorkerPoolOptions): Promise<{
  processed: number;
  errors: number;
}> {
  let processed = 0;
  let errors = 0;

  async function worker(id: number): Promise<void> {
    while (!options.signal?.aborted) {
      const item = claimNext(options.fromStatus, options.toStatus);
      if (!item) break; // queue drained

      options.onStart?.(id, item);

      try {
        await options.handler(item);
        processed++;
        options.onDone?.(id, item);
      } catch (err) {
        errors++;
        options.onError?.(id, item, err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  const workers = Array.from({ length: options.concurrency }, (_, i) => worker(i));
  await Promise.all(workers);

  return { processed, errors };
}
```

**Step 2: Commit**

```bash
git add packages/seed/src/worker.ts
git commit -m "feat(seed): implement generic worker pool"
```

---

## Phase 7: Triage Stage

### Task 7: Implement the triage handler

**Files:**
- Create: `packages/seed/src/stages/triage.ts`

**Step 1: Create `packages/seed/src/stages/triage.ts`**

```typescript
import { runClaudeJson } from "../claude.js";
import { buildTriagePrompt } from "../prompts/triage.js";
import { markTriaged, markRejected, markFailed, type QueueItem } from "../queue.js";
import { runWorkerPool } from "../worker.js";

interface TriageResult {
  accept: boolean;
  reason: string;
  hasFix: boolean;
}

async function triageItem(item: QueueItem): Promise<void> {
  const prompt = buildTriagePrompt(item.source, item.raw_content);

  let result: TriageResult;
  try {
    result = await runClaudeJson<TriageResult>(prompt);
  } catch (err) {
    markFailed(item.id, `Triage LLM error: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }

  if (result.accept) {
    markTriaged(item.id, result.hasFix, result.reason);
  } else {
    markRejected(item.id, result.reason);
  }
}

export async function runTriage(concurrency: number, signal?: AbortSignal): Promise<{
  processed: number;
  errors: number;
}> {
  return runWorkerPool({
    concurrency,
    fromStatus: "scraped",
    toStatus: "triaging",
    handler: triageItem,
    signal,
    onStart: (wid, item) => {
      console.log(`  [worker ${wid}] triaging: ${item.source_url.slice(-60)}`);
    },
    onDone: (wid, item) => {
      console.log(`  [worker ${wid}] done: ${item.source_url.slice(-60)}`);
    },
    onError: (wid, item, err) => {
      console.error(`  [worker ${wid}] FAILED: ${item.source_url.slice(-60)} - ${err.message}`);
    },
  });
}
```

**Step 2: Commit**

```bash
git add packages/seed/src/stages/triage.ts
git commit -m "feat(seed): implement triage stage"
```

---

## Phase 8: DB Insertion

### Task 8: Implement the database insertion module

**Files:**
- Create: `packages/seed/src/insert.ts`

This module handles inserting formatted issues into Postgres with embeddings. It uses the Prisma client from `@knownissue/db` and raw SQL for the pgvector embedding column. Includes a local copy of embedding generation (no per-user rate limiting) and fingerprint computation.

**Step 1: Create `packages/seed/src/insert.ts`**

Note: Check `apps/api/src/services/embedding.ts` and `apps/api/src/services/spam.ts` for the exact implementation to replicate. Key details:

- Embedding: POST to `https://api.openai.com/v1/embeddings` with model `text-embedding-3-small`, dimensions `1536`
- Fingerprint: `sha256("${library}::${errorCode}")` or `sha256("${library}::${normalizeErrorMessage(msg)}")`
- normalizeErrorMessage: strip file paths, line:col, UUIDs, hex strings, long numbers, collapse whitespace, lowercase
- DB table name in raw SQL is `"Bug"` (not `"Issue"`)
- Check the User model schema for what fields exist before creating the seed bot user
- Check if `Severity` and `IssueCategory` are Prisma enums and use enum values directly

The module should export:
- `FormattedOutput` type (report + optional patch)
- `insertIssue(formatted: FormattedOutput): Promise<string>` - returns created issue ID

Core logic:
1. Get or create seed bot user (cached after first call)
2. Generate embedding text from errorMessage + description + title
3. Call OpenAI embeddings API directly (no rate limiting needed for seed)
4. Compute fingerprint via sha256
5. Create Issue via Prisma (all structured fields)
6. Store embedding via `$queryRawUnsafe('UPDATE "Bug" SET embedding = $1::vector WHERE id = $2', vectorStr, issue.id)`
7. Create Patch if present (same submitter as reporter)

**Step 2: Commit**

```bash
git add packages/seed/src/insert.ts
git commit -m "feat(seed): implement DB insertion with embeddings"
```

---

## Phase 9: Format Stage

### Task 9: Implement the format handler

**Files:**
- Create: `packages/seed/src/stages/format.ts`

**Step 1: Create `packages/seed/src/stages/format.ts`**

```typescript
import { runClaudeJson } from "../claude.js";
import { buildFormatPrompt } from "../prompts/format.js";
import { markDone, markFailed, type QueueItem } from "../queue.js";
import { insertIssue, type FormattedOutput } from "../insert.js";
import { runWorkerPool } from "../worker.js";

async function formatItem(item: QueueItem): Promise<void> {
  const hasFix = item.has_fix === 1;
  const prompt = buildFormatPrompt(item.source, item.raw_content, hasFix);

  let formatted: FormattedOutput;
  try {
    formatted = await runClaudeJson<FormattedOutput>(prompt);
  } catch (err) {
    markFailed(item.id, `Format LLM error: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }

  // Basic validation - must have errorMessage or description
  if (!formatted.report?.errorMessage && !formatted.report?.description) {
    markFailed(item.id, "Formatted output missing both errorMessage and description");
    throw new Error("Missing required fields");
  }

  // Insert into DB
  let issueId: string;
  try {
    issueId = await insertIssue(formatted);
  } catch (err) {
    markFailed(item.id, `DB insert error: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }

  markDone(item.id, {
    formatted: JSON.stringify(formatted),
    issue_id: issueId,
  });
}

export async function runFormat(concurrency: number, signal?: AbortSignal): Promise<{
  processed: number;
  errors: number;
}> {
  return runWorkerPool({
    concurrency,
    fromStatus: "triaged",
    toStatus: "formatting",
    handler: formatItem,
    signal,
    onStart: (wid, item) => {
      console.log(`  [worker ${wid}] formatting: ${item.source_url.slice(-60)}`);
    },
    onDone: (wid, item) => {
      console.log(`  [worker ${wid}] inserted: ${item.source_url.slice(-60)}`);
    },
    onError: (wid, item, err) => {
      console.error(`  [worker ${wid}] FAILED: ${item.source_url.slice(-60)} - ${err.message}`);
    },
  });
}
```

**Step 2: Commit**

```bash
git add packages/seed/src/stages/format.ts
git commit -m "feat(seed): implement format stage"
```

---

## Phase 10: CLI

### Task 10: Implement the CLI entry point

**Files:**
- Create: `packages/seed/src/cli.ts`

Simple CLI - parse args manually (no dependency needed). Each command maps to a function.

**Step 1: Create `packages/seed/src/cli.ts`**

```typescript
import { getStatusCounts, getBreakdown, getRecent, getFailures, resetItems, closeDb } from "./queue.js";
import { scrapeGitHubIssues } from "./scrapers/github-issues.js";
import { runTriage } from "./stages/triage.js";
import { runFormat } from "./stages/format.js";

function parseArgs(args: string[]): { command: string; flags: Record<string, string> } {
  const command = args[0] ?? "help";
  const flags: Record<string, string> = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
      flags[key] = value;
    }
  }
  return { command, flags };
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "scrape": {
      const source = flags.source ?? "github";
      if (source === "github") {
        const repo = flags.repo;
        if (!repo) {
          console.error("Usage: pnpm seed scrape --source github --repo owner/name --limit 100");
          process.exit(1);
        }
        console.log(`Scraping GitHub issues from ${repo}...`);
        const result = await scrapeGitHubIssues({
          repo,
          limit: parseInt(flags.limit ?? "50", 10),
          library: flags.library,
          labels: flags.labels,
          minComments: parseInt(flags["min-comments"] ?? "1", 10),
        });
        console.log(`Done: ${result.enqueued} enqueued, ${result.skipped} skipped, ${result.errors} errors`);
      } else {
        console.error(`Unknown source: ${source}. Supported: github`);
        process.exit(1);
      }
      break;
    }

    case "triage": {
      const workers = parseInt(flags.workers ?? "3", 10);
      console.log(`Running triage with ${workers} workers...`);
      const result = await runTriage(workers);
      console.log(`Done: ${result.processed} processed, ${result.errors} errors`);
      break;
    }

    case "format": {
      const workers = parseInt(flags.workers ?? "3", 10);
      console.log(`Running format with ${workers} workers...`);
      const result = await runFormat(workers);
      console.log(`Done: ${result.processed} processed, ${result.errors} errors`);
      break;
    }

    case "status": {
      const counts = getStatusCounts();
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      console.log(`\nPipeline Status (${total} total):`);
      console.log("-".repeat(40));
      const stages = ["scraped", "triaging", "triaged", "rejected", "formatting", "done", "failed"];
      for (const status of stages) {
        const count = counts[status] ?? 0;
        if (count === 0) continue;
        const bar = "#".repeat(Math.ceil((count / Math.max(total, 1)) * 30));
        console.log(`  ${status.padEnd(12)} ${String(count).padStart(5)}  ${bar}`);
      }
      console.log();

      const breakdown = getBreakdown();
      if (breakdown.length > 0) {
        console.log("By source + library:");
        console.log("-".repeat(40));
        for (const row of breakdown.slice(0, 20)) {
          console.log(`  ${(row.source).padEnd(18)} ${(row.library ?? "unknown").padEnd(20)} ${row.count}`);
        }
      }
      break;
    }

    case "preview": {
      const stage = flags.stage as any;
      const limit = parseInt(flags.limit ?? "5", 10);
      const items = getRecent({ stage, limit });
      for (const item of items) {
        console.log(`\n${"-".repeat(60)}`);
        console.log(`ID: ${item.id} | Status: ${item.status} | Source: ${item.source}`);
        console.log(`URL: ${item.source_url}`);
        if (item.triage_reason) console.log(`Triage: ${item.triage_reason}`);
        if (item.error) console.log(`Error: ${item.error}`);
        console.log(`Content: ${item.raw_content.slice(0, 200)}...`);
      }
      break;
    }

    case "retry": {
      const stage = flags.stage;
      if (stage === "triage") {
        const count = resetItems("rejected", "scraped");
        console.log(`Reset ${count} rejected items back to scraped`);
      } else if (stage === "format") {
        const count = resetItems("failed", "triaged");
        console.log(`Reset ${count} failed items back to triaged`);
      } else {
        console.error("Usage: pnpm seed retry --stage triage|format");
        process.exit(1);
      }
      break;
    }

    case "failures": {
      const limit = parseInt(flags.limit ?? "20", 10);
      const items = getFailures(limit);
      console.log(`\n${items.length} failures:`);
      for (const item of items) {
        console.log(`\n  [${item.id}] ${item.source_url}`);
        console.log(`    Error: ${item.error}`);
      }
      break;
    }

    case "help":
    default:
      console.log(`
knownissue seed pipeline

Commands:
  scrape    Scrape issues from a source into the queue
              --source github  --repo owner/name  --limit 100
              --library name  --labels bug  --min-comments 1

  triage    Run triage workers (Claude Haiku)
              --workers 3

  format    Run format workers (Claude Haiku) + insert into DB
              --workers 3

  status    Show pipeline status counts

  preview   Preview items at a given stage
              --stage scraped|triaged|rejected|done|failed  --limit 5

  retry     Reset failed/rejected items for reprocessing
              --stage triage|format

  failures  Show recent failures with error details
              --limit 20

  help      Show this help message
`);
  }

  closeDb();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

**Step 2: Test the CLI**

```bash
cd /Users/gong/Programming/Projects/knownissue && pnpm --filter @knownissue/seed seed help
```

**Step 3: Commit**

```bash
git add packages/seed/src/cli.ts
git commit -m "feat(seed): implement CLI entry point"
```

---

## Phase 11: Stack Overflow Scraper

### Task 11: Implement the Stack Overflow scraper

**Files:**
- Create: `packages/seed/src/scrapers/stackoverflow.ts`
- Modify: `packages/seed/src/cli.ts` (add SO to scrape command)

Uses the Stack Exchange API v2.3. Fetches questions with accepted answers, tagged by library.

**Step 1: Create `packages/seed/src/scrapers/stackoverflow.ts`**

The Stack Exchange API returns compressed responses and uses `items` wrapper. Key endpoint: `/2.3/questions?tagged=X&sort=votes&filter=withbody&site=stackoverflow`. Answers via `/2.3/questions/{ids}/answers?filter=withbody`.

Note: The API returns HTML-encoded bodies. Strip HTML tags for clean raw content. The `filter=withbody` parameter includes the body field.

Follow the same pattern as the GitHub scraper:
- Fetch questions with accepted answers for a given tag
- Fetch the accepted answer for each question
- Concatenate question body + answer body into raw blob
- Enqueue with `source: "stackoverflow"`

**Step 2: Wire into CLI**

Add `stackoverflow` case in the scrape command:
```
--source stackoverflow --tag next.js --limit 200
```

**Step 3: Smoke test with a small limit**

**Step 4: Commit**

```bash
git add packages/seed/src/scrapers/stackoverflow.ts packages/seed/src/cli.ts
git commit -m "feat(seed): implement Stack Overflow scraper"
```

---

## Phase 12: Reddit Scraper

### Task 12: Implement the Reddit scraper

**Files:**
- Create: `packages/seed/src/scrapers/reddit.ts`
- Modify: `packages/seed/src/cli.ts` (add reddit to scrape command)

Reddit's JSON API is available by appending `.json` to any URL (e.g., `https://www.reddit.com/r/nextjs/top.json?t=year&limit=100`). No OAuth needed for read-only public data.

**Step 1: Create `packages/seed/src/scrapers/reddit.ts`**

Follow the pattern:
- Fetch top/hot posts from a subreddit with `.json` suffix
- Filter to `is_self: true` text posts (skip link-only posts)
- For each post, fetch the comments thread via `{permalink}.json`
- Concatenate post title + body + top comments into raw blob
- Enqueue with `source: "reddit"`

Note: Reddit requires a User-Agent header. Use `"knownissue-seed/1.0"`.

**Step 2: Wire into CLI**

Add `reddit` case:
```
--source reddit --subreddit reactjs --limit 50 --sort top --time year
```

**Step 3: Smoke test**

**Step 4: Commit**

```bash
git add packages/seed/src/scrapers/reddit.ts packages/seed/src/cli.ts
git commit -m "feat(seed): implement Reddit scraper"
```

---

## Phase 13: Dashboard

### Task 13: Build the local dashboard

**Files:**
- Create: `packages/seed/src/dashboard/server.ts`
- Create: `packages/seed/src/dashboard/index.html`

Tiny Hono server on port 3002. Serves a single HTML page with inline CSS/JS. No build step, no React, no Tailwind.

**Step 1: Create `packages/seed/src/dashboard/server.ts`**

Hono app with routes:
- `GET /` - serves `index.html`
- `GET /api/status` - returns `getStatusCounts()`
- `GET /api/breakdown` - returns `getBreakdown()`
- `GET /api/recent?stage=X&limit=N` - returns `getRecent()`
- `GET /api/failures?limit=N` - returns `getFailures()`

Use `@hono/node-server` for the `serve()` function. Read `index.html` from disk relative to the module.

**Step 2: Create `packages/seed/src/dashboard/index.html`**

Single-page dashboard. Dark theme (dark background, light text). Auto-refreshes data every 5 seconds via `setInterval` + `fetch`. Shows:
- Status counts as colored bars (green for done, yellow for triaged, red for failed, grey for scraped)
- Breakdown table (source x library x count)
- Recent items list with expandable raw content
- Failures list with error messages

Keep it simple. Vanilla HTML, inline `<style>`, inline `<script>`. No frameworks. No build step.

**Step 3: Test**

```bash
pnpm --filter @knownissue/seed dashboard
```

Open `http://localhost:3002`, verify it loads.

**Step 4: Commit**

```bash
git add packages/seed/src/dashboard/
git commit -m "feat(seed): add local dashboard"
```

---

## Phase 14: End-to-End Smoke Test

### Task 14: Run the full pipeline end-to-end

This is a manual validation task. Run each stage with small limits to verify everything works.

**Step 1: Scrape 5 issues**

```bash
GITHUB_TOKEN=$GITHUB_TOKEN pnpm --filter @knownissue/seed seed scrape --source github --repo prisma/prisma --limit 5
pnpm --filter @knownissue/seed seed status
```

Expected: 5 items with status `scraped`.

**Step 2: Triage them**

```bash
pnpm --filter @knownissue/seed seed triage --workers 2
pnpm --filter @knownissue/seed seed status
```

Expected: items move to `triaged` or `rejected`. Inspect with `seed preview --stage triaged`.

**Step 3: Format and insert**

Requires `OPENAI_API_KEY` and `DATABASE_URL` in the environment (or in `packages/seed/.env.local`).

```bash
pnpm --filter @knownissue/seed seed format --workers 2
pnpm --filter @knownissue/seed seed status
```

Expected: items move to `done`.

**Step 4: Verify in database**

Check the database directly to verify issues were created with embeddings:

```sql
SELECT id, title, library, status FROM "Bug"
WHERE "reporterId" = (SELECT id FROM "User" WHERE "githubUsername" = 'knownissue-seed-bot')
ORDER BY "createdAt" DESC LIMIT 5;

SELECT id, title FROM "Bug" WHERE embedding IS NOT NULL ORDER BY "createdAt" DESC LIMIT 5;
```

**Step 5: Test MCP search**

Start the API server and search for one of the seeded issues to verify they're discoverable via the actual MCP search tool.

**Step 6: If everything works, scale up**

```bash
GITHUB_TOKEN=$GITHUB_TOKEN pnpm --filter @knownissue/seed seed scrape --source github --repo prisma/prisma --limit 100
GITHUB_TOKEN=$GITHUB_TOKEN pnpm --filter @knownissue/seed seed scrape --source github --repo vercel/next.js --limit 100 --labels bug
GITHUB_TOKEN=$GITHUB_TOKEN pnpm --filter @knownissue/seed seed scrape --source github --repo vitejs/vite --limit 100

pnpm --filter @knownissue/seed seed triage --workers 5
pnpm --filter @knownissue/seed seed format --workers 5
pnpm --filter @knownissue/seed seed status
```

---

## Summary

| Phase | Task | What | MVP? |
|-------|------|------|------|
| 1 | Task 1 | Package scaffolding + gitignore | Yes |
| 2 | Task 2 | SQLite queue module | Yes |
| 3 | Task 3 | Claude CLI isolated wrapper | Yes |
| 4 | Task 4 | GitHub Issues scraper | Yes |
| 5 | Task 5 | Triage + format prompts | Yes |
| 6 | Task 6 | Generic worker pool | Yes |
| 7 | Task 7 | Triage stage handler | Yes |
| 8 | Task 8 | DB insertion + embeddings | Yes |
| 9 | Task 9 | Format stage handler | Yes |
| 10 | Task 10 | CLI entry point | Yes |
| 11 | Task 11 | Stack Overflow scraper | No |
| 12 | Task 12 | Reddit scraper | No |
| 13 | Task 13 | Local dashboard | No |
| 14 | Task 14 | End-to-end smoke test | Yes |

| 15 | Task 15 | Continuous scraping coordinator | No |

**MVP (Tasks 1-10, 14):** GitHub scraping + triage + format + insert + CLI. Enough to start seeding.

**Extensions (Tasks 11-13, 15):** Additional scrapers + dashboard + continuous coordinator. Build after MVP works.

---

## Phase 9: Continuous Scraping Coordinator

### Task 15: Implement continuous scraping coordinator with rate limit tracking

**Goal:** A long-running coordinator that continuously scrapes → triages → formats across multiple repos, automatically respecting rate limits for each external service (GitHub API, Claude CLI / Claude Max, OpenAI embeddings) and pausing/resuming as needed. Controllable from the frontend dashboard.

**Files:**
- Create: `packages/seed/src/coordinator.ts`
- Create: `packages/seed/src/rate-limiter.ts`
- Create: `packages/seed/src/coordinator-config.ts`
- Modify: `packages/seed/src/cli.ts` (add `run` command)
- Modify: `packages/seed/src/queue.ts` (add repo tracking table)

**Architecture:**

The coordinator runs as a single long-lived process with an event loop:

```
while (running):
  1. Check rate limit budgets for each service
  2. If GitHub budget available → scrape next repo from rotation
  3. If Claude budget available → run triage/format workers
  4. If all budgets exhausted → sleep until earliest reset time
  5. Emit status events (for dashboard SSE)
```

**Rate limiters tracked:**

| Service | Limit | Window | Detection |
|---------|-------|--------|-----------|
| GitHub API | 5,000 req/hr (authenticated) | Rolling 1hr | `X-RateLimit-Remaining` + `X-RateLimit-Reset` headers |
| Claude Max | ~50 concurrent | Per-minute | Track active spawns + timeout count (back off on consecutive timeouts) |
| OpenAI Embeddings | 100/user/hr (knownissue limit) | Rolling 1hr | Count calls, respect 429 responses |

**Rate limiter module (`rate-limiter.ts`):**

```typescript
interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
}

class RateLimiter {
  private timestamps: number[] = [];
  private pausedUntil: number | null = null;

  constructor(private config: RateLimiterConfig) {}

  canProceed(): boolean;           // Check if under limit
  record(): void;                  // Record a request
  pause(untilMs: number): void;    // Hard pause (e.g., from 429 response)
  remaining(): number;             // Requests remaining in current window
  resetIn(): number;               // Ms until next slot opens
  status(): { remaining: number; resetIn: number; paused: boolean };
}
```

**Coordinator config (`coordinator-config.ts`):**

```typescript
interface RepoConfig {
  repo: string;           // e.g., "vercel/next.js"
  labels?: string;        // GitHub label filter
  limit: number;          // Issues per scrape cycle
  minComments?: number;
  library?: string;
}

interface CoordinatorConfig {
  repos: RepoConfig[];
  triage: { workers: number };
  format: { workers: number };
  cyclePauseMs: number;   // Pause between full cycles (default: 5min)
}
```

**Coordinator (`coordinator.ts`):**

```typescript
export class SeedCoordinator {
  private running = false;
  private rateLimiters: {
    github: RateLimiter;
    claude: RateLimiter;
    openai: RateLimiter;
  };

  constructor(private config: CoordinatorConfig) {}

  async start(): Promise<void>;    // Main loop
  stop(): void;                    // Graceful shutdown
  status(): CoordinatorStatus;     // Current state for dashboard

  // Main loop phases
  private async scrapePhase(): Promise<void>;
  private async triagePhase(): Promise<void>;
  private async formatPhase(): Promise<void>;
}
```

**Key behaviors:**

1. **GitHub rate limit tracking:** Parse `X-RateLimit-Remaining` and `X-RateLimit-Reset` from GitHub API responses. When remaining < 10, pause until reset time. On 403, read reset header and pause.

2. **Claude CLI backoff:** Track consecutive timeouts. If 3+ timeouts in a row, pause Claude spawning for 2 minutes (exponential backoff). Reset counter on success.

3. **OpenAI backoff:** On 429 response, read `Retry-After` header and pause. Otherwise sliding window counter.

4. **Repo rotation:** Cycle through repos round-robin. Track `lastScrapedPage` per repo in SQLite so scraping resumes where it left off across restarts.

5. **Graceful shutdown:** On SIGINT/SIGTERM, finish current items (don't strand in triaging/formatting), then exit.

6. **Dashboard SSE endpoint:** The coordinator exposes a status object that the dashboard can poll or receive via SSE:

```typescript
interface CoordinatorStatus {
  running: boolean;
  currentPhase: "scraping" | "triaging" | "formatting" | "paused" | "idle";
  rateLimits: {
    github: { remaining: number; resetIn: number; paused: boolean };
    claude: { remaining: number; resetIn: number; paused: boolean };
    openai: { remaining: number; resetIn: number; paused: boolean };
  };
  queue: Record<string, number>;  // status counts
  repos: { repo: string; lastPage: number; totalScraped: number }[];
  uptime: number;
}
```

**CLI integration:**

```bash
# Start coordinator (long-running)
pnpm seed run

# Start with specific repos
pnpm seed run --config seed-config.json

# Default config auto-generated if missing
```

**Dashboard integration (Task 13):**

The dashboard (Hono on port 3002) adds:
- `GET /api/coordinator/status` — current coordinator status
- `POST /api/coordinator/start` — start coordinator
- `POST /api/coordinator/stop` — graceful stop
- `POST /api/coordinator/repos` — add/remove repos from rotation
- SSE endpoint for live status updates

**Step 1:** Implement `rate-limiter.ts` with sliding window + pause support
**Step 2:** Implement `coordinator-config.ts` with default repo list
**Step 3:** Update GitHub scraper to return rate limit headers from responses
**Step 4:** Implement `coordinator.ts` main loop
**Step 5:** Add `run` command to CLI
**Step 6:** Wire up dashboard endpoints (depends on Task 13)
**Step 7:** Test with 3-repo rotation, verify rate limit pausing works
