"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { ListItem } from "@/components/list-item";
import { currentUser, mockBugs, dashboardStats } from "@/lib/mock-data";
import { statusColor, formatDate } from "@/lib/helpers";

// Collect all patches across bugs
const mockPatches = mockBugs.flatMap((bug) =>
  (bug.patches ?? []).map((patch) => ({
    ...patch,
    bugTitle: bug.title,
  }))
);

// MCP endpoint
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const MCP_ENDPOINT = `${API_URL}/mcp`;

export default function ProfilePage() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(MCP_ENDPOINT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="profile" />

      {/* Compact user header */}
      <div className="flex items-center gap-4">
        <Avatar className="h-12 w-12 border-2 border-primary/40">
          <AvatarImage
            src={currentUser.avatarUrl ?? undefined}
            alt={currentUser.githubUsername}
          />
          <AvatarFallback className="font-mono text-sm">
            {currentUser.githubUsername.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h2 className="font-mono text-base font-semibold">
            {currentUser.githubUsername}
          </h2>
          <p className="text-xs text-muted-foreground">
            member since {formatDate(currentUser.createdAt)}
          </p>
        </div>
      </div>

      {/* Inline stats row */}
      <div className="flex items-baseline gap-8">
        <div>
          <span className="text-2xl font-bold font-mono">{currentUser.karma}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">karma</span>
        </div>
        <div>
          <span className="text-2xl font-bold font-mono">{dashboardStats.bugsReported}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">bugs</span>
        </div>
        <div>
          <span className="text-2xl font-bold font-mono">{dashboardStats.patchesSubmitted}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">patches</span>
        </div>
        <div>
          <span className="text-2xl font-bold font-mono">{dashboardStats.reviewsGiven}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">reviews</span>
        </div>
      </div>

      {/* Tabs -- underline style */}
      <Tabs defaultValue="bugs" className="w-full">
        <TabsList>
          <TabsTrigger value="bugs">my bugs</TabsTrigger>
          <TabsTrigger value="patches">my patches</TabsTrigger>
        </TabsList>

        <TabsContent value="bugs">
          <div className="rounded-lg border border-border">
            {mockBugs.map((bug) => (
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
                    {formatDate(bug.createdAt)}
                  </span>
                </ListItem>
              </Link>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="patches">
          <div className="rounded-lg border border-border">
            {mockPatches.map((patch) => (
              <Link key={patch.id} href={`/bugs/${patch.bugId}`}>
                <ListItem className="gap-3 cursor-pointer">
                  <span className="flex-1 truncate text-sm font-medium">
                    {patch.bugTitle}
                  </span>
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 font-mono text-xs tabular-nums"
                  >
                    +{patch.score}
                  </Badge>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(patch.createdAt)}
                  </span>
                </ListItem>
              </Link>
            ))}
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
