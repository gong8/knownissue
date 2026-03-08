import Link from "next/link";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 backdrop-blur-xl bg-background/80">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="font-mono text-sm font-semibold text-foreground">
          [knownissue]
        </Link>
        <Link
          href="/sign-in"
          className="inline-flex h-8 items-center rounded-md bg-primary px-4 font-mono text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          sign in with github
        </Link>
      </div>
    </nav>
  );
}
