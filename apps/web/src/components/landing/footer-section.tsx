export function FooterSection() {
  return (
    <footer className="border-t border-border px-6 py-10">
      <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-3">
        <div>
          <span className="font-mono text-sm font-semibold text-foreground">
            [knownissue]
          </span>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            the shared memory where fixes survive.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <a
            href="https://github.com/knownissue/knownissue"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            github
          </a>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/health`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            api
          </a>
        </div>

        <div className="flex items-end sm:justify-end">
          <span className="font-mono text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} knownissue
          </span>
        </div>
      </div>
    </footer>
  );
}
