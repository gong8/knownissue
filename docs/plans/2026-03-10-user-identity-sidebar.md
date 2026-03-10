# User Identity & Sidebar Profile — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `displayName` to the User model and show user name + credit balance in the sidebar.

**Architecture:** Add an optional `displayName` field to the Prisma User model, populate it from Clerk on user creation (best-effort), update the shared type + auth middleware, then enhance the sidebar to show name and credits alongside the avatar. A standalone backfill script resolves existing users.

**Tech Stack:** Prisma, Clerk REST API, Next.js (App Router), Tailwind CSS

---

### Task 1: Add `displayName` to Prisma schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma:98-115`

**Step 1: Add the field**

Add `displayName` after `avatarUrl` in the User model:

```prisma
model User {
  id             String   @id @default(uuid())
  clerkId        String   @unique
  displayName    String?
  avatarUrl      String?
  credits        Int      @default(5)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  ...
}
```

**Step 2: Generate migration**

Run: `cd packages/db && pnpm prisma migrate dev --name add-user-display-name`
Expected: Migration created, Prisma client regenerated.

**Step 3: Regenerate client**

Run: `pnpm db:generate`
Expected: Success.

**Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat: add displayName field to User model"
```

---

### Task 2: Update shared types and auth middleware

**Files:**
- Modify: `packages/shared/src/types.ts:53-60`
- Modify: `apps/api/src/middleware/auth.ts:17-33`

**Step 1: Update the User interface**

In `packages/shared/src/types.ts`, add `displayName` to the User interface:

```typescript
export interface User {
  id: string;
  clerkId: string;
  displayName: string | null;
  avatarUrl: string | null;
  credits: number;
  createdAt: Date;
  updatedAt: Date;
}
```

**Step 2: Update `toUser()` in auth middleware**

In `apps/api/src/middleware/auth.ts`, update the `toUser` function's parameter type and return value:

```typescript
function toUser(row: {
  id: string;
  clerkId: string;
  displayName: string | null;
  avatarUrl: string | null;
  credits: number;
  createdAt: Date;
  updatedAt: Date;
}): User {
  return {
    id: row.id,
    clerkId: row.clerkId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    credits: row.credits,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

**Step 3: Verify types compile**

Run: `pnpm lint`
Expected: No type errors.

**Step 4: Commit**

```bash
git add packages/shared/src/types.ts apps/api/src/middleware/auth.ts
git commit -m "feat: add displayName to User type and auth middleware"
```

---

### Task 3: Populate `displayName` on user creation

**Files:**
- Modify: `apps/api/src/middleware/auth.ts:65-96` (Clerk JWT auto-create)
- Modify: `apps/api/src/oauth/authorize.ts:390-402` (OAuth auto-create)

Both user creation paths need the same logic: after creating a user, call Clerk API to fetch the name and update the record.

**Step 1: Add a helper function to fetch name from Clerk**

Add at the top of `apps/api/src/middleware/auth.ts` (after imports):

```typescript
async function fetchClerkDisplayName(clerkId: string): Promise<string | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${clerkId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { first_name?: string; last_name?: string };
    const parts = [data.first_name, data.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : null;
  } catch {
    return null;
  }
}
```

Export it so the OAuth authorize route can use it:

```typescript
export { fetchClerkDisplayName };
```

**Step 2: Update Clerk JWT user creation in auth middleware**

In `authenticateClerkJwt`, after the `prisma.user.create` call (~line 84-90), fetch the name and update:

```typescript
if (!user) {
  user = await prisma.user.create({
    data: {
      clerkId: clerkUserId,
      credits: SIGNUP_BONUS,
    },
  });
  // Best-effort: populate displayName from Clerk
  const displayName = await fetchClerkDisplayName(clerkUserId);
  if (displayName) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { displayName },
    });
  }
}
```

**Step 3: Update OAuth authorize user creation**

In `apps/api/src/oauth/authorize.ts`, import `fetchClerkDisplayName` from the auth middleware:

```typescript
import { fetchClerkDisplayName } from "../middleware/auth";
```

Then update the user creation block (~line 395-402):

```typescript
if (!user) {
  user = await prisma.user.create({
    data: {
      clerkId,
      credits: SIGNUP_BONUS,
    },
  });
  const displayName = await fetchClerkDisplayName(clerkId);
  if (displayName) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { displayName },
    });
  }
}
```

**Step 4: Verify types compile**

Run: `pnpm lint`
Expected: No type errors.

**Step 5: Commit**

```bash
git add apps/api/src/middleware/auth.ts apps/api/src/oauth/authorize.ts
git commit -m "feat: populate displayName from Clerk on user creation"
```

---

### Task 4: Write backfill script

**Files:**
- Create: `packages/db/scripts/backfill-display-names.ts`

**Step 1: Create the script**

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fetchClerkDisplayName(clerkId: string): Promise<string | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is required");
  const res = await fetch(`https://api.clerk.com/v1/users/${clerkId}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) {
    console.warn(`  Failed to fetch Clerk user ${clerkId}: ${res.status}`);
    return null;
  }
  const data = (await res.json()) as { first_name?: string; last_name?: string };
  const parts = [data.first_name, data.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

async function main() {
  const users = await prisma.user.findMany({
    where: { displayName: null },
    select: { id: true, clerkId: true },
  });

  console.log(`Found ${users.length} users without displayName`);

  let updated = 0;
  let failed = 0;

  for (const user of users) {
    const name = await fetchClerkDisplayName(user.clerkId);
    if (name) {
      await prisma.user.update({
        where: { id: user.id },
        data: { displayName: name },
      });
      console.log(`  Updated ${user.clerkId} -> "${name}"`);
      updated++;
    } else {
      console.warn(`  Skipped ${user.clerkId} (no name found)`);
      failed++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

**Step 2: Verify it compiles**

Run: `cd packages/db && npx tsx scripts/backfill-display-names.ts`
Expected: Runs, finds users without displayName, fetches names from Clerk, updates DB. (It may find 0 users if dev DB is fresh, or update existing ones.)

**Step 3: Commit**

```bash
git add packages/db/scripts/backfill-display-names.ts
git commit -m "feat: add backfill script for user displayNames"
```

---

### Task 5: Update the sidebar to show name + credits

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx:1-116`

**Step 1: Add imports and state**

Add `useUser` from Clerk and `useEffect`/`useState` from React. Add `fetchCurrentUser` from actions:

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Activity,
  User,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { UserButton, useUser } from "@clerk/nextjs";
import { fetchCurrentUser } from "@/app/actions/user";
```

**Step 2: Add credits state inside the component**

At the top of `Sidebar` function body, add:

```typescript
const { user: clerkUser } = useUser();
const [credits, setCredits] = useState<number | null>(null);

useEffect(() => {
  fetchCurrentUser()
    .then((data) => setCredits(data.credits))
    .catch(() => {});
}, []);
```

**Step 3: Update the bottom section**

Replace the bottom section (lines 107-112) with:

```tsx
{/* Bottom: user */}
<div className="border-t border-border p-3">
  <div className="flex items-center gap-3">
    <UserButton />
    {!collapsed && clerkUser && (
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {clerkUser.fullName ?? clerkUser.username ?? "anonymous"}
        </p>
        {credits !== null && (
          <p className="text-xs text-muted-foreground">
            {credits} credits
          </p>
        )}
      </div>
    )}
  </div>
</div>
```

**Step 4: Verify it builds**

Run: `cd apps/web && pnpm build`
Expected: Build succeeds.

**Step 5: Visual check**

Run: `pnpm dev`
Open `http://localhost:3000`. Verify the sidebar shows:
- Avatar + "Leixin Gong" + "5 credits" when expanded
- Just the avatar when collapsed

**Step 6: Commit**

```bash
git add apps/web/src/components/sidebar.tsx
git commit -m "feat: show user name and credits in sidebar"
```

---

### Task 6: Update auth tests

**Files:**
- Modify: `apps/api/src/middleware/auth.test.ts`
- Modify: `apps/api/src/oauth/oauth.test.ts`

**Step 1: Update mock user objects in auth tests**

Any mock user objects in `auth.test.ts` need a `displayName` field added. Find all mock user objects and add `displayName: "Test User"` (or `null`). Same for `oauth.test.ts`.

**Step 2: Run tests**

Run: `cd apps/api && pnpm test`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add apps/api/src/middleware/auth.test.ts apps/api/src/oauth/oauth.test.ts
git commit -m "test: update mock users with displayName field"
```

---

## POST-DEPLOY: Backfill existing users

**DO NOT SKIP THIS. Run on both environments after the migration is deployed.**

### Dev

```bash
cd packages/db
npx tsx scripts/backfill-display-names.ts
```

### Prod (via SST tunnel or direct connection)

```bash
# 1. Connect to prod DB (e.g. sst tunnel, or set DATABASE_URL directly)
# 2. Set the prod Clerk key
DATABASE_URL="<prod-connection-string>" CLERK_SECRET_KEY="<prod-clerk-key>" npx tsx packages/db/scripts/backfill-display-names.ts
```

Verify by checking a known user: `SELECT "displayName" FROM "User" WHERE "clerkId" = '<your-clerk-id>';`
