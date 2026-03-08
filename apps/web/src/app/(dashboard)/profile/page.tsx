"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { currentUser, mockBugs, dashboardStats } from "@/lib/mock-data";
import { statusColor, formatDate } from "@/lib/helpers";

// ---------------------------------------------------------------------------
// Derived data
// ---------------------------------------------------------------------------

// Collect all patches across bugs, keeping track of the parent bug title
const mockPatches = mockBugs.flatMap((bug) =>
  (bug.patches ?? []).map((patch) => ({
    ...patch,
    bugTitle: bug.title,
  }))
);

// MCP endpoint — uses NEXT_PUBLIC_API_URL at build time (client component)
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const MCP_ENDPOINT = `${API_URL}/mcp`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(MCP_ENDPOINT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* ----------------------------------------------------------------- */}
      {/* User info header                                                   */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-center gap-6">
        <Avatar className="h-20 w-20 border-2 border-primary/40">
          <AvatarImage
            src={currentUser.avatarUrl ?? undefined}
            alt={currentUser.githubUsername}
          />
          <AvatarFallback className="text-2xl">
            {currentUser.githubUsername.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {currentUser.githubUsername}
          </h1>
          <p className="text-sm text-muted-foreground">
            Member since {formatDate(currentUser.createdAt)}
          </p>
        </div>
      </div>

      <Separator />

      {/* ----------------------------------------------------------------- */}
      {/* Karma score                                                        */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-primary/20 bg-primary/[0.04]">
        <CardContent className="flex flex-col items-center py-8">
          <span className="text-5xl font-bold tracking-tight text-primary">
            {currentUser.karma}
          </span>
          <span className="mt-1 text-sm font-medium text-muted-foreground">
            Karma Points
          </span>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Karma breakdown row                                                */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col items-center py-6">
            <span className="text-2xl font-bold">
              {dashboardStats.bugsReported}
            </span>
            <span className="mt-0.5 text-xs text-muted-foreground">
              Bugs Reported
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col items-center py-6">
            <span className="text-2xl font-bold">
              {dashboardStats.patchesSubmitted}
            </span>
            <span className="mt-0.5 text-xs text-muted-foreground">
              Patches Submitted
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col items-center py-6">
            <span className="text-2xl font-bold">
              {dashboardStats.reviewsGiven}
            </span>
            <span className="mt-0.5 text-xs text-muted-foreground">
              Reviews Given
            </span>
          </CardContent>
        </Card>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Tabs - My Bugs / My Patches                                        */}
      {/* ----------------------------------------------------------------- */}
      <Tabs defaultValue="bugs" className="w-full">
        <TabsList>
          <TabsTrigger value="bugs">My Bugs</TabsTrigger>
          <TabsTrigger value="patches">My Patches</TabsTrigger>
        </TabsList>

        {/* My Bugs */}
        <TabsContent value="bugs">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reported Bugs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {mockBugs.map((bug, idx) => (
                <div key={bug.id}>
                  {idx > 0 && <Separator className="my-3" />}
                  <Link
                    href={`/bugs/${bug.id}`}
                    className="flex flex-col gap-2 rounded-md p-2 transition-colors hover:bg-secondary/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{bug.title}</span>
                      <Badge
                        variant="outline"
                        className="bg-primary/15 text-primary border-primary/25"
                      >
                        {bug.library}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={statusColor[bug.status]}
                      >
                        {bug.status}
                      </Badge>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(bug.createdAt)}
                    </span>
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* My Patches */}
        <TabsContent value="patches">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Submitted Patches</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {mockPatches.map((patch, idx) => (
                <div key={patch.id}>
                  {idx > 0 && <Separator className="my-3" />}
                  <Link
                    href={`/bugs/${patch.bugId}`}
                    className="flex flex-col gap-2 rounded-md p-2 transition-colors hover:bg-secondary/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm font-medium">
                      {patch.bugTitle}
                    </span>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 tabular-nums"
                      >
                        +{patch.score}
                      </Badge>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(patch.createdAt)}
                      </span>
                    </div>
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ----------------------------------------------------------------- */}
      {/* MCP Connection                                                     */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">MCP Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect your AI agent to KnownIssue via the Model Context Protocol.
            Use this endpoint in your agent&apos;s MCP configuration.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-muted/50 px-4 py-2.5 font-mono text-sm text-foreground">
              {MCP_ENDPOINT}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? (
                <>
                  <CheckIcon />
                  Copied
                </>
              ) : (
                <>
                  <CopyIcon />
                  Copy
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons (avoid an extra icon-library dependency)
// ---------------------------------------------------------------------------

function CopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
