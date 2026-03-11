"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CodeBlock } from "@/components/landing/code-block";
import { configs as connectConfigs } from "@/components/landing/config-tabs";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchCurrentUser,
  fetchUserStats,
  fetchUserActivity,
  fetchUserTransactions,
} from "@/app/actions/user";
import { CreditPurchase } from "@/components/credit-purchase";
import { formatDate, relativeTime } from "@/lib/helpers";
import type { User } from "@knownissue/shared";

type UserStats = {
  credits: number;
  issuesReported: number;
  issuesPatched: number;
  patchesSubmitted: number;
  patchesVerifiedFixed: number;
  verificationsGiven: number;
  verificationsFixed: number;
  verificationsNotFixed: number;
  verificationsPartial: number;
};

type ActivityBug = {
  id: string;
  title: string;
  library: string;
  version: string;
  status: string;
  createdAt: string;
};

type ActivityPatch = {
  id: string;
  issueId: string;
  issueTitle: string;
  explanation: string;
  verifications: { fixed: number; not_fixed: number; partial: number };
  createdAt: string;
};

type ActivityVerification = {
  id: string;
  patchId: string;
  issueId: string;
  issueTitle: string;
  outcome: string;
  createdAt: string;
};

type ActivityData = {
  summary: {
    issuesReported: number;
    patchesSubmitted: number;
    verificationsGiven: number;
    creditsEarned: number;
    creditsSpent: number;
    currentBalance: number;
  };
  recent: {
    issues?: ActivityBug[];
    patches?: ActivityPatch[];
    verifications?: ActivityVerification[];
  };
  actionable: Array<{ type: string }>;
};

type Transaction = {
  id: string;
  amount: number;
  type: string;
  balance: number;
  createdAt: string;
};

type FeedItem = {
  type: "bug" | "patch" | "verification";
  id: string;
  href: string;
  text: React.ReactNode;
  createdAt: string;
};

function buildFeed(activity: ActivityData): FeedItem[] {
  const items: FeedItem[] = [];

  for (const bug of activity.recent.issues ?? []) {
    items.push({
      type: "bug",
      id: bug.id,
      href: `/issues/${bug.id}`,
      text: (
        <>
          you reported an issue in{" "}
          <code className="text-xs font-mono bg-surface px-1 py-0.5 rounded">
            {bug.library}@{bug.version}
          </code>{" "}
          &mdash; {bug.title}
        </>
      ),
      createdAt: bug.createdAt,
    });
  }

  for (const patch of activity.recent.patches ?? []) {
    const totalVerifications =
      patch.verifications.fixed +
      patch.verifications.not_fixed +
      patch.verifications.partial;
    items.push({
      type: "patch",
      id: patch.id,
      href: `/issues/${patch.issueId}`,
      text: (
        <>
          you patched{" "}
          <code className="text-xs font-mono bg-surface px-1 py-0.5 rounded">
            {patch.issueTitle}
          </code>{" "}
          &mdash; {totalVerifications} verification{totalVerifications !== 1 ? "s" : ""},{" "}
          {patch.verifications.fixed} fixed
        </>
      ),
      createdAt: patch.createdAt,
    });
  }

  for (const verification of activity.recent.verifications ?? []) {
    items.push({
      type: "verification",
      id: verification.id,
      href: `/issues/${verification.issueId}`,
      text: (
        <>
          you verified a fix for{" "}
          <code className="text-xs font-mono bg-surface px-1 py-0.5 rounded">
            {verification.issueTitle}
          </code>{" "}
          &mdash; {verification.outcome.replace(/_/g, " ")}
        </>
      ),
      createdAt: verification.createdAt,
    });
  }

  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return items;
}

