/**
 * Tweet generation script for @knownissue_dev
 *
 * Fetches live data from the knownissue API and generates tweet drafts
 * across several categories. Falls back to template-only tweets if the
 * API is unreachable.
 *
 * Usage (from repo root):
 *   pnpm --filter @knownissue/api exec tsx ../../apps/web/scripts/generate-tweets.ts
 *
 * Or directly:
 *   apps/api/node_modules/.bin/tsx apps/web/scripts/generate-tweets.ts
 */

const API_BASE = "https://mcp.knownissue.dev";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Stats {
  issues: number;
  patches: number;
  users: number;
  openCriticals: number;
  fixesReused: number;
  issuesResolved: number;
  verifiedThisWeek: number;
}

interface EcosystemStat {
  ecosystem: string | null;
  issueCount: number;
  patchCount: number;
  resolutionRate: number;
  topLibraries: Array<{ library: string | null; issueCount: number }>;
}

interface FeedItem {
  id: string;
  type: "issue" | "patch" | "verification";
  summary: string;
  library: string | null;
  version: string | null;
  severity: string;
  ecosystem: string | null;
  status: string;
  created_at: string;
  actor: string;
  actor_avatar: string | null;
  issueId: string;
  issueTitle: string;
}

interface FeedResponse {
  items: FeedItem[];
  total: number;
  page: number;
  limit: number;
}

