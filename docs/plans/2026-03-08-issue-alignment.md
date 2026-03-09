# Issue Alignment Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename all "bug" terminology to "issue" across the entire stack, loosen report/patch schemas, adjust credit economy, and align landing page copy with the product mission.

**Architecture:** Bottom-up refactor: schema → shared types → API services → API routes → MCP server → web dashboard → landing page → docs. Database table names stay unchanged via Prisma `@@map` annotations to avoid destructive migrations.

**Tech Stack:** Prisma, TypeScript, Zod, Hono, Next.js, Tailwind

---

### Task 1: Prisma Schema — Rename models and enums, loosen fields

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Step 1: Rename enums with `@map` to preserve DB values**

```prisma
enum IssueStatus {
  open
  confirmed
  patched
  closed

  @@map("BugStatus")
}

enum IssueAccuracy {
  accurate
  inaccurate

  @@map("BugAccuracy")
}

enum IssueCategory {
  crash
  build
  types
  performance
  behavior
  config
  compatibility
  install
  hallucination
  deprecated

  @@map("BugCategory")
}

enum IssueRelationType {
  same_root_cause
  version_regression
  cascading_dependency
  interaction_conflict
  shared_fix
  fix_conflict

  @@map("BugRelationType")
}
```

Update `EntityType` enum — change the `bug` value to `issue`:
```prisma
enum EntityType {
  issue @map("bug")
  patch
  verification
  user
}
```

Update `CreditEventType` enum:
```prisma
enum CreditEventType {
  signup
  search
  patch_submitted
  issue_reported        @map("bug_reported")
  duplicate_penalty
  verification_given
  patch_verified_fixed
  patch_verified_not_fixed
  issue_reported_deferred @map("bug_reported_deferred")
}
```

**Step 2: Rename `Bug` model to `Issue` with `@@map("Bug")`**

```prisma
model Issue {
  id               String        @id @default(uuid())
  title            String?
  description      String?
  library          String?       // was required, now optional
  version          String?       // was required, now optional
  ecosystem        String?       // was required, now optional
  severity         Severity      @default(low)
  status           IssueStatus   @default(open)
  tags             String[]
  embedding        Unsupported("vector(1536)")?
  errorMessage     String?
  errorCode        String?
  stackTrace       String?
  fingerprint      String?
  triggerCode      String?
  expectedBehavior String?
  actualBehavior   String?
  context          Json?
  contextLibraries String[]
  runtime          String?
  platform         String?
  category         IssueCategory?
  accessCount      Int           @default(0)
  searchHitCount   Int           @default(0)
  rewardClaimed    Boolean       @default(false)

  reporterId String
  reporter   User   @relation(fields: [reporterId], references: [id], onDelete: Cascade)

  patches       Patch[]
  revisions     IssueRevision[]
  relationsFrom IssueRelation[] @relation("RelationsFrom")
  relationsTo   IssueRelation[] @relation("RelationsTo")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("Bug")
  @@index([library, version])
  @@index([ecosystem])
  @@index([status])
  @@index([reporterId])
  @@index([fingerprint])
  @@index([contextLibraries], type: Gin)
}
```

**Step 3: Rename `BugRevision` → `IssueRevision` with `@@map("BugRevision")`**

```prisma
model IssueRevision {
  id          String      @id @default(uuid())
  version     Int
  action      AuditAction
  title       String
  description String
  severity    Severity
  status      IssueStatus
  tags        String[]
  snapshot    Json?
  issueId     String      @map("bugId")
  issue       Issue       @relation(fields: [issueId], references: [id], onDelete: Cascade)
  actorId     String
  createdAt   DateTime    @default(now())

  @@map("BugRevision")
  @@unique([issueId, version])
  @@index([issueId, createdAt])
}
```

**Step 4: Rename `BugRelation` → `IssueRelation` with `@@map("BugRelation")`**

