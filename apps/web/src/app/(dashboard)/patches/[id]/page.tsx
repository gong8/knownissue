"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ThumbsUp, ThumbsDown, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime, formatDate, initials } from "@/lib/helpers";
import { fetchPatchById } from "@/app/actions/patches";
import type { Patch } from "@knownissue/shared";

export default function PatchDetailPage() {
  const params = useParams<{ id: string }>();
  const [patch, setPatch] = useState<(Patch & { bug?: { id: string; title: string } }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [userVote, setUserVote] = useState<"up" | "down" | null>(null);
  const [commentText, setCommentText] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [patchData, { fetchCurrentUser }] = await Promise.all([
          fetchPatchById(params.id),
          import("@/app/actions/user"),
        ]);
        if (!cancelled) {
          setPatch(patchData);
          setScore(patchData?.score ?? 0);
        }
        try {
          const user = await fetchCurrentUser();
          if (!cancelled) setCurrentUserId(user?.id ?? null);
        } catch {
          // not authenticated
        }
      } catch {
        // patch not found
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [params.id]);

  async function handleVote(direction: "up" | "down") {
    if (!patch) return;
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
        const d = result.authorCreditDelta;
        toast.success(
          direction === "up"
            ? `Upvoted — patch author earned +${d} credit`
            : `Downvoted — patch author lost ${Math.abs(d)} credit`
        );
      }
    } catch {
      toast.error("Could not save vote");
    }
  }

  const isOwner = currentUserId === patch?.submitterId;
  const sortedReviews = [...(patch?.reviews ?? [])].sort((a, b) =>
    a.vote === "up" && b.vote !== "up" ? -1 : 1
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-6 w-80" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!patch) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="font-mono text-sm text-muted-foreground">patch not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
        <Link href="/bugs" className="hover:text-foreground transition-colors">bugs</Link>
        <span>/</span>
        {patch.bug ? (
          <Link href={`/bugs/${patch.bug.id}`} className="hover:text-foreground transition-colors">
            KI-{patch.bug.id.slice(0, 8)}
          </Link>
        ) : (
          <span>{patch.bugId.slice(0, 8)}</span>
        )}
        <span>/</span>
        <span className="text-foreground">patch</span>
      </nav>

      {/* Bug context */}
      {patch.bug && (
        <Link
          href={`/bugs/${patch.bug.id}`}
          className="block rounded-lg border border-border px-4 py-3 hover:bg-secondary/50 transition-colors"
        >
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">fix for</p>
          <p className="mt-1 text-sm font-medium">{patch.bug.title}</p>
        </Link>
      )}

      {/* Patch header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={patch.submitter?.avatarUrl ?? undefined} />
            <AvatarFallback className="text-xs">
              {initials(patch.submitter?.githubUsername ?? "??")}
            </AvatarFallback>
          </Avatar>
          <div>
            <span className="font-mono text-sm font-medium">
              {patch.submitter?.githubUsername}
            </span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDate(new Date(patch.createdAt))}
            </div>
          </div>
        </div>

        {/* Vote controls */}
        <div className="flex items-center gap-1">
          {!isOwner && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${userVote === "up" ? "text-green-400 bg-green-500/10" : "text-muted-foreground"}`}
              onClick={() => handleVote("up")}
            >
              <ThumbsUp className="h-4 w-4" />
            </Button>
          )}
          <Badge
            variant="outline"
            className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 font-mono text-sm tabular-nums"
          >
            +{score}
          </Badge>
          {!isOwner && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${userVote === "down" ? "text-red-400 bg-red-500/10" : "text-muted-foreground"}`}
              onClick={() => handleVote("down")}
            >
              <ThumbsDown className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {!isOwner && (
        <Input
          placeholder="add a comment with your vote (optional)"
          className="text-sm font-mono"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
        />
      )}

      <Separator />

      {/* Description */}
      <div className="space-y-1.5">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          description
        </h2>
        <p className="text-sm leading-relaxed text-foreground/90">{patch.description}</p>
      </div>

      {/* Code */}
      <div className="space-y-1.5">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          code
        </h2>
        <div className="overflow-x-auto rounded-md border border-border bg-background p-3">
          <pre className="font-mono text-xs leading-relaxed text-foreground whitespace-pre">
            {patch.code}
          </pre>
        </div>
      </div>

      <Separator />

      {/* Reviews */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          reviews ({sortedReviews.length})
        </h2>
        {sortedReviews.length === 0 ? (
          <p className="text-sm text-muted-foreground font-mono">no reviews yet.</p>
        ) : (
          <div className="space-y-2">
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
    </div>
  );
}