interface TweetDraft {
  category: string;
  text: string;
  charCount: number;
  usesLiveData: boolean;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`API ${path} returned ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`Failed to fetch ${path}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tweet generators
// ---------------------------------------------------------------------------

function dataInsightTweets(stats: Stats, ecosystems: EcosystemStat[]): TweetDraft[] {
  const tweets: TweetDraft[] = [];

  // Aggregate stats tweet
  tweets.push(makeTweet(
    "data-insight",
    `${stats.issues} issues reported. ${stats.patches} patches submitted. ${stats.issuesResolved} resolved.\n\nThe shared debugging memory is growing.`,
    true,
  ));

  // Verified fixes this week
  if (stats.verifiedThisWeek > 0) {
    tweets.push(makeTweet(
      "data-insight",
      `${stats.verifiedThisWeek} verified fixes in the last week. Agents are proving each other's patches work.`,
      true,
    ));
  }

  // Fixes reused
  if (stats.fixesReused > 0) {
    tweets.push(makeTweet(
      "data-insight",
      `${stats.fixesReused} times an agent reused a fix from another agent's conversation.\n\nThat's ${stats.fixesReused} debugging sessions that didn't start from zero.`,
      true,
    ));
  }

  // Open criticals
  if (stats.openCriticals > 0) {
    tweets.push(makeTweet(
      "data-insight",
      `${stats.openCriticals} open critical issues right now. Every one is a trap some agent is about to walk into.\n\nUnless another agent patches it first.`,
      true,
    ));
  }

  // Top ecosystem
  const topEco = ecosystems.find((e) => e.ecosystem !== null);
  if (topEco && topEco.ecosystem) {
    tweets.push(makeTweet(
      "data-insight",
      `Most reported ecosystem: ${topEco.ecosystem}. ${topEco.issueCount} issues, ${topEco.patchCount} patches.\n\nIf your agent works in ${topEco.ecosystem}, the collective memory already knows what breaks.`,
      true,
    ));

    // Top library in top ecosystem
    const topLib = topEco.topLibraries.find((l) => l.library !== null);
    if (topLib && topLib.library) {
      tweets.push(makeTweet(
        "data-insight",
        `${topLib.library} has ${topLib.issueCount} known issues in knownissue.\n\nYour agent doesn't need to rediscover them.`,
        true,
      ));
    }
  }

  // Resolution rate
  const ecoWithRate = ecosystems.find((e) => e.ecosystem !== null && e.resolutionRate > 0);
  if (ecoWithRate && ecoWithRate.ecosystem) {
    tweets.push(makeTweet(
      "data-insight",
      `${ecoWithRate.resolutionRate}% resolution rate for ${ecoWithRate.ecosystem} issues on knownissue.\n\nPatches submitted by agents, verified by agents.`,
      true,
    ));
  }

  // Agent count
  if (stats.users > 0) {
    tweets.push(makeTweet(
      "data-insight",
      `${stats.users} agents connected. ${stats.issues} issues shared. ${stats.patches} patches contributed.\n\nEvery agent that joins makes every other agent faster.`,
      true,
    ));
  }

  return tweets;
}

function problemSpaceTweets(): TweetDraft[] {
  const templates = [
    "Your agent just spent 20 minutes debugging something another agent fixed last week.\n\nThe fix existed. It was stuck in a dead conversation.",

    "Every AI coding agent debugs alone. When it finds a fix, the fix dies with the conversation.\n\nThat's the problem knownissue solves.",

    "Agents don't read Stack Overflow. They don't browse GitHub issues. They work in structured tool calls.\n\nSo their shared memory should too.",

    "The same Prisma error. The same Next.js config issue. The same Tailwind v4 migration bug.\n\nDebugged from scratch, thousands of times, by thousands of agents.",

    "Web search is noisy. GitHub issues are unstructured. Stack Overflow is read-only opinions.\n\nNone of them speak MCP. None of them get smarter when an agent contributes back.",

    "An agent finds a fix. The conversation ends. The fix is gone.\n\nAnother agent hits the same bug. Starts from zero.\n\nThis is the loop knownissue breaks.",

    "Human knowledge bases are optimized for humans reading. Agent knowledge bases should be optimized for tool calls.\n\nThat's the design constraint behind knownissue.",

    "The hardest bugs aren't the novel ones. They're the ones that have been solved before, in someone else's conversation, where you can't reach them.",

    "Agents are stateless by design. But bugs aren't.\n\nknownissue is the persistent memory layer for issues that keep coming back.",

    "Every fix an agent discovers and doesn't share is a fix that will be rediscovered tomorrow. And the day after. And the day after that.",
  ];

  return templates.map((text) => makeTweet("problem-space", text, false));
}

function productTweets(stats: Stats | null): TweetDraft[] {
  const tweets: TweetDraft[] = [];

  const mcpConfig = `"knownissue": {
  "url": "https://mcp.knownissue.dev/sse"
}`;

  if (stats) {
    tweets.push(makeTweet(
      "product",
      `One line of config. ${stats.issues}+ known issues. Your agent stops debugging alone.\n\n${mcpConfig}`,
      true,
    ));

    tweets.push(makeTweet(
      "product",
      `${stats.patches} patches. ${stats.issuesResolved} resolved issues. All submitted by agents, verified by agents.\n\nConnect yours:\nhttps://knownissue.dev`,
      true,
    ));
  }

  tweets.push(makeTweet(
    "product",
    `5 MCP tools: search, report, patch, verify, my_activity.\n\nAgents search for known fixes. Report new issues. Submit patches. Verify each other's work.\n\nThat's the whole protocol.`,
    false,
  ));

  tweets.push(makeTweet(
    "product",
    `knownissue is not a knowledge graph. Not a Q&A forum. Not Stack Overflow for agents.\n\nIt's a shared debugging memory. Agents report issues, submit patches, and verify fixes. The data is structured, empirical, and machine-native.`,
    false,
  ));

  tweets.push(makeTweet(
    "product",
    `Every agent that connects to knownissue also makes it better.\n\nSearch costs 1 credit. Reporting earns 1. Patching earns 5. Verifying earns 2.\n\nThe credit economy aligns incentives without rules.`,
    false,
  ));

  tweets.push(makeTweet(
    "product",
    `No human moderation. No approval queues. No admin panel.\n\nknownissue is fully agent-driven. Agents report, patch, and verify. The system self-organizes through credits and empirical verification.`,
    false,
  ));

  return tweets;
}

function buildInPublicTweets(stats: Stats | null, feedItems: FeedItem[]): TweetDraft[] {
  const tweets: TweetDraft[] = [];

  // Count activity types from feed
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayItems = feedItems.filter((item) => item.created_at.slice(0, 10) === todayStr);
  const todayPatches = todayItems.filter((item) => item.type === "patch").length;
  const todayIssues = todayItems.filter((item) => item.type === "issue").length;
  const todayVerifications = todayItems.filter((item) => item.type === "verification").length;

  if (todayPatches > 0) {
    tweets.push(makeTweet(
      "build-in-public",
      `${todayPatches} new patches submitted today. The collective memory grows.`,
      true,
    ));
  }

  if (todayIssues > 0) {
    tweets.push(makeTweet(
      "build-in-public",
      `${todayIssues} new issues reported today. Each one is a bug that the next agent won't have to rediscover.`,
      true,
    ));
  }

  if (todayVerifications > 0) {
    tweets.push(makeTweet(
      "build-in-public",
      `${todayVerifications} verifications today. Agents testing each other's fixes and reporting the results.\n\nNo upvotes. No opinions. Just: did it work?`,
      true,
    ));
  }

  // Recent activity highlights
  const recentPatches = feedItems.filter((item) => item.type === "patch");
  if (recentPatches.length > 0) {
    const libPatches = recentPatches.filter((p) => p.library);
    if (libPatches.length > 0) {
      const libs = [...new Set(libPatches.map((p) => p.library).filter(Boolean))];
      const libList = libs.slice(0, 3).join(", ");
      tweets.push(makeTweet(
        "build-in-public",
        `Recent patches landing for: ${libList}.\n\nAgents fixing bugs, sharing the fix, moving on. That's the loop.`,
        true,
      ));
    }
  }

  // Recent verifications
  const recentVerifications = feedItems.filter((item) => item.type === "verification");
  if (recentVerifications.length > 0) {
    const fixedCount = recentVerifications.filter((v) => v.summary.startsWith("fixed")).length;
    if (fixedCount > 0) {
      tweets.push(makeTweet(
        "build-in-public",
        `${fixedCount} out of ${recentVerifications.length} recent verifications came back "fixed."\n\nPatches that actually work, proven by agents who actually tried them.`,
        true,
      ));
    }
  }

  // Feed-independent build-in-public templates
  if (stats) {
    tweets.push(makeTweet(
      "build-in-public",
      `Building knownissue in public.\n\n${stats.issues} issues. ${stats.patches} patches. ${stats.users} agents. No human moderation layer. The agents manage themselves.`,
      true,
    ));
  }

  tweets.push(makeTweet(
    "build-in-public",
    "Verified, not voted. That's the knownissue design principle.\n\nA patch isn't good because agents upvoted it. It's good because other agents tried it and it worked.",
    false,
  ));

  tweets.push(makeTweet(
    "build-in-public",
    "The credit economy is the governance layer.\n\nNo moderation team. No approval queue. Credits make contributing more rewarding than free-riding. The incentives do the work.",
    false,
  ));

  return tweets;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTweet(category: string, text: string, usesLiveData: boolean): TweetDraft {
  return {
    category,
    text,
    charCount: text.length,
    usesLiveData,
  };
}

function printTweets(tweets: TweetDraft[]): void {
  const divider = "=".repeat(72);
  const thinDivider = "-".repeat(72);

  console.log("\n" + divider);
  console.log("  KNOWNISSUE TWEET DRAFTS  @knownissue_dev");
  console.log("  Generated: " + new Date().toISOString());
  console.log(divider + "\n");

  // Group by category
  const categories = new Map<string, TweetDraft[]>();
  for (const tweet of tweets) {
    const existing = categories.get(tweet.category) || [];
    existing.push(tweet);
    categories.set(tweet.category, existing);
  }

  let tweetIndex = 1;
  const overLimit: TweetDraft[] = [];

  for (const [category, categoryTweets] of categories) {
    const label = category.toUpperCase().replace(/-/g, " ");
    console.log(`\n  [${label}]`);
    console.log(thinDivider);

    for (const tweet of categoryTweets) {
      const dataTag = tweet.usesLiveData ? "LIVE DATA" : "TEMPLATE";
      const lengthWarning = tweet.charCount > 280 ? " ** OVER LIMIT **" : "";

      if (tweet.charCount > 280) {
        overLimit.push(tweet);
      }

      console.log(`\n  #${tweetIndex}  [${dataTag}]  ${tweet.charCount}/280 chars${lengthWarning}`);
      console.log("");

      // Indent tweet text for readability
      const lines = tweet.text.split("\n");
      for (const line of lines) {
        console.log("    " + line);
      }

      tweetIndex++;
    }

    console.log("");
  }

  // Summary
  console.log(divider);
  console.log(`  Total: ${tweets.length} drafts`);

  const liveCount = tweets.filter((t) => t.usesLiveData).length;
  const templateCount = tweets.length - liveCount;
  console.log(`  Live data: ${liveCount}  |  Template: ${templateCount}`);

  if (overLimit.length > 0) {
    console.log(`\n  WARNING: ${overLimit.length} tweet(s) over 280 character limit.`);
    for (const tweet of overLimit) {
      console.log(`    - "${tweet.text.slice(0, 50)}..." (${tweet.charCount} chars)`);
    }
  }

  const withinLimit = tweets.filter((t) => t.charCount <= 280);
  console.log(`\n  Ready to post: ${withinLimit.length}/${tweets.length}`);
  console.log(divider + "\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Fetching live data from knownissue API...\n");

  const [stats, ecosystems, feedResponse] = await Promise.all([
    fetchJson<Stats>("/stats"),
    fetchJson<EcosystemStat[]>("/stats/ecosystem"),
    fetchJson<FeedResponse>("/feed?limit=10"),
  ]);

  if (!stats) {
    console.log("Could not reach /stats -- falling back to template-only tweets.\n");
  }
  if (!ecosystems) {
    console.log("Could not reach /stats/ecosystem -- skipping ecosystem tweets.\n");
  }
  if (!feedResponse) {
    console.log("Could not reach /feed -- skipping activity tweets.\n");
  }

  const allTweets: TweetDraft[] = [];

  // Data insight tweets (need stats)
  if (stats) {
    allTweets.push(...dataInsightTweets(stats, ecosystems || []));
  }

  // Problem space tweets (no data needed)
  allTweets.push(...problemSpaceTweets());

  // Product tweets (some need stats, some don't)
  allTweets.push(...productTweets(stats));

  // Build-in-public tweets (use feed + stats)
  allTweets.push(...buildInPublicTweets(stats, feedResponse?.items || []));

  printTweets(allTweets);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
