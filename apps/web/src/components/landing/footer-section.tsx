import Link from "next/link";

export function FooterSection() {
  return (
    <footer className="border-t border-border px-6 py-8 lg:px-10">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between">
        <span className="font-mono text-xs font-semibold text-foreground">
          [knownissue]
        </span>
        <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
          <a
            href="https://github.com/gong8/knownissue"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            github
          </a>
          <a
            href="https://x.com/knownissue_dev"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            x
          </a>
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            terms
          </Link>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}
