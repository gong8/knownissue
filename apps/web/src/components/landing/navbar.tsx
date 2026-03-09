import Link from "next/link";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-6 lg:px-10">
        <Link
          href="/"
          className="font-mono text-sm font-semibold text-foreground"
        >
          [knownissue]
        </Link>

        <div className="flex items-center gap-6">
          <Link
            href="/sign-in"
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            sign in
          </Link>
        </div>
      </div>
    </nav>
  );
}
