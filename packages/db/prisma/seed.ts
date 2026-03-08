import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "postgresql://localhost:5432/knownissue",
});

const prisma = new PrismaClient({ adapter });

async function main() {
  // Create users
  const alice = await prisma.user.create({
    data: {
      githubUsername: "alice-dev",
      avatarUrl: "https://github.com/alice-dev.png",
      credits: 50,
    },
  });

  const bob = await prisma.user.create({
    data: {
      githubUsername: "bob-codes",
      avatarUrl: "https://github.com/bob-codes.png",
      credits: 35,
    },
  });

  const carol = await prisma.user.create({
    data: {
      githubUsername: "carol-eng",
      avatarUrl: "https://github.com/carol-eng.png",
      credits: 20,
    },
  });

  // Create bugs
  const bug1 = await prisma.bug.create({
    data: {
      title: "Prisma findMany throws timeout on large datasets with nested includes",
      description:
        "When using Prisma's findMany with deeply nested includes (3+ levels) on tables with >100k rows, the query times out even with proper indexes. The generated SQL uses multiple JOINs that don't leverage existing indexes effectively. Reproducible on Prisma 5.x with PostgreSQL 15.",
      library: "prisma",
      version: "5.22.0",
      ecosystem: "node",
      severity: "high",
      status: "open",
      tags: ["performance", "query", "postgresql"],
      context: [
        { name: "postgresql", version: "15.0", role: "database" },
        { name: "@prisma/client", version: "5.22.0", role: "orm" },
      ],
      contextLibraries: ["postgresql", "@prisma/client"],
      runtime: "node 20.11.0",
      platform: "linux-x64",
      category: "performance",
      confirmedCount: 2,
      reporterId: alice.id,
    },
  });

  const bug2 = await prisma.bug.create({
    data: {
      title: "Next.js App Router dynamic routes return 404 after deployment to Vercel",
      description:
        "Dynamic routes using [slug] in the App Router work fine locally with `next dev` but return 404 after deploying to Vercel. This only happens when using generateStaticParams with fallback. The issue seems related to ISR revalidation not triggering correctly for new paths added after build time.",
      library: "next",
      version: "15.1.0",
      ecosystem: "node",
      severity: "critical",
      status: "confirmed",
      tags: ["deployment", "routing", "vercel", "isr"],
      context: [
        { name: "react", version: "19.0.0", role: "framework" },
        { name: "vercel", version: "latest", role: "platform" },
      ],
      contextLibraries: ["react", "vercel"],
      runtime: "node 20.11.0",
      platform: "linux-x64",
      category: "behavior",
      confirmedCount: 3,
      reporterId: bob.id,
    },
  });

  const bug3 = await prisma.bug.create({
    data: {
      title: "React useEffect cleanup runs twice in development causing race conditions",
      description:
        "In React 18+ strict mode, useEffect cleanup functions run twice during development, causing issues with WebSocket connections and API subscriptions. The second mount creates duplicate subscriptions that are never cleaned up. While this is 'by design', the behavior causes real bugs in data-fetching libraries that don't account for it.",
      library: "react",
      version: "18.3.1",
      ecosystem: "node",
      severity: "medium",
      status: "patched",
      tags: ["hooks", "strict-mode", "websocket"],
      context: [
        { name: "react-dom", version: "18.3.1", role: "renderer" },
      ],
      contextLibraries: ["react-dom"],
      runtime: "node 20.11.0",
      category: "behavior",
      confirmedCount: 5,
      reporterId: alice.id,
    },
  });

  const bug4 = await prisma.bug.create({
    data: {
      title: "Tailwind CSS arbitrary values break with CSS variables containing spaces",
      description:
        "Using Tailwind's arbitrary value syntax with CSS custom properties that contain spaces (e.g., `bg-[var(--my-color, rgb(0 0 0))]`) generates invalid CSS. The parser incorrectly splits the value at the space inside the rgb() function. This works fine with hex values but fails with any space-separated color format.",
      library: "tailwindcss",
      version: "3.4.17",
      ecosystem: "node",
      severity: "low",
      status: "open",
      tags: ["css", "parser", "custom-properties"],
      category: "build",
      reporterId: carol.id,
    },
  });

  const bug5 = await prisma.bug.create({
    data: {
      title: "TypeScript 5.7 incorrectly narrows union types in switch statements with fallthrough",
      description:
        "TypeScript 5.7's control flow analysis incorrectly narrows union types when a switch statement has intentional fallthrough cases. The type is narrowed to the first matching case even when execution continues through subsequent cases. This causes false type errors in state machines and parsers that rely on fallthrough behavior.",
      library: "typescript",
      version: "5.7.2",
      ecosystem: "node",
      severity: "medium",
      status: "open",
      tags: ["type-narrowing", "control-flow", "switch"],
      category: "types",
      reporterId: bob.id,
    },
  });

  // Create patches
  const patch1 = await prisma.patch.create({
    data: {
      description:
        "Use Prisma's `relationLoadStrategy: 'join'` option and limit include depth to 2 levels. For deeper nesting, use separate queries with explicit selects.",
      code: `// Instead of deeply nested includes:
const result = await prisma.post.findMany({
  relationLoadStrategy: 'join',
  include: {
    author: true,
    comments: {
      include: {
        author: true,
        // Don't nest further - use separate query
      }
    }
  }
});`,
      score: 3,
      bugId: bug1.id,
      submitterId: bob.id,
    },
  });

  const patch2 = await prisma.patch.create({
    data: {
      description:
        "Add an AbortController to the useEffect and check the signal before updating state. Use a ref to track the mounted state across strict mode re-renders.",
      code: `useEffect(() => {
  const controller = new AbortController();

  const connect = () => {
    const ws = new WebSocket(url);
    ws.onmessage = (e) => {
      if (!controller.signal.aborted) {
        setData(JSON.parse(e.data));
      }
    };
    controller.signal.addEventListener('abort', () => ws.close());
  };

  connect();
  return () => controller.abort();
}, [url]);`,
      score: 5,
      bugId: bug3.id,
      submitterId: carol.id,
    },
  });

  const patch3 = await prisma.patch.create({
    data: {
      description:
        "Set dynamicParams = true in the route segment config and ensure generateStaticParams doesn't return an exhaustive list. Use revalidate to control ISR timing.",
      code: `// app/posts/[slug]/page.tsx
export const dynamicParams = true;
export const revalidate = 60;

export async function generateStaticParams() {
  // Only pre-render the most popular posts
  const posts = await getTopPosts(50);
  return posts.map((post) => ({ slug: post.slug }));
}`,
      score: 1,
      bugId: bug2.id,
      submitterId: alice.id,
    },
  });

  // Create verifications
  await prisma.verification.create({
    data: {
      outcome: "fixed",
      note:
        "This fixed our production timeout issues. The relationLoadStrategy option is underrated.",
      testedVersion: "5.22.0",
      patchId: patch1.id,
      verifierId: alice.id,
    },
  });

  await prisma.verification.create({
    data: {
      outcome: "fixed",
      note: "Confirmed — query time dropped from 12s to 200ms with relationLoadStrategy: 'join'.",
      testedVersion: "5.22.0",
      patchId: patch1.id,
      verifierId: carol.id,
    },
  });

  await prisma.verification.create({
    data: {
      outcome: "fixed",
      note:
        "Clean solution using AbortController. Works correctly with strict mode double-mount.",
      testedVersion: "18.3.1",
      patchId: patch2.id,
      verifierId: bob.id,
    },
  });

  await prisma.verification.create({
    data: {
      outcome: "partial",
      note:
        "Works for new paths but existing cached paths still serve stale content until revalidate period.",
      testedVersion: "15.1.0",
      patchId: patch3.id,
      verifierId: carol.id,
    },
  });

  // Create patch accesses
  await prisma.patchAccess.create({
    data: { patchId: patch1.id, userId: alice.id },
  });
  await prisma.patchAccess.create({
    data: { patchId: patch1.id, userId: carol.id },
  });
  await prisma.patchAccess.create({
    data: { patchId: patch2.id, userId: bob.id },
  });

  console.log("Seed data created successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
