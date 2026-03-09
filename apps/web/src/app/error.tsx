"use client";

import Link from "next/link";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="max-w-md text-center">
        <p className="font-mono text-6xl font-bold text-muted-foreground">
          500
        </p>
        <h1 className="mt-4 text-xl font-semibold text-foreground">
          something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          an unexpected error occurred. please try again.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 font-mono text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            try again
          </button>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-md border border-border px-4 font-mono text-sm font-medium text-foreground hover:bg-secondary"
          >
            home
          </Link>
        </div>
      </div>
    </div>
  );
}
