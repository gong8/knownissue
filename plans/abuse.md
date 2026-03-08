# Abuse Vectors & Mitigation Plan

## 1. Credit Farming via Sybil Accounts (Critical)

**The attack:** Create unlimited GitHub accounts (or Clerk accounts), each gets 10 free credits. There's no rate limiting on account creation, no email verification, and no linking between accounts.

- A single person can create N GitHub accounts -> N users -> N * 10 credits
- Each account can `submit_patch` on bugs reported by another Sybil account -> +5 credits per patch, unlimited times
- Sybil accounts can upvote each other's patches -> +1 credit per upvote

**Net effect:** Infinite credits from nothing. The entire credit economy collapses.

## 2. Patch Spam for Credits (High)

**The attack:** `submit_patch` awards +5 credits *unconditionally* -- there are no checks for:
- Patch quality or validity
- Duplicate patches on the same bug
- Whether the submitter also reported the bug (self-patching)

One user can: report a bug (free) -> submit garbage patches against it repeatedly -> earn 5 credits each time. There's no cap on patches per bug or per user.

## 3. Coordinated Vote Manipulation (High)

**The attack:** Two real users (or Sybil accounts) trade upvotes:
- User A submits a patch, User B upvotes it (+1 to A)
- User B submits a patch, User A upvotes it (+1 to B)
- The self-review check only prevents reviewing *your own* patch, not coordinated rings

This is a net credit generator -- both users end up richer.

## 4. Downvote Griefing (Medium)

**The attack:** A malicious user with even 0 credits can still downvote other users' patches (reviewing is free, no credit cost). This drains the victim's credits by -1 per downvote. The attacker pays nothing.

**Amplified by Sybils:** N accounts can each downvote the same patch author's different patches, draining them to 0.

## 5. `update_bug_status` Has No Authorization (Medium)

In `server.ts:132-145` and `bug.ts:291-300`, **any authenticated user** can change any bug's status (open -> closed, etc.). There's no check that the user is the reporter, a patch author, or an admin. A griefer can close every open bug.

## 6. No Rate Limiting Anywhere (Medium)

There's no rate limiting on:
- Auth requests (each hit calls `api.github.com/user` -- could be used to probe/rate-limit your GitHub API quota)
- Bug creation
- Patch submission
- Reviews
- Search (beyond the 1-credit cost, which is trivially farmed)

## 7. Duplicate Detection is Bypassable (Low-Medium)

The 0.98 similarity threshold can be evaded by slightly rewording the title/description. An attacker can flood the database with near-duplicates that each score 0.91 similarity (below the 0.92 warn threshold). If `OPENAI_API_KEY` is unset, duplicate detection is completely disabled (`checkDuplicate` returns `{ isDuplicate: false }`).

## 8. Embedding Cost Amplification (Low-Medium)

Every `report_bug` and `search_bugs` call generates an OpenAI embedding. Since `report_bug` is free and there's no rate limit, an attacker can force your OpenAI bill up by spamming bug reports. Each call to `text-embedding-3-small` costs money, and the attacker pays 0 credits.

## 9. GitHub API as Auth Bottleneck (Low)

Every request tries Strategy 1 first (GitHub API call). If an attacker sends many requests with invalid tokens that *look like* GitHub PATs, each one triggers a `fetch` to `api.github.com/user`. This could exhaust your GitHub API rate limit (60/hour unauthenticated, or your server's IP rate limit), potentially degrading auth for legitimate users.

---

## Fixes by Priority

| Priority | Fix |
|----------|-----|
| P0 | Cap patches per user per bug (e.g., 1) |
| P0 | Rate limit account creation / require minimum GitHub account age |
| P0 | Rate limit API endpoints globally and per-user |
| P1 | Require minimum criteria for patch rewards (e.g., at least 1 upvote before credits are awarded, or delay credit payout) |
| P1 | Restrict `update_bug_status` to reporter + admin |
| P1 | Add cost to downvoting (e.g., -1 credit to the downvoter too) |
| P2 | Detect vote rings (two users always upvoting each other) |
| P2 | Cap OpenAI embedding calls per user per time window |
| P2 | Cache GitHub token validation to avoid repeated API calls |

## Core Issue

Credits can be generated faster than they're consumed, with no friction on account creation and no quality gates on patches. The economy needs either supply-side constraints (rate limits, quality checks) or demand-side sinks (more things that cost credits) to be sustainable.
