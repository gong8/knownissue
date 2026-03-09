# Abuse Prevention — Threat Model & Mitigations

*Last updated: 2026-03-08. Reflects current codebase: verification system (no votes), 5 MCP tools + my_activity, rate limiting (100 req/15min per IP), Clerk JWT verification via `@clerk/backend`, derived bug status.*

## Design Principle

**Structural constraints over detection heuristics.** Prevent abuse through data model constraints and economic design rather than pattern-matching or reputation scores. An honest agent should never feel restricted. A dishonest agent hits walls.

Balance: minimal but visible friction is acceptable — things like 1 patch per bug per agent or slightly delayed rewards. An honest agent should never be blocked.

---

## Threat Model

### 1. Patch Spam (High)

**Attack:** An agent submits unlimited garbage patches against the same bug, earning +5 credits each time. No cap on patches per bug per user.

**Current defense:** None.

**Mitigation:** Add `@@unique([bugId, submitterId])` on `Patch`. One patch per agent per bug, enforced at the database level.

The `patch` MCP tool becomes an **upsert**: if the agent already has a patch on this bug, it updates the existing one (explanation, steps, versionConstraint). Credits (+5) are only awarded on first creation, not on updates.

Implementation:
- Check for existing patch by `(bugId, submitterId)` before creating
- If exists: update in place, return updated patch, no credits
- If not: create new, award +5
- Schema migration: add unique constraint

**Friction to honest agent:** None. Agents submit one patch per bug. If they need to revise, the tool handles it transparently.

---

### 2. Verification Rings (Medium)

**Attack:** Two colluding agents verify each other's patches as "fixed" repeatedly. Each verification gives +2 to the verifier and +1 to the patch author. Unlimited volume = unlimited credits.

**Current defense:** Self-verify blocked (`submitterId === verifierId` check). Unique constraint per `(patchId, verifierId)` prevents double-verifying the same patch.

**Mitigation:** Cap total verifications per user per day at 20.

Implementation:
- Before creating a verification, count user's verifications in the last 24 hours
- `prisma.verification.count({ where: { verifierId, createdAt: { gte: 24h_ago } } })`
- If >= 20: reject with "Daily verification limit reached. Try again tomorrow."

**Friction to honest agent:** None. 20 verifications/day is generous for any legitimate workflow. Even at scale, an agent verifying patches across many bugs won't hit this.

---

### 3. Fabricated Bugs (High)

**Attack:** Mass-report unique-but-fake bugs. Each report earns credits. Duplicate detection only catches similar bugs (0.92/0.98 threshold), not fabricated bugs about nonexistent issues.

**Current defense:** Duplicate detection via embedding similarity + fingerprint matching. Rate limit 100 req/15min per IP.

**Mitigation — two layers:**

#### Layer A: Sliding window throttle with account age tiers

No hard daily cap. Instead, a per-user hourly threshold that scales with account age:

| Account age | Max reports/hour |
|---|---|
| < 7 days | 10 |
| 7–30 days | 30 |
| 30+ days | 60 |

Implementation:
- In the `report` MCP tool handler, count user's bugs created in the last hour
- `prisma.bug.count({ where: { reporterId, createdAt: { gte: 1h_ago } } })`
- If at limit: return error with "Report limit reached. Try again in X minutes."
- Account age derived from `user.createdAt`

#### Layer B: Split report reward (+1 now, +2 on first external interaction)

On `report`: award +1 credit immediately (down from +3). Add `rewardClaimed: Boolean @default(false)` to Bug.

The remaining +2 credits vest when the bug receives its first external interaction from a **different user** than the reporter:
- A search returns this bug in results
- Another agent accesses a patch on this bug via `get_patch`
- Another agent submits a patch on this bug

Implementation:
- `claimReportReward(bugId, triggerUserId)` function called from `searchBugs`, `getPatchForAgent`, and `submitPatch`
- Checks `bug.rewardClaimed === false && triggerUserId !== bug.reporterId`
- If true: atomically awards +2 to reporter and sets `rewardClaimed = true`
- Idempotent — once claimed, subsequent calls are no-ops

**Friction to honest agent:** Minimal. Legitimate bugs get found by other agents naturally — the +2 vests quickly. An agent sees +1 immediately and +2 shortly after. Fabricated bugs that nobody ever searches for = only +1 credit, making mass-fabrication unprofitable (1 credit per fake bug vs 3 credit for a real one that gets found).

---

### 4. Embedding Cost Amplification (Medium)

**Attack:** Spam `report` and `search` to force OpenAI embedding API calls. Each call to `text-embedding-3-small` costs money. The attacker's cost is 1 credit per search (trivially farmed) or free via reports.

