import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6 lg:px-10">
        <Link
          href="/"
          className="font-mono text-sm font-semibold text-foreground"
        >
          [knownissue]
        </Link>

        <div className="flex items-center gap-3">
          <a
            href="https://github.com/gong8/knownissue"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            github
          </a>
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs"
            asChild
          >
            <Link href="/sign-in">sign in</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}