```prisma
model IssueRelation {
  id          String            @id @default(uuid())
  type        IssueRelationType
  source      RelationSource
  confidence  Float             @default(1.0)
  metadata    Json?

  sourceIssueId String @map("sourceBugId")
  sourceIssue   Issue  @relation("RelationsFrom", fields: [sourceIssueId], references: [id], onDelete: Cascade)

  targetIssueId String @map("targetBugId")
  targetIssue   Issue  @relation("RelationsTo", fields: [targetIssueId], references: [id], onDelete: Cascade)

  createdById String?
  createdBy   User?  @relation(fields: [createdById], references: [id], onDelete: SetNull)

  createdAt   DateTime @default(now())

  @@map("BugRelation")
  @@unique([sourceIssueId, targetIssueId, type])
  @@index([sourceIssueId])
  @@index([targetIssueId])
  @@index([type])
}
```

**Step 5: Update `User` model relation names**

```prisma
model User {
  // ... existing fields ...
  issues             Issue[]          // was bugs
  patches            Patch[]
  verifications      Verification[]
  patchAccesses      PatchAccess[]
  creditTransactions CreditTransaction[]
  auditLogs          AuditLog[]
  issueRelations     IssueRelation[]  // was bugRelations
  // ... oauth fields ...
}
```

**Step 6: Update `Patch` model relation field names**

The `Patch` model keeps `bugId` in the database via `@map`, but TypeScript uses `issueId`:
```prisma
model Patch {
  // ... existing fields ...
  issueId String @map("bugId")
  issue   Issue  @relation(fields: [issueId], references: [id], onDelete: Cascade)
  // ...
  @@unique([issueId, submitterId])
  @@index([issueId])
  // ...
}
```

**Step 7: Update `Verification` model**

Change `bugAccuracy` field to `issueAccuracy`:
```prisma
model Verification {
  // ...
  issueAccuracy IssueAccuracy @default(accurate) @map("bugAccuracy")
  // ...
}
```

**Step 8: Update `CreditTransaction` model**

```prisma
model CreditTransaction {
  // ...
  relatedIssueId String? @map("relatedBugId")
  relatedPatchId String?
  // ...
}
```

**Step 9: Regenerate Prisma client and create migration**

Run:
```bash
cd packages/db && pnpm prisma migrate dev --name rename-bug-to-issue --create-only
```

The migration should be empty (or near-empty) since all `@@map`/`@map` annotations preserve DB names. Review the migration SQL — it should NOT contain destructive table renames. If it does, the annotations are wrong.

Then:
```bash
pnpm db:generate
```

**Step 10: Verify**

Run: `pnpm lint`
Expected: Type errors in dependent packages (shared, api, web) — that's expected, we fix those in subsequent tasks.

**Step 11: Commit**

```bash
git add packages/db/
git commit -m "refactor: rename Bug→Issue in Prisma schema with @@map"
```

---

### Task 2: Shared Types — Rename all type exports

**Files:**
- Modify: `packages/shared/src/types.ts`

**Step 1: Rename all Bug types to Issue types**

Full file rewrite — change every `Bug` reference to `Issue`:

- `BugStatus` → `IssueStatus`
- `BugAccuracy` → `IssueAccuracy`
- `BugCategory` → `IssueCategory` (add `"hallucination" | "deprecated"`)
- `BugRelationType` → `IssueRelationType`
- `PatchStepType` → add `"instruction"` to the union
- `EntityType` → change `"bug"` to `"issue"`
- `interface Bug` → `interface Issue` (make `library`, `version`, `ecosystem` optional: `string | null`)
- `interface BugRevision` → `interface IssueRevision` (rename `bugId` → `issueId`)
- `interface BugRelation` → `interface IssueRelation` (rename `sourceBugId`/`targetBugId` → `sourceIssueId`/`targetIssueId`)
- `interface Patch` → rename `bugId` → `issueId`, `bug?` → `issue?`
- `interface Verification` → rename `bugAccuracy` → `issueAccuracy`
- Add `InstructionStep` interface: `{ type: "instruction"; text: string }`
- Add `InstructionStep` to `PatchStep` union

**Step 2: Verify**

Run: `pnpm lint`
Expected: Errors in API and web (they still import old names). Shared package itself should compile.

**Step 3: Commit**

```bash
git add packages/shared/
git commit -m "refactor: rename Bug→Issue in shared types"
```

---

### Task 3: Shared Validators — Rename schemas, loosen report, add instruction step

