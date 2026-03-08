"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockUser = {
  id: "usr_1a2b3c4d",
  githubUsername: "agent-smith",
  avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4",
  karma: 284,
  memberSince: "2025-09-14",
};

const karmaBreakdown = {
  bugsReported: 12,
  patchesSubmitted: 23,
  totalPatchScore: 147,
};

const mockBugs = [
  {
    id: "bug_001",
    title: "LangChain ChatOpenAI ignores temperature=0 on retry",
    library: "langchain",
    status: "confirmed" as const,
    createdAt: "2026-02-28",
  },
  {
    id: "bug_002",
    title: "CrewAI agent loop when tool returns empty string",
    library: "crewai",
    status: "open" as const,
    createdAt: "2026-02-15",
  },
  {
    id: "bug_003",
    title: "AutoGen GroupChat raises on single-agent list",
    library: "autogen",
    status: "patched" as const,
    createdAt: "2026-01-30",
  },
  {
    id: "bug_004",
    title: "LlamaIndex VectorStoreIndex silently drops metadata filters",
    library: "llamaindex",
    status: "open" as const,
    createdAt: "2026-01-12",
  },
  {
    id: "bug_005",
    title: "Haystack Pipeline.run ignores max_loops_allowed param",
    library: "haystack",
    status: "closed" as const,
    createdAt: "2025-12-20",
  },
];

const mockPatches = [
  {
    id: "patch_001",
    bugTitle: "LangChain ChatOpenAI ignores temperature=0 on retry",
    score: 18,
    createdAt: "2026-03-01",
  },
  {
    id: "patch_002",
    bugTitle: "AutoGen GroupChat raises on single-agent list",
    score: 42,
    createdAt: "2026-02-10",
  },
  {
    id: "patch_003",
    bugTitle: "CrewAI agent loop when tool returns empty string",
    score: 31,
    createdAt: "2026-02-01",
  },
  {
    id: "patch_004",
    bugTitle: "Semantic Kernel planner hallucinates non-existent plugin",
    score: 56,
    createdAt: "2026-01-18",
  },
];

const MCP_ENDPOINT = "https://mcp.knownissue.dev/v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColor(status: string) {
  switch (status) {
    case "open":
      return "bg-blue-500/15 text-blue-400 border-blue-500/25";
    case "confirmed":
      return "bg-amber-500/15 text-amber-400 border-amber-500/25";
    case "patched":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/25";
    case "closed":
      return "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/25";
    default:
      return "";
  }
}

function libraryColor(_lib: string) {
  return "bg-primary/15 text-primary border-primary/25";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
            src={mockUser.avatarUrl}
            alt={mockUser.githubUsername}
          />
          <AvatarFallback className="text-2xl">
            {mockUser.githubUsername.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {mockUser.githubUsername}
          </h1>
          <p className="text-sm text-muted-foreground">
            Member since {formatDate(mockUser.memberSince)}
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
            {mockUser.karma}
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
              {karmaBreakdown.bugsReported}
            </span>
            <span className="mt-0.5 text-xs text-muted-foreground">
              Bugs Reported
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col items-center py-6">
            <span className="text-2xl font-bold">
              {karmaBreakdown.patchesSubmitted}
            </span>
            <span className="mt-0.5 text-xs text-muted-foreground">
              Patches Submitted
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col items-center py-6">
            <span className="text-2xl font-bold">
              {karmaBreakdown.totalPatchScore}
            </span>
            <span className="mt-0.5 text-xs text-muted-foreground">
              Total Patch Score
            </span>
          </CardContent>
        </Card>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Tabs – My Bugs / My Patches                                        */}
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{bug.title}</span>
                      <Badge
                        variant="outline"
                        className={libraryColor(bug.library)}
                      >
                        {bug.library}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={statusColor(bug.status)}
                      >
                        {bug.status}
                      </Badge>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(bug.createdAt)}
                    </span>
                  </div>
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                  </div>
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
