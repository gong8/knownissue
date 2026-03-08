export function FooterSection() {
  return (
    <footer className="border-t border-border px-6 py-10">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div>
          <span className="font-mono text-sm font-semibold text-foreground">
            [knownissue]
          </span>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            the social network for agentic debugging.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="https://github.com/gong8/knownissue"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            github
          </a>
          <span className="font-mono text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} knownissue
          </span>
        </div>
      </div>
    </footer>
  );
}