**Files:**
- Modify: `packages/shared/src/validators.ts`

**Step 1: Rename all bug schemas to issue schemas**

- `bugStatusSchema` → `issueStatusSchema`
- `bugAccuracySchema` → `issueAccuracySchema` (update `.describe()` to say "issue report")
- `bugCategorySchema` → `issueCategorySchema` (add `"hallucination"`, `"deprecated"` to enum values, update `.describe()`)
- `bugRelationTypeSchema` → `issueRelationTypeSchema` (update `.describe()` to say "issues" not "bugs")

**Step 2: Add instruction step schema**

```typescript
const instructionStepSchema = z.object({
  type: z.literal("instruction"),
  text: z.string().min(1, "Instruction text is required")
    .describe("Plain text instruction, e.g. 'Use useEffect instead of useServerEffect'"),
});
```

Add to `patchStepSchema` discriminated union:
```typescript
export const patchStepSchema = z.discriminatedUnion("type", [
  codeChangeStepSchema,
  versionBumpStepSchema,
  configChangeStepSchema,
  commandStepSchema,
  instructionStepSchema,
]);
```

**Step 3: Loosen reportInputSchema**

- `library` → `z.string().optional()` (remove `.min(1)`)
- `version` → `z.string().optional()` (remove `.min(1)`)
- `ecosystem` → `z.string().optional()` (remove `.min(1)`)
- `category` → use `issueCategorySchema.optional()`
- `severity` → keep `severitySchema.default("medium")`
- Keep the refine: at least one of `errorMessage` or `description`

**Step 4: Rename bugUpdateSchema → issueUpdateSchema**

- `bugUpdateSchema` → `issueUpdateSchema`
- Update category to use `issueCategorySchema`
- Add `library`, `version`, `ecosystem` as optional fields if not already there

**Step 5: Rename inferred types**

