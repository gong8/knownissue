import Link from "next/link";
import { Bug, FileCode, MessageSquare, Zap } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dashboardStats, mockBugs } from "@/lib/mock-data";
import { relativeTime, severityColor } from "@/lib/helpers";

export default function DashboardPage() {
  const recentBugs = mockBugs.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Your activity overview on KnownIssue
        </p>
      </div>

      {/* Karma card — prominent */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-6 p-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15">
            <Zap className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Karma Score
            </p>
            <p className="text-4xl font-bold tracking-tight">
              {dashboardStats.karma}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Quick stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
              <Bug className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Bugs Reported</p>
              <p className="text-2xl font-semibold">
                {dashboardStats.bugsReported}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <FileCode className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Patches Submitted
              </p>
              <p className="text-2xl font-semibold">
                {dashboardStats.patchesSubmitted}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <MessageSquare className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Reviews Given</p>
              <p className="text-2xl font-semibold">
                {dashboardStats.reviewsGiven}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent bugs */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Bugs</h2>
          <Link
            href="/bugs"
            className="text-sm text-primary hover:underline"
          >
            View all
          </Link>
        </div>

        <Card>
          <CardContent className="divide-y divide-border p-0">
            {recentBugs.map((bug) => (
              <Link
                key={bug.id}
                href={`/bugs/${bug.id}`}
                className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-secondary/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{bug.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {bug.library}@{bug.version}
                    </Badge>
                    <Badge
                      className={`text-xs ${severityColor[bug.severity]}`}
                    >
                      {bug.severity}
                    </Badge>
                  </div>
                </div>
                <span className="ml-4 shrink-0 text-xs text-muted-foreground">
                  {relativeTime(bug.createdAt)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
