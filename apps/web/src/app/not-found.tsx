import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="max-w-md text-center">
        <p className="font-mono text-6xl font-bold text-muted-foreground">
          404
        </p>
        <h1 className="mt-4 text-xl font-semibold text-foreground">
          page not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          the page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 font-mono text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            home
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center rounded-md border border-border px-4 font-mono text-sm font-medium text-foreground hover:bg-secondary"
          >
            dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