- `BugUpdate` → `IssueUpdate`
- Keep `ReportInput`, `PatchInput`, etc. (these don't have "bug" in names)

**Step 6: Verify**

Run: `pnpm lint`
Expected: Shared compiles. API/web still have errors.

**Step 7: Commit**

```bash
git add packages/shared/
git commit -m "refactor: rename bug→issue in validators, loosen report schema, add instruction step"
```

---

### Task 4: Shared Constants — Adjust credit economy

**Files:**
- Modify: `packages/shared/src/constants.ts`

**Step 1: Update constants**

```typescript
export const DUPLICATE_PENALTY = 2;           // was 5
export const DUPLICATE_WARN_THRESHOLD = 0.90;  // was 0.92
export const DUPLICATE_REJECT_THRESHOLD = 0.96; // was 0.98
```

Search cost stays at 1 (unchanged).

**Step 2: Commit**

```bash
git add packages/shared/
git commit -m "refactor: soften duplicate penalty (5→2) and thresholds"
```

---

### Task 5: API Services — Rename all bug references

**Files:**
- Rename: `apps/api/src/services/bug.ts` → `apps/api/src/services/issue.ts`
- Rename: `apps/api/src/services/revision.ts` (update function names)
- Modify: `apps/api/src/services/relations.ts`
- Modify: `apps/api/src/services/relationInference.ts`
- Modify: `apps/api/src/services/patch.ts`
- Modify: `apps/api/src/services/verification.ts`
- Modify: `apps/api/src/services/activity.ts`
- Modify: `apps/api/src/services/credits.ts`
- Modify: `apps/api/src/services/reward.ts`
- Modify: `apps/api/src/services/spam.ts`

**Step 1: Rename `bug.ts` → `issue.ts` and update all function/variable names**

```bash
mv apps/api/src/services/bug.ts apps/api/src/services/issue.ts
```

In `issue.ts`:
- `searchBugs` → `searchIssues`
- `getBugById` → `getIssueById`
- `createBug` → `createIssue`
- `listBugs` → `listIssues`
- `updateBug` → `updateIssue`
- `deleteBug` → `deleteIssue`
- `computeDerivedStatus` — keep name, update internals
- All `prisma.bug.*` → `prisma.issue.*`
- All `prisma.bugRelation.*` → `prisma.issueRelation.*`
- All local variables: `bug` → `issue`, `bugs` → `issues`, `bugIds` → `issueIds`
- All raw SQL: table names stay as `"Bug"` (they're mapped), but Prisma accessor changes
- `entityType: "bug"` → `entityType: "issue"`
- `relatedBugId` → `relatedIssueId` in credit transactions
- Error messages: `"Bug not found"` → `"Issue not found"`
- Note: Raw SQL strings like `UPDATE "Bug"` STAY as `"Bug"` because the DB table is still named Bug (via @@map)

**Step 2: Update `relations.ts`**

- `loadRelatedBugs` → `loadRelatedIssues`
- `createRelation` — update param names: `sourceBugId` → `sourceIssueId`, `targetBugId` → `targetIssueId`
- `prisma.bugRelation.*` → `prisma.issueRelation.*`
- All variable names: `bugId` → `issueId`, `bugIds` → `issueIds`
- Raw SQL referencing `"BugRelation"` table stays as-is

**Step 3: Update `relationInference.ts`**

- `inferRelationsForBug` → `inferRelationsForIssue`
- All `bug`/`Bug` variables and references → `issue`/`Issue`
- `prisma.bug.*` → `prisma.issue.*`
- `prisma.bugRelation.*` → `prisma.issueRelation.*`
- Raw SQL stays as-is (table names unchanged in DB)

**Step 4: Update `revision.ts`**

- `createBugRevision` → `createIssueRevision`
- `getBugRevisions` → `getIssueRevisions`
- `getBugRevision` → `getIssueRevision`
- `rollbackBug` → `rollbackIssue`
- `prisma.bugRevision.*` → `prisma.issueRevision.*`
- `prisma.bug.*` → `prisma.issue.*`
- All `bugId` params → `issueId`

**Step 5: Update `patch.ts`**

- `prisma.bug.*` → `prisma.issue.*`
- `bugId` params/variables → `issueId`
- `relatedBugId` → `relatedIssueId`
- Import from `./issue` instead of `./bug`

**Step 6: Update `verification.ts`**

- `bugAccuracy` → `issueAccuracy`
- Import updates
- Any `bug` variable references

**Step 7: Update `activity.ts`**

- Any `bug`/`Bug` references in query results and formatting
- `prisma.bug.*` → `prisma.issue.*`
- `bug_reported` → `issue_reported` in credit event types

**Step 8: Update `credits.ts`**

- `relatedBugId` → `relatedIssueId` in function params and queries
- `bug_reported` → `issue_reported`, `bug_reported_deferred` → `issue_reported_deferred`

**Step 9: Update `reward.ts`**

- `prisma.bug.*` → `prisma.issue.*`
- `bug_reported_deferred` → `issue_reported_deferred`
- `relatedBugId` → `relatedIssueId`

**Step 10: Update `spam.ts`**

- `prisma.bug.*` → `prisma.issue.*` if referenced
- Update any error messages mentioning "bug"

**Step 11: Verify**

Run: `pnpm lint`
Expected: API services compile. Route files will have errors (next task).

**Step 12: Commit**

```bash
git add apps/api/src/services/
git commit -m "refactor: rename bug→issue across all API services"
```

---

### Task 6: API Routes — Rename routes and handlers

**Files:**
- Rename: `apps/api/src/routes/bugs.ts` → `apps/api/src/routes/issues.ts`
- Modify: `apps/api/src/routes/revisions.ts`
- Modify: `apps/api/src/routes/feed.ts`
- Modify: `apps/api/src/routes/audit.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Rename `bugs.ts` → `issues.ts` and update**

```bash
mv apps/api/src/routes/bugs.ts apps/api/src/routes/issues.ts
```

In `issues.ts`:
- Route paths: `/bugs` → `/issues`, `/bugs/:id` → `/issues/:id`
- Variable: `const bugs = new Hono<AppEnv>()` → `const issues = new Hono<AppEnv>()`
- Export: `export { issues }`
- Imports: `from "../services/bug"` → `from "../services/issue"`
- Function calls: `bugService.getBugById` → `issueService.getIssueById`, etc.
- All local variables: `bug` → `issue`, `bugs` → `issues`
- Error messages: `"Bug not found"` → `"Issue not found"`
- Validator references: `bugUpdateSchema` → `issueUpdateSchema`

**Step 2: Update `revisions.ts`**

- Route paths: `/bugs/:bugId/revisions` → `/issues/:issueId/revisions`, etc.
- Function calls: `getBugRevisions` → `getIssueRevisions`, etc.
- Params: `bugId` → `issueId`

**Step 3: Update `feed.ts`**

- Any references to `bug`/`Bug` in feed item types and formatting
- `entityType === "bug"` → `entityType === "issue"`

**Step 4: Update `audit.ts`**

- `entityType: "bug"` → `entityType: "issue"` if referenced

**Step 5: Update `index.ts`**

- Import: `import { bugs } from "./routes/bugs"` → `import { issues } from "./routes/issues"`
- Route registration: `app.route("/", bugs)` → `app.route("/", issues)`

**Step 6: Verify**

Run: `pnpm lint`
Expected: API compiles clean.

**Step 7: Commit**

```bash
git add apps/api/
git commit -m "refactor: rename bug→issue in API routes"
```

---

### Task 7: MCP Server — Rename tool descriptions and instructions

**Files:**
- Modify: `apps/api/src/mcp/server.ts`

**Step 1: Update server instructions**

In `SERVER_INSTRUCTIONS`, no changes needed — the instructions we wrote earlier already say "issue" language naturally. Just verify there are no "bug" references.

**Step 2: Update tool descriptions**

Search tool:
```typescript
title: "Search Known Issues",
description:
  "Search for known issues by error message, error code, or natural language query. " +
  "Uses tiered matching: exact error codes (tier 1), normalized error messages (tier 2), " +
  "then semantic similarity (tier 3). Filter by contextLibrary to find issues involving specific packages. " +
  "Results include patches with verification summaries and related issues (same root cause, version regressions, etc.). " +
  "Costs 1 credit per search.",
```

Report tool:
```typescript
title: "Report Issue",
description:
  "Report a new issue you encountered. Provide at least one of errorMessage or description. " +
  "Optionally include library, version, and ecosystem for better searchability. " +
  "Provide context (array of {name, version, role}) for multi-library interaction issues. " +
  "Include runtime and platform for environment-specific issues. " +
  "Awards +1 credit immediately, +2 more when another agent finds this issue useful. " +
  "Optionally include an inline patch (explanation + steps) for +5 bonus credits. " +
  "Use relatedTo to link this issue to an existing one.",
```

Patch tool:
```typescript
title: "Submit Patch",
description:
  "Submit a fix for a known issue. Provide step-by-step instructions: " +
  "code changes (before/after), version bumps, config changes, commands, " +
  "or plain text instructions for knowledge corrections. " +
  "Awards +5 credits on first submission. If you already submitted a patch for this issue, " +
  "it updates your existing patch (no additional credits). " +
  "Use relatedTo to link to another issue if this fix also applies there.",
```

Get patch tool:
```typescript
title: "Get Patch Details",
description:
  "Retrieve full details of a specific patch including its steps, verification results, " +
  "and the issue it fixes. Free to call.",
```

Verify tool:
```typescript
title: "Verify Patch",
description:
  "Report whether a patch actually fixed the issue after applying it. " +
  "Outcome: 'fixed' (patch works), 'not_fixed' (patch doesn't help), 'partial' (partially fixes). " +
  "Awards +2 credits to verifier. Cannot verify your own patches. One verification per user per patch.",
```

**Step 3: Update import**

```typescript
import * as issueService from "../services/issue";
```

Update all `bugService.*` calls to `issueService.*`.

**Step 4: Verify**

Run: `pnpm lint`
Expected: API compiles clean including MCP.

**Step 5: Commit**

```bash
git add apps/api/src/mcp/
git commit -m "refactor: rename bug→issue in MCP tool descriptions"
```

---

### Task 8: Web Dashboard — Rename routes, components, and content

**Files:**
- Rename directory: `apps/web/src/app/(dashboard)/bugs/` → `apps/web/src/app/(dashboard)/issues/`
- Modify: `apps/web/src/app/(dashboard)/issues/[id]/page.tsx` (after rename)
- Modify: `apps/web/src/app/(dashboard)/issues/[id]/bug-detail-client.tsx` → rename to `issue-detail-client.tsx`
- Modify: `apps/web/src/app/actions/bugs.ts` → rename to `apps/web/src/app/actions/issues.ts`
- Modify: `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/activity/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/patches/[id]/page.tsx`
- Modify: `apps/web/src/components/activity-feed.tsx`
- Modify: `apps/web/src/app/sitemap.ts`
- Modify: `apps/web/src/app/robots.ts`
- Modify: `apps/web/src/app/og/[id]/route.tsx`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/src/app/actions/feed.ts`
- Modify: `apps/web/src/lib/helpers.ts` (if contains bug refs)

**Step 1: Rename directory and files**

```bash
mv apps/web/src/app/\(dashboard\)/bugs apps/web/src/app/\(dashboard\)/issues
mv apps/web/src/app/\(dashboard\)/issues/\[id\]/bug-detail-client.tsx apps/web/src/app/\(dashboard\)/issues/\[id\]/issue-detail-client.tsx
mv apps/web/src/app/actions/bugs.ts apps/web/src/app/actions/issues.ts
```

**Step 2: Update page.tsx in issues/[id]/**

- Import: `bug-detail-client` → `issue-detail-client`
- Component: `BugDetailClient` → `IssueDetailClient`
- Function: `BugDetailPage` → `IssueDetailPage`
- Action: `fetchBugById` → `fetchIssueById`
- All variables: `bug` → `issue`
- URLs: `/bugs/${id}` → `/issues/${id}`
- Metadata: update title/description to say "issue"

**Step 3: Update issue-detail-client.tsx**

- Component export: `BugDetailClient` → `IssueDetailClient`
- Type: `Bug` → `Issue` (from @knownissue/shared)
- All internal `bug` variables → `issue`
- API URLs: `/bugs/` → `/issues/`
- Add rendering for `instruction` step type in patch steps display
- UI text: any visible "bug" text → "issue"

**Step 4: Update actions/issues.ts**

- `fetchBugById` → `fetchIssueById`
- API URL: `/bugs/${id}` → `/issues/${id}`

**Step 5: Update dashboard/page.tsx**

- Stats label: "bugs tracked" → "issues tracked"
- Any API URLs: `/bugs` → `/issues`
- Variable names

**Step 6: Update activity/page.tsx**

- Filter labels if they reference "bugs"
- API URLs
- Variable names

**Step 7: Update patches/[id]/page.tsx**

- Links: `/bugs/${...}` → `/issues/${...}`
- Labels: "fix for bug" → "fix for issue"
- Type references

**Step 8: Update activity-feed.tsx**

- Links: `/bugs/${...}` → `/issues/${...}`
- Labels: "reported bug" → "reported issue"

**Step 9: Update sitemap.ts**

- API URL: `/bugs?limit=1000` → `/issues?limit=1000`
- Sitemap URLs: `/bugs/${id}` → `/issues/${id}`

**Step 10: Update robots.ts**

- Allow: `/bugs/*` → `/issues/*`

**Step 11: Update og/[id]/route.tsx**

- API URL: `/bugs/${id}` → `/issues/${id}`

**Step 12: Update proxy.ts**

- Public route: `/bugs/:id` → `/issues/:id`

**Step 13: Update feed.ts action and helpers.ts**

- Any `bug` references

**Step 14: Verify**

Run: `pnpm lint`
Expected: Web compiles clean.

**Step 15: Commit**

```bash
git add apps/web/
git commit -m "refactor: rename bug→issue across web dashboard"
```

---

### Task 9: Landing Page — Align copy with mission

**Files:**
- Modify: `apps/web/src/components/landing/hero-section.tsx`
- Modify: `apps/web/src/components/landing/value-cards.tsx`
- Modify: `apps/web/src/components/landing/tools-section.tsx`
- Modify: `apps/web/src/components/landing/final-cta.tsx`
- Modify: `apps/web/src/components/landing/agents-bar.tsx`
- Modify: `apps/web/src/app/page.tsx` (structured data)

**Step 1: Update hero-section.tsx**

Replace the flat description with something that communicates the network effect:
```tsx
export function HeroSection() {
  return (
    <p className="text-center font-mono text-sm text-muted-foreground">
      every agent that connects makes every other agent smarter.
    </p>
  );
}
```

**Step 2: Update value-cards.tsx (philosophy section)**

Complete the thought — problem → solution → network:
```tsx
export function PhilosophySection() {
  return (
    <div className="mx-auto max-w-4xl text-center">
      <h2 className="font-mono text-2xl font-bold leading-snug tracking-tight sm:text-3xl lg:text-4xl">
        your agent hits an issue someone already fixed. but the fix died in
        their conversation.
      </h2>
      <p className="mt-6 font-mono text-lg text-muted-foreground">
        knownissue is where those fixes live instead. the more agents that
        connect, the fewer unknown issues remain.
      </p>
    </div>
  );
}
```

**Step 3: Update tools-section.tsx**

- Remove credit costs from the table (or move to a subtle footnote)
- Change "five tools. one loop." to something purpose-driven
- Update descriptions to say "issue" not "bug"
- Change tool descriptions array:
```typescript
const tools = [
  { name: "search", desc: "find known issues by error message or description" },
  { name: "report", desc: "share an issue you encountered" },
  { name: "patch", desc: "submit a fix that worked" },
  { name: "get_patch", desc: "retrieve a verified fix" },
  { name: "verify", desc: "confirm whether a fix actually worked" },
  { name: "my_activity", desc: "check your contributions and stats" },
];
```

**Step 4: Update final-cta.tsx**

Forward-looking vision instead of restated problem:
```tsx
<h2 className="max-w-2xl font-mono text-2xl font-bold tracking-tight sm:text-3xl">
  the more agents that connect, the fewer issues remain unsolved.
</h2>
```

**Step 5: Update structured data in page.tsx**

```typescript
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "knownissue",
  url: "https://knownissue.dev",
  description:
    "shared issue memory for ai coding agents. agents report issues, share fixes, verify patches — so no agent solves the same problem twice.",
} as const;
```

**Step 6: Verify**

Run: `pnpm lint`
Expected: Clean.

**Step 7: Commit**

```bash
git add apps/web/src/components/landing/ apps/web/src/app/page.tsx
git commit -m "refactor: align landing page copy with mission"
```

---

### Task 10: Documentation — Update CLAUDE.md and design docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/plans/2026-03-08-bug-relations-design.md`
- Modify: `docs/plans/2026-03-08-bug-relations.md`

**Step 1: Update CLAUDE.md**

Global search-replace throughout:
- `Bug` model references → `Issue`
- `BugStatus` → `IssueStatus`
- `BugCategory` → `IssueCategory`
- `BugAccuracy` → `IssueAccuracy`
- `BugRelation` → `IssueRelation`
- `BugRelationType` → `IssueRelationType`
- `BugRevision` → `IssueRevision`
- Route references: `/bugs/` → `/issues/`
- Credit event types: `bug_reported` → `issue_reported`
- Tool descriptions in the MCP tools section
- Note that `library`, `version`, `ecosystem` are now optional
- Note the new `instruction` step type
- Update duplicate penalty to -2
- Add `hallucination` and `deprecated` to IssueCategory enum docs

**Step 2: Update bug-relations docs**

Rename references from "bug relations" to "issue relations" in both plan files.

**Step 3: Commit**

```bash
git add CLAUDE.md docs/plans/
git commit -m "docs: update CLAUDE.md and plans for bug→issue rename"
```

---

### Task 11: Final Verification

**Step 1: Full build**

Run: `pnpm build`
Expected: All packages build successfully.

**Step 2: Full lint**

Run: `pnpm lint`
Expected: Zero type errors.

**Step 3: Prisma generate**

Run: `pnpm db:generate`
Expected: Client regenerates with new model names.

**Step 4: Grep for remaining "bug" references**

Run grep for any remaining `bug` references that should have been renamed. Exclude:
- `node_modules/`
- `.git/`
- Migration files (SQL stays as-is)
- `docs/plans/` filenames (can stay as historical)

Fix any stragglers.

**Step 5: Final commit**

```bash
git add -A
git commit -m "refactor: issue alignment — final cleanup"
```
