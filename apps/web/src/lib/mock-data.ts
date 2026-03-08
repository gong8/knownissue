import type { Bug, Patch, Review, User } from "@knownissue/shared";

// ── Mock Users ──────────────────────────────────────────────────────────────

export const currentUser: User = {
  id: "usr_001",
  githubUsername: "janedoe",
  clerkId: "clerk_001",
  avatarUrl: "https://api.dicebear.com/9.x/thumbs/svg?seed=jane",
  karma: 142,
  createdAt: new Date("2025-09-15"),
  updatedAt: new Date("2026-03-01"),
};

const userAlice: User = {
  id: "usr_002",
  githubUsername: "alice-ml",
  clerkId: "clerk_002",
  avatarUrl: "https://api.dicebear.com/9.x/thumbs/svg?seed=alice",
  karma: 87,
  createdAt: new Date("2025-10-02"),
  updatedAt: new Date("2026-02-20"),
};

const userBob: User = {
  id: "usr_003",
  githubUsername: "bobbuilds",
  clerkId: "clerk_003",
  avatarUrl: "https://api.dicebear.com/9.x/thumbs/svg?seed=bob",
  karma: 214,
  createdAt: new Date("2025-08-10"),
  updatedAt: new Date("2026-03-05"),
};

const userCarla: User = {
  id: "usr_004",
  githubUsername: "carla-rust",
  clerkId: "clerk_004",
  avatarUrl: "https://api.dicebear.com/9.x/thumbs/svg?seed=carla",
  karma: 63,
  createdAt: new Date("2025-11-18"),
  updatedAt: new Date("2026-02-28"),
};

const userDan: User = {
  id: "usr_005",
  githubUsername: "dan-ops",
  clerkId: "clerk_005",
  avatarUrl: "https://api.dicebear.com/9.x/thumbs/svg?seed=dan",
  karma: 31,
  createdAt: new Date("2026-01-05"),
  updatedAt: new Date("2026-03-06"),
};

// ── Mock Reviews ────────────────────────────────────────────────────────────

const reviews: Review[] = [
  {
    id: "rev_001",
    vote: "up",
    comment: "Clean fix, verified this resolves the memory leak in production.",
    patchId: "pat_001",
    reviewerId: userAlice.id,
    reviewer: userAlice,
    createdAt: new Date("2026-03-05T14:22:00Z"),
    updatedAt: new Date("2026-03-05T14:22:00Z"),
  },
  {
    id: "rev_002",
    vote: "up",
    comment: "Works for me on Node 22. Good catch on the cleanup handler.",
    patchId: "pat_001",
    reviewerId: userDan.id,
    reviewer: userDan,
    createdAt: new Date("2026-03-06T09:10:00Z"),
    updatedAt: new Date("2026-03-06T09:10:00Z"),
  },
  {
    id: "rev_003",
    vote: "down",
    comment:
      "This only masks the issue. The root cause is the event listener not being removed on unmount.",
    patchId: "pat_002",
    reviewerId: userBob.id,
    reviewer: userBob,
    createdAt: new Date("2026-03-06T11:45:00Z"),
    updatedAt: new Date("2026-03-06T11:45:00Z"),
  },
  {
    id: "rev_004",
    vote: "up",
    comment: null,
    patchId: "pat_002",
    reviewerId: userCarla.id,
    reviewer: userCarla,
    createdAt: new Date("2026-03-07T08:30:00Z"),
    updatedAt: new Date("2026-03-07T08:30:00Z"),
  },
];

// ── Mock Patches ────────────────────────────────────────────────────────────

const patches: Patch[] = [
  {
    id: "pat_001",
    description:
      "Add proper cleanup of the AbortController in useEffect to prevent memory leak when the component unmounts during an in-flight request.",
    code: `// Before (leaks):
useEffect(() => {
  fetch('/api/data')
    .then(res => res.json())
    .then(setData);
}, []);

// After (fixed):
useEffect(() => {
  const controller = new AbortController();
  fetch('/api/data', { signal: controller.signal })
    .then(res => res.json())
    .then(setData)
    .catch(err => {
      if (err.name !== 'AbortError') throw err;
    });
  return () => controller.abort();
}, []);`,
    score: 12,
    bugId: "bug_001",
    submitterId: userBob.id,
    submitter: userBob,
    reviews: [reviews[0], reviews[1]],
    createdAt: new Date("2026-03-04T18:30:00Z"),
    updatedAt: new Date("2026-03-06T09:10:00Z"),
  },
  {
    id: "pat_002",
    description:
      "Wrap the fetch call with a mounted flag to skip state updates after unmount.",
    code: `useEffect(() => {
  let mounted = true;
  fetch('/api/data')
    .then(res => res.json())
    .then(data => {
      if (mounted) setData(data);
    });
  return () => { mounted = false; };
}, []);`,
    score: 3,
    bugId: "bug_001",
    submitterId: userCarla.id,
    submitter: userCarla,
    reviews: [reviews[2], reviews[3]],
    createdAt: new Date("2026-03-05T10:15:00Z"),
    updatedAt: new Date("2026-03-07T08:30:00Z"),
  },
];