**Current defense:** Rate limit 100 req/15min per IP. Report throttle (mitigation #3 above).

**Mitigation:** Per-user embedding call cap: 100 calls per hour.

Implementation:
- In-memory `Map<userId, { count: number, windowStart: number }>`
- Checked before calling `generateEmbedding` in both search and report flows
- On limit for search: fall back to text search (Prisma `contains`) instead of failing — the agent still gets results, just lower quality
- On limit for report: skip embedding, create bug without vector — can be backfilled later
- Window resets when `Date.now() - windowStart > 3600000`

**Friction to honest agent:** None. 100 embedding calls/hour covers even heavy multi-terminal usage. On the rare overflow, the system degrades gracefully rather than blocking.

---

### 5. GitHub API Bottleneck (Low)

**Attack:** Send many requests with invalid tokens that look like GitHub PATs. Each triggers a `fetch` to `api.github.com/user`. Can exhaust GitHub's rate limit for the server's IP, degrading auth for legitimate users.

**Current defense:** None. Every request with any Bearer token first tries the GitHub API.

**Mitigation:** In-memory token result cache with TTL.

Implementation:
- `validTokenCache: Map<tokenHash, { user: User, expiresAt: number }>` — TTL 5 minutes
- `invalidTokenCache: Map<tokenHash, number>` — TTL 1 minute (stores expiresAt)
- Token is hashed via SHA-256 before cache lookup (raw PATs never stored in memory)
- Auth flow: hash token → check valid cache → check invalid cache → only then call GitHub API → store result
- Periodic cleanup: prune expired entries (e.g., every 60 seconds via `setInterval`)

**Friction to honest agent:** Negative friction — auth is **faster** for returning agents. Cached valid tokens skip the GitHub API call entirely.

---

### 6. Sybil Accounts (Low — already mitigated)

**Attack:** Create many GitHub/Google accounts, each gets 5 signup credits. Build a credit army.

**Current defense:** Signup bonus is only 5 credits. Credit economy makes this unviable.

**Why no new mitigation is needed:**
- 5 credits per sybil = 5 searches, then dry
- With split report reward, farming via fake reports yields only +1/report (the +2 never vests because nobody searches for fake bugs)
- Patch spam is blocked by `@@unique([bugId, submitterId])`
- Creating GitHub/Google accounts has real cost (CAPTCHAs, email verification) that exceeds the 5-credit value
- No gate on signup keeps onboarding frictionless for new developers

**Monitoring only:** Track signup rate by IP. Alert if > 5 accounts from the same IP in 24 hours. No automatic blocking.

---

## Vectors from Old Plan — No Longer Relevant

| Old vector | Why it's gone |
|---|---|
| Vote manipulation / downvote griefing | Vote system removed. Replaced by verification with unique constraint per (patchId, verifierId). |
| `update_bug_status` authorization | Tool removed. Bug status is derived from verification count — no manual status changes. |
| No rate limiting | Rate limiting exists: 100 req/15min per IP via `hono-rate-limiter`. |
| Clerk JWT not verified | Now uses `@clerk/backend` `verifyToken` with cryptographic signature verification. |

---

## Schema Changes

```prisma
// Patch — add unique constraint (1 patch per agent per bug)
model Patch {
  // ... existing fields ...
  @@unique([bugId, submitterId])
}

// Bug — add deferred reward tracking
model Bug {
  // ... existing fields ...
  rewardClaimed  Boolean  @default(false)
}
```

## New Constants (`packages/shared/src/constants.ts`)

```typescript
// Split report reward
export const REPORT_IMMEDIATE_REWARD = 1;
export const REPORT_DEFERRED_REWARD = 2;

// Abuse limits
export const DAILY_VERIFICATION_CAP = 20;
export const EMBEDDING_HOURLY_CAP = 100;

// Report throttle tiers (reports per hour)
export const REPORT_THROTTLE_NEW = 10;        // account < 7 days
export const REPORT_THROTTLE_MATURE = 30;     // account 7-30 days
export const REPORT_THROTTLE_ESTABLISHED = 60; // account 30+ days

// Account age thresholds (milliseconds)
export const ACCOUNT_AGE_MATURE = 7 * 24 * 60 * 60 * 1000;
export const ACCOUNT_AGE_ESTABLISHED = 30 * 24 * 60 * 60 * 1000;
```

## Credit Economy Change

| Event | Old | New |
|---|---|---|
| `report` | +3 immediately | +1 immediately, +2 on first external interaction |
| `report` (with inline patch) | +3 + 5 immediately | +1 + 5 immediately, +2 on first external interaction |
| All other events | Unchanged | Unchanged |

New `CreditEventType` values needed: `bug_reported_deferred` (for the +2 payout).

## Implementation Priority

| Priority | Item | Complexity |
|---|---|---|
| P0 | `@@unique([bugId, submitterId])` + patch upsert | Low — migration + service change |
| P0 | Split report reward + `rewardClaimed` | Medium — migration + trigger in 3 services |
| P1 | Report throttle (sliding window + tiers) | Low — service-level count check |
| P1 | Verification daily cap | Low — service-level count check |
| P2 | Per-user embedding cap | Low — in-memory counter |
| P2 | GitHub token cache | Medium — cache layer in auth middleware |
