# User Identity & Sidebar Profile — Design

## Problem

1. Sidebar bottom-left shows only a bare Clerk `<UserButton />` avatar — no name, no context
2. User model has no `displayName` field — agents and humans are both anonymous UUIDs in the DB

## Decision

**Approach A: `displayName` on User, populated at creation time.**

- Simple, one field, no extra API calls at render time
- Name drift from Clerk is a non-issue in practice
- Clerk webhooks can be added later if needed — the field is already there

## Design

### 1. Schema change

Add to User model in `packages/db/prisma/schema.prisma`:

```prisma
displayName String?
```

Update `packages/shared/src/types.ts` User interface to include `displayName: string | null`.

Update `toUser()` in `apps/api/src/middleware/auth.ts` to pass through `displayName`.

### 2. Populate on user creation

**Clerk JWT path** (auth middleware + OAuth authorize): After creating a user via `prisma.user.create`, call Clerk REST API (`GET /v1/users/{clerkId}`) with `CLERK_SECRET_KEY` to fetch `first_name` + `last_name`, store as `displayName`.

If the Clerk call fails, leave `displayName` null — no hard dependency. Best-effort.

No changes to OAuth registration flow — agents don't get their own User, they act as the human who approved.

### 3. Backfill script

Standalone script at `packages/db/scripts/backfill-display-names.ts`:

- Reads `CLERK_SECRET_KEY` + `DATABASE_URL` from env
- Fetches all users with `displayName IS NULL`
- For each, calls Clerk API (`GET /v1/users/{clerkId}`) to get `first_name` + `last_name`
- Updates the DB row

Run manually: `npx tsx packages/db/scripts/backfill-display-names.ts`

### 4. Sidebar update

Sidebar bottom section becomes (when expanded):

```
[avatar]  Leixin Gong
          5 credits
```

When collapsed: just the avatar (current behavior).

- **Name**: from Clerk `useUser()` hook (already available client-side, zero extra API calls)
- **Credits**: from `fetchCurrentUser()` server action (hits `GET /users/me`, already exists)

### 5. Credits data flow

The sidebar is a client component. Options:
- Fetch credits via server action in a parent server component, pass as prop
- Or use the existing `fetchCurrentUser()` in a client-side `useEffect`/SWR pattern

Keep it simple — fetch once on mount, no real-time updates needed.

### 6. `/users/me` response update

The `GET /users/me` endpoint already returns `{ ...user, credits }`. Once `displayName` is on the User model, it'll automatically be included. No route changes needed.

---

## IMPORTANT: Post-deploy backfill

After deploying the schema migration, run the backfill script on BOTH environments:

### Dev
```bash
cd packages/db
npx tsx scripts/backfill-display-names.ts
```

### Prod (via SST tunnel or direct connection)
```bash
# Connect to prod DB (e.g. via sst tunnel)
DATABASE_URL="<prod-connection-string>" CLERK_SECRET_KEY="<prod-clerk-key>" npx tsx packages/db/scripts/backfill-display-names.ts
```

**DO NOT SKIP PROD BACKFILL.** Existing users will have `displayName: null` until this runs.