// ── Mock Bugs ───────────────────────────────────────────────────────────────

export const mockBugs: Bug[] = [
  {
    id: "bug_001",
    title: "Memory leak in useEffect cleanup when using fetch with React 19",
    description:
      "When using fetch inside a useEffect hook in React 19, unmounting the component before the request completes causes a memory leak. The AbortController pattern from React 18 no longer works correctly with the new compiler optimizations. This affects any component that makes API calls in useEffect and can be unmounted before the response arrives.\n\nReproduction steps:\n1. Create a component that fetches data in useEffect\n2. Mount and quickly unmount it in rapid succession\n3. Observe memory growth in DevTools heap snapshot\n\nExpected: Memory should be freed when the component unmounts.\nActual: Closures from the fetch promise chain keep references alive.",
    library: "react",
    version: "19.0.0",
    ecosystem: "node",
    severity: "critical",
    status: "confirmed",
    tags: ["memory-leak", "hooks", "useEffect"],
    embedding: null,
    reporterId: userAlice.id,
    reporter: userAlice,
    patches: patches,
    createdAt: new Date("2026-03-03T12:00:00Z"),
    updatedAt: new Date("2026-03-07T08:30:00Z"),
  },
  {
    id: "bug_002",
    title: "langchain ConversationBufferMemory drops system message after 4096 tokens",
    description:
      "When using ConversationBufferMemory with ChatOpenAI, the system message is silently dropped once the conversation exceeds 4096 tokens. This causes the LLM to lose its persona and instructions mid-conversation.",
    library: "langchain",
    version: "0.3.14",
    ecosystem: "python",
    severity: "high",
    status: "open",
    tags: ["memory", "truncation", "system-prompt"],
    embedding: null,
    reporterId: userBob.id,
    reporter: userBob,
    patches: [],
    createdAt: new Date("2026-03-05T09:30:00Z"),
    updatedAt: new Date("2026-03-05T09:30:00Z"),
  },
  {
    id: "bug_003",
    title: "Prisma Client fails silently on BigInt columns with PostgreSQL 16",
    description:
      "Prisma Client returns null for BigInt columns when using PostgreSQL 16 with the new extended query protocol. No error is thrown, leading to data corruption downstream.",
    library: "prisma",
    version: "6.3.0",
    ecosystem: "node",
    severity: "high",
    status: "patched",
    tags: ["database", "bigint", "silent-failure"],
    embedding: null,
    reporterId: currentUser.id,
    reporter: currentUser,
    patches: [],
    createdAt: new Date("2026-02-28T16:45:00Z"),
    updatedAt: new Date("2026-03-06T11:00:00Z"),
  },
  {
    id: "bug_004",
    title: "tiktoken encoding mismatch for cl100k_base with special tokens",
    description:
      "When encoding strings containing special tokens like <|endoftext|>, tiktoken returns different token IDs compared to the OpenAI API tokenizer. This causes token count mismatches and unexpected API billing.",
    library: "tiktoken",
    version: "0.8.0",
    ecosystem: "python",
    severity: "medium",
    status: "open",
    tags: ["tokenizer", "encoding", "openai"],
    embedding: null,
    reporterId: userCarla.id,
    reporter: userCarla,
    patches: [],
    createdAt: new Date("2026-03-01T08:20:00Z"),
    updatedAt: new Date("2026-03-01T08:20:00Z"),
  },
  {
    id: "bug_005",
    title: "Axum panics on concurrent WebSocket connections with Tower middleware",
    description:
      "Using axum 0.8 with tower-http's CorsLayer and more than 64 concurrent WebSocket connections causes a panic in the hyper connection pool. The error is 'called Option::unwrap() on a None value' in the connection upgrade handler.",
    library: "axum",
    version: "0.8.1",
    ecosystem: "rust",
    severity: "critical",
    status: "open",
    tags: ["websocket", "panic", "concurrency"],
    embedding: null,
    reporterId: userDan.id,
    reporter: userDan,
    patches: [],
    createdAt: new Date("2026-03-07T22:10:00Z"),
    updatedAt: new Date("2026-03-07T22:10:00Z"),
  },
  {
    id: "bug_006",
    title: "go-chi middleware chain loses request context after r.WithContext",
    description:
      "When using chi.Router with a custom middleware that calls r.WithContext, downstream handlers receive the original context instead of the new one. This breaks deadline propagation and tracing.",
    library: "go-chi",
    version: "5.2.0",
    ecosystem: "go",
    severity: "low",
    status: "confirmed",
    tags: ["context", "middleware", "router"],
    embedding: null,
    reporterId: userAlice.id,
    reporter: userAlice,
    patches: [],
    createdAt: new Date("2026-02-20T14:00:00Z"),
    updatedAt: new Date("2026-03-02T10:30:00Z"),
  },
];

// ── Dashboard Stats ─────────────────────────────────────────────────────────

export const dashboardStats = {
  karma: currentUser.karma,
  bugsReported: 8,
  patchesSubmitted: 14,
  reviewsGiven: 23,
};

// ── Helper to get a single bug by ID ────────────────────────────────────────

export function getMockBugById(id: string): Bug | undefined {
  return mockBugs.find((b) => b.id === id);
}
