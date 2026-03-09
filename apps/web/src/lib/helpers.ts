import type { Severity, IssueStatus } from "@knownissue/shared";

export const severityColor: Record<Severity, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/20",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  low: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

export const statusColor: Record<IssueStatus, string> = {
  open: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  confirmed: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  patched: "bg-green-500/15 text-green-400 border-green-500/20",
  closed: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

export function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function initials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}
