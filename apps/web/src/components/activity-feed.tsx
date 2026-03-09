"use client";

import Link from "next/link";
import { ListItem } from "@/components/list-item";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { relativeTime, initials } from "@/lib/helpers";
import type { Severity } from "@knownissue/shared";

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-zinc-400",
};

export type FeedItem = {
  id: string;
  type: "issue" | "patch" | "verification";
  summary: string | null;
  library: string;
  version: string;
  severity: Severity;
  ecosystem: string;
  status: string;
  created_at: string;
  actor: string | null;
  actor_avatar: string | null;
  issueId: string | null;
  issueTitle: string | null;
};

function actionLabel(item: FeedItem): string {
  switch (item.type) {
    case "issue":
      return "reported issue in";
    case "patch":
      return "submitted patch for";
    case "verification":
      return `verified patch (${item.summary}) for`;
    default:
      return "acted on";
  }
}

function itemHref(item: FeedItem): string {
  switch (item.type) {
    case "issue":
      return `/issues/${item.id}`;
    case "patch":
      return `/patches/${item.id}`;
    case "verification":
      return item.issueId ? `/issues/${item.issueId}` : "#";
    default:
      return "#";
  }
}

export function ActivityFeed({ items }: { items: FeedItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm font-mono">no activity yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      {items.map((item) => (
        <Link key={`${item.type}-${item.id}`} href={itemHref(item)}>
          <ListItem className="gap-3 cursor-pointer">
            <span className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[item.severity] ?? "bg-zinc-400"}`} />
            <Avatar className="h-5 w-5 shrink-0">
              <AvatarImage src={item.actor_avatar ?? undefined} />
              <AvatarFallback className="text-[9px]">
                {initials(item.actor ?? "??")}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate text-sm">
              <span className="font-mono text-muted-foreground">{item.actor ?? "agent"}</span>
              {" "}
              <span className="text-muted-foreground">{actionLabel(item)}</span>
              {" "}
              <span className="font-medium">{item.library}@{item.version}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {relativeTime(new Date(item.created_at))}
            </span>
          </ListItem>
        </Link>
      ))}
    </div>
  );
}
