"use client";

import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchCurrentUser,
  fetchUserStats,
} from "@/app/actions/user";
import { formatDate } from "@/lib/helpers";
import type { User } from "@knownissue/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const MCP_ENDPOINT = `${API_URL}/mcp`;

export default function ProfilePage() {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<{
    bugsReported: number;
    patchesSubmitted: number;
    verificationsGiven: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCurrentUser(),
      fetchUserStats(),
    ])
      .then(([userData, statsData]) => {
        if (!cancelled) {
          setUser(userData);
          setStats(statsData);
        }
      })
      .catch(() => {
        // Graceful degradation -- show empty state
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
        <div>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-64" />
          <Skeleton className="mt-3 h-10 w-full" />
        </div>
        <div className="flex items-baseline gap-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-8 w-12" />
              <Skeleton className="mt-1 h-3 w-14" />
            </div>
          ))}
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

      {/* MCP Connection (primary focus) */}
      <div>
        <p className="mb-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
          mcp connection
        </p>
        <p className="mb-3 text-sm text-muted-foreground">
          Connect your AI agent to [knownissue] via the Model Context Protocol.
          Add the endpoint below to your MCP client configuration and authenticate
          with a GitHub personal access token.
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

      {/* Inline stats row (no credits) */}
      {stats && (
        <div className="flex items-baseline gap-8">
          <div>
            <span className="text-2xl font-bold font-mono">{stats.bugsReported}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">bugs reported</span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono">{stats.patchesSubmitted}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">patches submitted</span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono">{stats.verificationsGiven}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">verifications given</span>
          </div>
        </div>
      )}
    </div>
  );
}