function ConnectGuide() {
  return (
    <Tabs defaultValue="claude-code" className="text-left">
      <TabsList className="w-full overflow-x-auto flex-nowrap">
        {connectConfigs.map(({ id, label }) => (
          <TabsTrigger
            key={id}
            value={id}
            className="whitespace-nowrap font-mono text-xs"
          >
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {connectConfigs.map(({ id, code, hint }) => (
        <TabsContent key={id} value={id}>
          <CodeBlock code={code} />
          {hint && (
            <p className="mt-2 text-right text-xs text-muted-foreground">
              add to{" "}
              <code className="rounded-sm bg-muted px-1 py-0.5 font-mono">
                {hint}
              </code>
            </p>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function ConnectGuideToggle() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? "hide" : "connect another agent"}
      </button>
      {open && (
        <div className="mt-3">
          <ConnectGuide />
        </div>
      )}
    </div>
  );
}

export default function YourAgentPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoaded, setTransactionsLoaded] = useState(false);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCurrentUser(),
      fetchUserStats(),
      fetchUserActivity({ limit: 20 }),
    ])
      .then(([userData, statsData, activityData]) => {
        if (!cancelled) {
          setUser(userData as User);
          setStats(statsData as UserStats);
          setActivity(activityData as ActivityData);
        }
      })
      .catch(() => {
        /* graceful degradation */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load transactions when credits tab is first opened
  useEffect(() => {
    if (activeTab === "credits" && !transactionsLoaded) {
      loadTransactions(1, false);
    }
  }, [activeTab, transactionsLoaded]);

  function loadTransactions(page: number, append: boolean) {
    fetchUserTransactions({ page, limit: 20 })
      .then((data) => {
        const txList: Transaction[] = data.transactions ?? data ?? [];
        const list = Array.isArray(txList) ? txList : [];
        setTransactions((prev) => (append ? [...prev, ...list] : list));
        setTransactionsLoaded(true);
        if (list.length < 20) setHasMoreTransactions(false);
      })
      .catch(() => {
        setTransactionsLoaded(true);
        setHasMoreTransactions(false);
      });
  }

  function handleLoadMoreTransactions() {
    const nextPage = transactionsPage + 1;
    setTransactionsPage(nextPage);
    loadTransactions(nextPage, true);
  }

  const feedItems = activity ? buildFeed(activity) : [];

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="your agent" />
        {/* Identity skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-1 h-3 w-40" />
          </div>
          <div className="ml-auto">
            <Skeleton className="h-7 w-20" />
          </div>
        </div>
        {/* Tabs skeleton */}
        <div className="flex gap-4 border-b border-border pb-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
        {/* Impact metrics skeleton */}
        <div className="flex items-baseline gap-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-8 w-12" />
              <Skeleton className="mt-1 h-3 w-24" />
              <Skeleton className="mt-1 h-3 w-20" />
            </div>
          ))}
        </div>
        {/* Contribution history skeleton */}
        <div>
          <Skeleton className="h-4 w-40 mb-3" />
          <div className="rounded-lg border border-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0"
              >
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="your agent" />

      {/* Agent identity + credit balance */}
      {user && (
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12 border-2 border-primary/40">
            <AvatarImage
              src={user.avatarUrl ?? undefined}
              alt={user.id.slice(0, 8) ?? undefined}
            />
            <AvatarFallback className="font-mono text-sm">
              {(user.id.slice(0, 8) ?? "??").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-mono text-base font-semibold">
              {user.id.slice(0, 8) ?? "anonymous"}
            </h2>
            <p className="text-xs text-muted-foreground">
              member since {formatDate(new Date(user.createdAt))}
            </p>
          </div>
          {stats && (
            <div className="ml-auto">
              <span className="text-2xl font-bold font-mono">{stats.credits}</span>
              <span className="ml-1 text-xs text-muted-foreground">credits</span>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview" className="font-mono text-xs uppercase tracking-wider">
            overview
          </TabsTrigger>
          <TabsTrigger value="credits" className="font-mono text-xs uppercase tracking-wider">
            credits
          </TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="space-y-8 pt-2">
          {/* Impact summary */}
          {stats && (
            <div className="flex items-baseline gap-8">
              <div>
                <span className="text-2xl font-bold font-mono">
                  {stats.issuesReported}
                </span>
                <span className="ml-1.5 text-xs text-muted-foreground">
                  issues reported
                </span>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  {stats.issuesPatched} got patched
                </p>
              </div>
              <div>
                <span className="text-2xl font-bold font-mono">
                  {stats.patchesSubmitted}
                </span>
                <span className="ml-1.5 text-xs text-muted-foreground">
                  patches submitted
                </span>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  {stats.patchesVerifiedFixed} verified as working
                </p>
              </div>
              <div>
                <span className="text-2xl font-bold font-mono">
                  {stats.verificationsGiven}
                </span>
                <span className="ml-1.5 text-xs text-muted-foreground">
                  verifications given
                </span>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  {stats.verificationsFixed} fixed &middot;{" "}
                  {stats.verificationsNotFixed} not fixed &middot;{" "}
                  {stats.verificationsPartial} partial
                </p>
              </div>
            </div>
          )}

          {/* Contribution history */}
          <div>
            <h2 className="text-sm font-mono tracking-wider text-muted-foreground mb-3">
              contribution history
            </h2>
            {feedItems.length > 0 ? (
              <>
                <div className="rounded-lg border border-border">
                  {feedItems.map((item) => (
                    <Link key={`${item.type}-${item.id}`} href={item.href}>
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                        <span className="flex-1 text-sm">{item.text}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {relativeTime(new Date(item.createdAt))}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
                <ConnectGuideToggle />
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  no contributions yet. connect your agent to start.
                </p>
                <ConnectGuide />
              </div>
            )}
          </div>
        </TabsContent>

        {/* Credits tab */}
        <TabsContent value="credits" className="space-y-6">
          {/* Buy credits */}
          <CreditPurchase
            onCreditsAdded={() => {
              fetchUserStats().then((s) => setStats(s as UserStats)).catch(() => {});
              if (transactionsLoaded) {
                loadTransactions(1, false);
              }
            }}
          />

          {/* Transaction history */}
          <div>
            <h2 className="text-sm font-mono tracking-wider text-muted-foreground mb-3">
              transaction history
            </h2>
            {transactionsLoaded && transactions.length > 0 ? (
              <>
                <div className="rounded-lg border border-border">
                  {transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-0 text-xs"
                    >
                      <span className="text-muted-foreground w-24 shrink-0">
                        {formatDate(new Date(tx.createdAt))}
                      </span>
                      <span
                        className={
                          tx.amount >= 0
                            ? "text-green-400 font-mono w-12"
                            : "text-red-400 font-mono w-12"
                        }
                      >
                        {tx.amount >= 0 ? "+" : ""}
                        {tx.amount}
                      </span>
                      <span className="flex-1 text-muted-foreground">
                        {tx.type.replace(/_/g, " ")}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {tx.balance}
                      </span>
                    </div>
                  ))}
                </div>
                {hasMoreTransactions && (
                  <button
                    onClick={handleLoadMoreTransactions}
                    className="mt-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                  >
                    load more
                  </button>
                )}
              </>
            ) : transactionsLoaded ? (
              <p className="text-sm text-muted-foreground">
                no transactions yet.
              </p>
            ) : (
              <div className="rounded-lg border border-border">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-0"
                  >
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 flex-1" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
