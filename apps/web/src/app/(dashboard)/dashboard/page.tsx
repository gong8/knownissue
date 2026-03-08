"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { FileCode } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ListItem } from "@/components/list-item";
import { useListKeyboard } from "@/hooks/use-list-keyboard";
import { dashboardStats, mockBugs } from "@/lib/mock-data";
import { relativeTime } from "@/lib/helpers";
import type { Severity } from "@knownissue/shared";

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-zinc-400",
};

export default function DashboardPage() {
  const router = useRouter();
  const recentBugs = mockBugs.slice(0, 5);

  const handleSelect = useCallback(
    (index: number) => {
      const bug = recentBugs[index];
      if (bug) router.push(`/bugs/${bug.id}`);
    },
    [recentBugs, router]
  );

  const { focusedIndex } = useListKeyboard({
    itemCount: recentBugs.length,
    onSelect: handleSelect,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="dashboard" />

      {/* Inline metrics row */}
      <div className="flex items-baseline gap-8">
        <div>
          <span className="text-2xl font-bold font-mono">{dashboardStats.credits}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">credits</span>
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

      {/* Recent bugs */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
            recent bugs
          </h2>
          <Link
            href="/bugs"
            className="text-xs font-mono text-primary hover:underline"
          >
            view all
          </Link>
        </div>

        <div className="rounded-lg border border-border">
          {recentBugs.map((bug, i) => (
            <Link key={bug.id} href={`/bugs/${bug.id}`}>
              <ListItem active={focusedIndex === i} className="gap-3 cursor-pointer">
                <span className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[bug.severity]}`} />
                <span className="flex-1 truncate text-sm font-medium">{bug.title}</span>
                <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
                  {bug.library}@{bug.version}
                </span>
                {bug.patches && bug.patches.length > 0 && (
                  <span className="hidden shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground sm:inline-flex">
                    <FileCode className="h-3 w-3" />
                    {bug.patches.length}
                  </span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {relativeTime(bug.createdAt)}
                </span>
              </ListItem>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
