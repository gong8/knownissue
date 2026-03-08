"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ThumbsUp,
  ThumbsDown,
  FileCode,
  Clock,
} from "lucide-react";
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
import { relativeTime, formatDate, initials } from "@/lib/helpers";
import type { Bug, Patch, Severity } from "@knownissue/shared";

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-zinc-400",
};

// ── Patch Row Component ────────────────────────────────────────────────────

function PatchRow({
  patch,
  rank,
  active,
  isOwner,
}: {
  patch: Patch;
  rank: number;
  active?: boolean;
  isOwner?: boolean;
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

    const delta = direction === "up" ? 1 : -1;
    const undoPrev = userVote === "up" ? -1 : userVote === "down" ? 1 : 0;
    setScore(patch.score + delta + undoPrev);
    setUserVote(direction);

    try {
      const { reviewPatch } = await import("@/app/actions/reviews");
      const result = await reviewPatch(patch.id, direction, commentText || null);
      if (result?.authorCreditDelta) {
        const delta = result.authorCreditDelta;
        toast.success(
          direction === "up"
            ? `Upvoted — patch author earned +${delta} credit`
            : `Downvoted — patch author lost ${Math.abs(delta)} credit`
        );
      }
    } catch {
      toast.error("Could not save vote", {
        description: "The API server may be unavailable.",
      });
    }
  }

  const sortedReviews = [...(patch.reviews ?? [])].sort((a, b) =>
    a.vote === "up" && b.vote !== "up" ? -1 : 1
  );

  return (
    <div className={`py-4 ${active ? "bg-surface-hover" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-bold text-primary">
            #{rank}
          </span>
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              <AvatarImage src={patch.submitter?.avatarUrl ?? undefined} />
              <AvatarFallback className="text-[9px]">
                {initials(patch.submitter?.githubUsername ?? "??")}
              </AvatarFallback>
            </Avatar>
            <span className="font-mono text-sm">
              {patch.submitter?.githubUsername}
            </span>
            <span className="text-xs text-muted-foreground">
              {relativeTime(new Date(patch.createdAt))}
            </span>
          </div>
        </div>

        {/* Vote buttons */}
        <div className="flex items-center gap-1">
          {!isOwner && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${
                userVote === "up"
                  ? "text-green-400 bg-green-500/10"
                  : "text-muted-foreground"
              }`}
              onClick={() => handleVote("up")}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
          )}
          <span className="min-w-[1.5rem] text-center font-mono text-sm font-semibold">
            {score}
          </span>
          {!isOwner && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${
                userVote === "down"
                  ? "text-red-400 bg-red-500/10"
                  : "text-muted-foreground"
              }`}
              onClick={() => handleVote("down")}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {!isOwner && (
        <Input
          placeholder="add a comment (optional)"
          className="mt-2 text-sm font-mono"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
        />
      )}

      <p className="mt-3 text-sm text-muted-foreground">{patch.description}</p>

      {/* Code block */}
      <div className="mt-3 overflow-x-auto rounded-md border border-border bg-background p-3">
        <pre className="font-mono text-xs leading-relaxed text-foreground whitespace-pre">
          {patch.code}
        </pre>
      </div>

      {/* Reviews */}
      {sortedReviews.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            reviews
          </p>
          {sortedReviews.map((review) => (
            <div
              key={review.id}
              className="flex items-start gap-2 rounded-md bg-secondary/50 px-3 py-2"
            >
              <div className="mt-0.5">
                {review.vote === "up" ? (
                  <ThumbsUp className="h-3 w-3 text-green-400" />
                ) : (
                  <ThumbsDown className="h-3 w-3 text-red-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium">
                    {review.reviewer?.githubUsername}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(new Date(review.createdAt))}
                  </span>
                </div>
                {review.comment && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {review.comment}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bug Detail Client Component ──────────────────────────────────────────

export function BugDetailClient({
  bugId,
  initialBug,
}: {
  bugId: string;
  initialBug: Bug;
}) {
  const router = useRouter();
  const [bug, setBug] = useState<Bug>(initialBug);
  const [patchDialogOpen, setPatchDialogOpen] = useState(false);
  const [patchDescription, setPatchDescription] = useState("");
  const [patchCode, setPatchCode] = useState("");
  const [isSubmittingPatch, setIsSubmittingPatch] = useState(false);
  const [focusedPatch, setFocusedPatch] = useState(-1);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Fetch current user for ownership checks (fails silently for unauthenticated)
  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      try {
        const { fetchCurrentUser } = await import("@/app/actions/user");
        const user = await fetchCurrentUser();
        if (!cancelled) {
          setCurrentUserId(user?.id ?? null);
        }
      } catch {
        // Silently ignore — user may not be authenticated
      }
    }
    loadUser();
    return () => { cancelled = true; };
  }, []);

  const sortedPatches = [...(bug.patches ?? [])].sort((a, b) => b.score - a.score);

  // Keyboard: U to go back, J/K between patches
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;

      if (e.key === "u") {
        e.preventDefault();
        router.push("/bugs");
      } else if (e.key === "j") {
        e.preventDefault();
        setFocusedPatch((prev) => Math.min(prev + 1, sortedPatches.length - 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setFocusedPatch((prev) => Math.max(prev - 1, 0));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, sortedPatches.length]);

  async function handleSubmitPatch() {
    if (!patchDescription.trim() || !patchCode.trim()) {
      toast.error("Please fill in both description and code");
      return;
    }
    setIsSubmittingPatch(true);
    try {
      const { submitPatch } = await import("@/app/actions/patches");
      const result = await submitPatch(bugId, patchDescription, patchCode);
      toast.success("Patch submitted successfully!", {
        description: result?.creditsAwarded
          ? `+${result.creditsAwarded} credits earned`
          : undefined,
      });
      setPatchDialogOpen(false);
      setPatchDescription("");
      setPatchCode("");
      // Refresh bug data to show new patch
      const { fetchBugById } = await import("@/app/actions/bugs");
      const updated = await fetchBugById(bugId);
      if (updated) setBug(updated);
    } catch {
      toast.error("Failed to submit patch", {
        description: "The API server may be unavailable.",
      });
    } finally {
      setIsSubmittingPatch(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
        <Link href="/bugs" className="hover:text-foreground transition-colors">
          bugs
        </Link>
        <span>/</span>
        <span className="text-foreground">KI-{bug.id.slice(0, 8)}</span>
      </nav>

      {/* Bug header */}
      <div className="space-y-3">
        <h1 className="text-lg font-semibold leading-tight">{bug.title}</h1>

        {/* Compact badge row with dot variants */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="dot" dotColor={SEVERITY_DOT[bug.severity]}>{bug.severity}</Badge>
          <Badge variant="dot" dotColor={
            bug.status === "open" ? "bg-blue-400" :
            bug.status === "confirmed" ? "bg-purple-400" :
            bug.status === "patched" ? "bg-green-400" : "bg-zinc-400"
          }>{bug.status}</Badge>
          <Badge variant="secondary" className="font-mono text-xs">
            {bug.library}@{bug.version}
          </Badge>
          <Badge variant="outline" className="text-xs">{bug.ecosystem}</Badge>
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
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={bug.reporter?.avatarUrl ?? undefined} />
            <AvatarFallback className="text-[9px]">
              {initials(bug.reporter?.githubUsername ?? "??")}
            </AvatarFallback>
          </Avatar>
          <span className="font-mono text-sm">
            {bug.reporter?.githubUsername}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDate(new Date(bug.createdAt))}
          </span>
        </div>
      </div>

      <Separator />

      {/* Description */}
      <div className="space-y-1.5">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          description
        </h2>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {bug.description}
        </div>
      </div>

      <Separator />

      {/* Patches header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono">
          patches{" "}
          <span className="text-muted-foreground">
            ({sortedPatches.length})
          </span>
        </h2>
        <Button size="sm" onClick={() => setPatchDialogOpen(true)} className="font-mono">
          <FileCode className="mr-1.5 h-3.5 w-3.5" />
          submit patch
        </Button>
      </div>

      <Dialog open={patchDialogOpen} onOpenChange={setPatchDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">submit a patch</DialogTitle>
            <DialogDescription>
              Provide a fix for this bug. You&apos;ll earn 5 credits.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground">description</label>
              <Textarea
                placeholder="Explain your fix..."
                rows={3}
                value={patchDescription}
                onChange={(e) => setPatchDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground">code</label>
              <Textarea
                placeholder="Paste your fix code..."
                rows={8}
                className="font-mono text-sm"
                value={patchCode}
                onChange={(e) => setPatchCode(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSubmitPatch} disabled={isSubmittingPatch} className="font-mono">
                {isSubmittingPatch ? "submitting..." : "submit patch"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Patches list -- flat with separators */}
      {sortedPatches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FileCode className="mb-2 h-6 w-6" />
          <p className="font-mono text-sm">no patches yet. be the first.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {sortedPatches.map((patch, i) => (
            <PatchRow
              key={patch.id}
              patch={patch}
              rank={i + 1}
              active={focusedPatch === i}
              isOwner={currentUserId === patch.submitterId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
