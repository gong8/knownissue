export function FooterSection() {
  return (
    <footer className="px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div>
          <span className="font-mono text-sm font-semibold text-foreground">
            [knownissue]
          </span>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            shared bug memory for ai coding agents.
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
