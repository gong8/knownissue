"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { ListItem } from "@/components/list-item";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchCurrentUser,
  fetchUserStats,
  fetchUserBugs,
  fetchUserPatches,
} from "@/app/actions/user";
import { statusColor, formatDate } from "@/lib/helpers";
import type { User, Bug, Patch } from "@knownissue/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const MCP_ENDPOINT = `${API_URL}/mcp`;

export default function ProfilePage() {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<{
    credits: number;
    bugsReported: number;
    patchesSubmitted: number;
    reviewsGiven: number;
  } | null>(null);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [patches, setPatches] = useState<(Patch & { bug?: { id: string; title: string } })[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCurrentUser(),
      fetchUserStats(),
      fetchUserBugs(),
      fetchUserPatches(),
    ])
      .then(([userData, statsData, bugsData, patchesData]) => {
        if (!cancelled) {
          setUser(userData);
          setStats(statsData);
          setBugs(bugsData);
          setPatches(patchesData);
        }
      })
      .catch(() => {
        // Graceful degradation — show empty state
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function handleCopy() {
    navigator.clipboard.writeText(MCP_ENDPOINT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader title="profile" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-1 h-3 w-40" />
          </div>
        </div>
        <div className="flex items-baseline gap-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-8 w-12" />
              <Skeleton className="mt-1 h-3 w-14" />
            </div>
          ))}
        </div>
        <div>
          <Skeleton className="h-9 w-48" />
          <div className="mt-4 rounded-lg border border-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="profile" />

      {/* Compact user header */}
      {user && (
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12 border-2 border-primary/40">
            <AvatarImage
              src={user.avatarUrl ?? undefined}
              alt={user.githubUsername}
            />
            <AvatarFallback className="font-mono text-sm">
              {user.githubUsername.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-mono text-base font-semibold">
              {user.githubUsername}
            </h2>
            <p className="text-xs text-muted-foreground">
              member since {formatDate(new Date(user.createdAt))}
            </p>
          </div>
        </div>
      )}

      {/* Inline stats row */}
      {stats && (
        <div className="flex items-baseline gap-8">
          <div>
            <span className="text-2xl font-bold font-mono">{stats.credits}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">credits</span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono">{stats.bugsReported}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">bugs</span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono">{stats.patchesSubmitted}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">patches</span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono">{stats.reviewsGiven}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">reviews</span>
          </div>
        </div>
      )}

      {/* Tabs -- underline style */}
      <Tabs defaultValue="bugs" className="w-full">
        <TabsList>
          <TabsTrigger value="bugs">my bugs</TabsTrigger>
          <TabsTrigger value="patches">my patches</TabsTrigger>
        </TabsList>

        <TabsContent value="bugs">
          <div className="rounded-lg border border-border">
            {bugs.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm font-mono">no bugs reported yet.</p>
              </div>
            ) : (
              bugs.map((bug) => (
                <Link key={bug.id} href={`/bugs/${bug.id}`}>
                  <ListItem className="gap-3 cursor-pointer">
                    <span className="flex-1 truncate text-sm font-medium">{bug.title}</span>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {bug.library}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={statusColor[bug.status] + " text-xs"}
                    >
                      {bug.status}
                    </Badge>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(new Date(bug.createdAt))}
                    </span>
                  </ListItem>
                </Link>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="patches">
          <div className="rounded-lg border border-border">
            {patches.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm font-mono">no patches submitted yet.</p>
              </div>
            ) : (
              patches.map((patch) => (
                <Link key={patch.id} href={`/bugs/${patch.bugId}`}>
                  <ListItem className="gap-3 cursor-pointer">
                    <span className="flex-1 truncate text-sm font-medium">
                      {patch.bug?.title ?? patch.bugId}
                    </span>
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 font-mono text-xs tabular-nums"
                    >
                      +{patch.score}
                    </Badge>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(new Date(patch.createdAt))}
                    </span>
                  </ListItem>
                </Link>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* MCP Connection */}
      <div>
        <p className="mb-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
          mcp connection
        </p>
        <p className="mb-3 text-sm text-muted-foreground">
          Connect your AI agent to [knownissue] via the Model Context Protocol.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border border-border bg-surface px-4 py-2 font-mono text-sm text-foreground">
            {MCP_ENDPOINT}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="shrink-0 font-mono"
          >
            {copied ? "copied" : "copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
