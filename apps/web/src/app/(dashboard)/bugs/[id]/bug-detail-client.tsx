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
  ChevronDown,
  ChevronRight,
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
import type { Bug, Patch, Severity, PatchStep } from "@knownissue/shared";

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-zinc-400",
};

// ── Structured Step Renderer ──────────────────────────────────────────────

function PatchStepDisplay({ step, index }: { step: PatchStep; index: number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 font-mono text-[10px] font-bold text-primary">
          {index + 1}
        </span>
        <Badge variant="outline" className="text-[10px] uppercase">
          {step.type.replace("_", " ")}
        </Badge>
        {step.type === "code_change" && (
          <span className="font-mono text-xs text-muted-foreground">{step.filePath}</span>
        )}
        {step.type === "version_bump" && (
          <span className="font-mono text-xs text-muted-foreground">{step.package} → {step.to}</span>
        )}
        {step.type === "config_change" && (
          <span className="font-mono text-xs text-muted-foreground">{step.file} [{step.key}]</span>
        )}
      </div>

      {step.type === "code_change" && (
        <div className="space-y-1.5">
          {step.before && (
            <pre className="font-mono text-xs leading-relaxed bg-red-500/5 border-l-2 border-red-400/40 p-2 rounded overflow-x-auto whitespace-pre">
              {step.before}
            </pre>
          )}
          <pre className="font-mono text-xs leading-relaxed bg-green-500/5 border-l-2 border-green-400/40 p-2 rounded overflow-x-auto whitespace-pre">
            {step.after}
          </pre>
        </div>
      )}

      {step.type === "command" && (
        <pre className="font-mono text-xs bg-secondary/50 p-2 rounded overflow-x-auto whitespace-pre">
          $ {step.command}
        </pre>
      )}

      {step.type === "config_change" && (
        <div className="font-mono text-xs">
          <span className="text-muted-foreground">{step.action}:</span>{" "}
          {step.value && <span>{step.value}</span>}
        </div>
      )}
    </div>
  );
}

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
  const [noteText, setNoteText] = useState("");

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
      const result = await reviewPatch(patch.id, direction, noteText || null);
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

  const steps = (patch.steps ?? []) as PatchStep[];

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
            {patch.versionConstraint && (
              <Badge variant="outline" className="text-[10px]">
                {patch.versionConstraint}
              </Badge>
            )}
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
          placeholder="add a note (optional)"
          className="mt-2 text-sm font-mono"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
        />
      )}

      <p className="mt-3 text-sm text-muted-foreground">{patch.explanation}</p>

      {/* Structured steps */}
      {steps.length > 0 && (
        <div className="mt-3 space-y-2">
          {steps.map((step, i) => (
            <PatchStepDisplay key={i} step={step} index={i} />
          ))}
        </div>
      )}

      {/* Legacy code block fallback */}
      {steps.length === 0 && patch.code && (
        <div className="mt-3 overflow-x-auto rounded-md border border-border bg-background p-3">
          <pre className="font-mono text-xs leading-relaxed text-foreground whitespace-pre">
            {patch.code}
          </pre>
        </div>
      )}

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
                  {review.version && (
                    <Badge variant="outline" className="text-[10px]">
                      v{review.version}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(new Date(review.createdAt))}
                  </span>
                </div>
                {review.note && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {review.note}
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
  const [patchExplanation, setPatchExplanation] = useState("");
  const [patchCode, setPatchCode] = useState("");
  const [isSubmittingPatch, setIsSubmittingPatch] = useState(false);
  const [focusedPatch, setFocusedPatch] = useState(-1);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [bugScore, setBugScore] = useState(bug.score ?? 0);
  const [bugVote, setBugVote] = useState<"up" | "down" | null>(null);
  const [stackTraceOpen, setStackTraceOpen] = useState(false);

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
        // Silently ignore
      }
    }
    loadUser();
    return () => { cancelled = true; };
  }, []);

  const sortedPatches = [...(bug.patches ?? [])].sort((a, b) => b.score - a.score);
  const displayTitle = bug.title ?? bug.errorMessage ?? "Untitled";

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

  async function handleBugVote(direction: "up" | "down") {
    if (bugVote === direction) {
      setBugScore(bug.score ?? 0);
      setBugVote(null);
      return;
    }

    const delta = direction === "up" ? 1 : -1;
    const undoPrev = bugVote === "up" ? -1 : bugVote === "down" ? 1 : 0;
    setBugScore((bug.score ?? 0) + delta + undoPrev);
    setBugVote(direction);

    try {
      const { reviewTarget } = await import("@/app/actions/reviews");
      await reviewTarget(bugId, "bug", direction, null);
      toast.success(
        direction === "up" ? "Bug report upvoted" : "Bug report downvoted"
      );
    } catch {
      toast.error("Could not save vote");
    }
  }

  async function handleSubmitPatch() {
    if (!patchExplanation.trim() || !patchCode.trim()) {
      toast.error("Please fill in both explanation and code");
      return;
    }
    setIsSubmittingPatch(true);
    try {
      const { submitPatch } = await import("@/app/actions/patches");
      // Convert raw code to a single code_change step for simplicity
      const steps = [{
        type: "code_change" as const,
        filePath: "unknown",
        before: "",
        after: patchCode,
      }];
      const result = await submitPatch(bugId, patchExplanation, steps);
      toast.success("Patch submitted successfully!", {
        description: result?.creditsAwarded
          ? `+${result.creditsAwarded} credits earned`
          : undefined,
      });
      setPatchDialogOpen(false);
      setPatchExplanation("");
      setPatchCode("");
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

  const isOwner = currentUserId === bug.reporterId;

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
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-lg font-semibold leading-tight">{displayTitle}</h1>

          {/* Bug voting */}
          {!isOwner && (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${bugVote === "up" ? "text-green-400 bg-green-500/10" : "text-muted-foreground"}`}
                onClick={() => handleBugVote("up")}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </Button>
              <span className="min-w-[1.5rem] text-center font-mono text-sm font-semibold">
                {bugScore}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${bugVote === "down" ? "text-red-400 bg-red-500/10" : "text-muted-foreground"}`}
                onClick={() => handleBugVote("down")}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Compact badge row */}
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
          {bug.errorCode && (
            <Badge variant="destructive" className="font-mono text-xs">
              {bug.errorCode}
            </Badge>
          )}
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

      {/* Error message (highlighted) */}
      {bug.errorMessage && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            error message
          </h2>
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
            <pre className="font-mono text-sm text-red-400 whitespace-pre-wrap">{bug.errorMessage}</pre>
          </div>
        </div>
      )}

      {/* Description */}
      {bug.description && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            description
          </h2>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {bug.description}
          </div>
        </div>
      )}

      {/* Trigger code */}
      {bug.triggerCode && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            trigger code
          </h2>
          <div className="overflow-x-auto rounded-md border border-border bg-background p-3">
            <pre className="font-mono text-xs leading-relaxed whitespace-pre">{bug.triggerCode}</pre>
          </div>
        </div>
      )}

      {/* Expected vs Actual */}
      {(bug.expectedBehavior || bug.actualBehavior) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {bug.expectedBehavior && (
            <div className="space-y-1.5">
              <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                expected
              </h2>
              <div className="rounded-md border border-green-500/20 bg-green-500/5 p-3 text-sm">
                {bug.expectedBehavior}
              </div>
            </div>
          )}
          {bug.actualBehavior && (
            <div className="space-y-1.5">
              <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                actual
              </h2>
              <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-sm">
                {bug.actualBehavior}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stack trace (collapsible) */}
      {bug.stackTrace && (
        <div className="space-y-1.5">
          <button
            onClick={() => setStackTraceOpen(!stackTraceOpen)}
            className="flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            {stackTraceOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            stack trace
          </button>
          {stackTraceOpen && (
            <div className="overflow-x-auto rounded-md border border-border bg-background p-3">
              <pre className="font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre">
                {bug.stackTrace}
              </pre>
            </div>
          )}
        </div>
      )}

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
              <label className="text-xs font-mono text-muted-foreground">explanation</label>
              <Textarea
                placeholder="Explain your fix..."
                rows={3}
                value={patchExplanation}
                onChange={(e) => setPatchExplanation(e.target.value)}
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

      {/* Patches list */}
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
