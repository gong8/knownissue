"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ThumbsUp,
  ThumbsDown,
  ArrowLeft,
  FileCode,
  Clock,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { getMockBugById } from "@/lib/mock-data";
import { severityColor, statusColor, relativeTime, formatDate, initials } from "@/lib/helpers";
import type { Patch } from "@knownissue/shared";

// ── Patch Card Component ────────────────────────────────────────────────────

function PatchCard({
  patch,
  rank,
}: {
  patch: Patch;
  rank: number;
}) {
  const [score, setScore] = useState(patch.score);
  const [userVote, setUserVote] = useState<"up" | "down" | null>(null);
  const [commentText, setCommentText] = useState("");

  async function handleVote(direction: "up" | "down") {
    if (userVote === direction) {
      setScore(patch.score);
      setUserVote(null);
      return;
    }

    // Optimistic update
    const delta = direction === "up" ? 1 : -1;
    const undoPrev = userVote === "up" ? -1 : userVote === "down" ? 1 : 0;
    setScore(patch.score + delta + undoPrev);
    setUserVote(direction);

    // Try to submit review to API
    try {
      const { reviewPatch } = await import("@/app/actions/reviews");
      await reviewPatch(patch.id, direction, commentText || null);
    } catch {
      // API may not be running — keep optimistic state, show toast
      toast.error("Could not save vote", {
        description: "The API server may be unavailable.",
      });
    }
  }

  const sortedReviews = [...(patch.reviews ?? [])].sort((a, b) =>
    a.vote === "up" && b.vote !== "up" ? -1 : 1
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              #{rank}
            </span>
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={patch.submitter?.avatarUrl ?? undefined} />
                <AvatarFallback className="text-[10px]">
                  {initials(patch.submitter?.githubUsername ?? "??")}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">
                {patch.submitter?.githubUsername}
              </span>
              <span className="text-xs text-muted-foreground">
                {relativeTime(patch.createdAt)}
              </span>
            </div>
          </div>

          {/* Score + vote buttons */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${
                userVote === "up"
                  ? "text-green-400 bg-green-500/10"
                  : "text-muted-foreground"
              }`}
              onClick={() => handleVote("up")}
            >
              <ThumbsUp className="h-4 w-4" />
            </Button>
            <span className="min-w-[2rem] text-center text-sm font-semibold">
              {score}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${
                userVote === "down"
                  ? "text-red-400 bg-red-500/10"
                  : "text-muted-foreground"
              }`}
              onClick={() => handleVote("down")}
            >
              <ThumbsDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Input
          placeholder="Add a comment (optional)"
          className="mt-2 text-sm"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
        />
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Description */}
        <p className="text-sm text-muted-foreground">{patch.description}</p>

        {/* Code block */}
        <div className="overflow-x-auto rounded-lg border border-border bg-background p-4">
          <pre className="font-mono text-xs leading-relaxed text-foreground whitespace-pre">
            {patch.code}
          </pre>
        </div>

        {/* Reviews */}
        {sortedReviews.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reviews
            </p>
            {sortedReviews.map((review) => (
              <div
                key={review.id}
                className="flex items-start gap-3 rounded-lg bg-secondary/50 px-4 py-3"
              >
                <div className="mt-0.5">
                  {review.vote === "up" ? (
                    <ThumbsUp className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <ThumbsDown className="h-3.5 w-3.5 text-red-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {review.reviewer?.githubUsername}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(review.createdAt)}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {review.comment}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page Component ──────────────────────────────────────────────────────────

export default function BugDetailPage() {
  const params = useParams();
  const bugId = params.id as string;
  const bug = getMockBugById(bugId);
  const [patchDialogOpen, setPatchDialogOpen] = useState(false);
  const [patchDescription, setPatchDescription] = useState("");
  const [patchCode, setPatchCode] = useState("");
  const [isSubmittingPatch, setIsSubmittingPatch] = useState(false);

  async function handleSubmitPatch() {
    if (!patchDescription.trim() || !patchCode.trim()) {
      toast.error("Please fill in both description and code");
      return;
    }
    setIsSubmittingPatch(true);
    try {
      const { submitPatch } = await import("@/app/actions/patches");
      await submitPatch(bugId, patchDescription, patchCode);
      toast.success("Patch submitted successfully!");
      setPatchDialogOpen(false);
      setPatchDescription("");
      setPatchCode("");
    } catch {
      toast.error("Failed to submit patch", {
        description: "The API server may be unavailable.",
      });
    } finally {
      setIsSubmittingPatch(false);
    }
  }

  if (!bug) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="text-lg font-medium">Bug not found</p>
        <p className="mt-1 text-sm">
          No bug exists with ID &ldquo;{bugId}&rdquo;
        </p>
        <Button variant="outline" asChild className="mt-6">
          <Link href="/bugs">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to bugs
          </Link>
        </Button>
      </div>
    );
  }

  const sortedPatches = [...(bug.patches ?? [])].sort(
    (a, b) => b.score - a.score
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Back link */}
      <Link
        href="/bugs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to bugs
      </Link>

      {/* Bug header */}
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold leading-tight">{bug.title}</h1>

        {/* Badge row */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={severityColor[bug.severity]}>{bug.severity}</Badge>
          <Badge className={statusColor[bug.status]}>{bug.status}</Badge>
          <Badge variant="secondary">
            {bug.library}@{bug.version}
          </Badge>
          <Badge variant="outline">{bug.ecosystem}</Badge>
          {bug.tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="text-xs text-muted-foreground"
            >
              {tag}
            </Badge>
          ))}
        </div>

        {/* Reporter info */}
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={bug.reporter?.avatarUrl ?? undefined} />
            <AvatarFallback className="text-xs">
              {initials(bug.reporter?.githubUsername ?? "??")}
            </AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">
              {bug.reporter?.githubUsername}
            </span>
            <span className="text-muted-foreground">reported</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {formatDate(bug.createdAt)}
            </span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Description */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Description
        </h2>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {bug.description}
        </div>
      </div>

      <Separator />

      {/* Submit Patch button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Patches{" "}
          <span className="text-muted-foreground">
            ({sortedPatches.length})
          </span>
        </h2>
        <Button onClick={() => setPatchDialogOpen(true)}>
          <FileCode className="mr-2 h-4 w-4" />
          Submit Patch
        </Button>
      </div>

      <Dialog open={patchDialogOpen} onOpenChange={setPatchDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Submit a Patch</DialogTitle>
            <DialogDescription>
              Provide a fix for this bug. You&apos;ll earn 5 karma points.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Explain your fix..."
                rows={3}
                value={patchDescription}
                onChange={(e) => setPatchDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Code</label>
              <Textarea
                placeholder="Paste your fix code..."
                rows={8}
                className="font-mono text-sm"
                value={patchCode}
                onChange={(e) => setPatchCode(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSubmitPatch} disabled={isSubmittingPatch}>
                {isSubmittingPatch ? "Submitting..." : "Submit Patch"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Patches list */}
      {sortedPatches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileCode className="mb-3 h-8 w-8" />
            <p className="text-sm">No patches yet. Be the first to submit one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedPatches.map((patch, i) => (
            <PatchCard key={patch.id} patch={patch} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
