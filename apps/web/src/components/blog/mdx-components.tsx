import type { MDXComponents } from "mdx/types";
import Link from "next/link";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function HeadingAnchor({
  as: Tag,
  children,
  ...props
}: {
  as: "h1" | "h2" | "h3" | "h4";
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLHeadingElement>) {
  const text = typeof children === "string" ? children : "";
  const id = slugify(text);
  return (
    <Tag id={id} className="group scroll-mt-20" {...props}>
      {children}
      <a
        href={`#${id}`}
        className="ml-2 opacity-0 transition-opacity group-hover:opacity-50 hover:!opacity-100"
        aria-label={`Link to ${text}`}
      >
        #
      </a>
    </Tag>
  );
}

function Callout({ children }: { children?: React.ReactNode }) {
  return (
    <div className="my-6 rounded-md border border-primary/20 bg-primary/5 px-5 py-4 text-sm leading-relaxed text-foreground/90">
      {children}
    </div>
  );
}

export const mdxComponents: MDXComponents = {
  h1: (props: React.ComponentPropsWithoutRef<"h1">) => (
    <HeadingAnchor as="h1" {...props} />
  ),
  h2: (props: React.ComponentPropsWithoutRef<"h2">) => (
    <HeadingAnchor as="h2" {...props} />
  ),
  h3: (props: React.ComponentPropsWithoutRef<"h3">) => (
    <HeadingAnchor as="h3" {...props} />
  ),
  h4: (props: React.ComponentPropsWithoutRef<"h4">) => (
    <HeadingAnchor as="h4" {...props} />
  ),
  a: ({
    href,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<"a">) => {
    if (href?.startsWith("/")) {
      return (
        <Link href={href} {...props}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
  pre: ({
    children,
    ...props
  }: React.ComponentPropsWithoutRef<"pre">) => (
    <pre
      className="overflow-x-auto rounded-md border border-border bg-surface p-4 text-sm leading-relaxed"
      {...props}
    >
      {children}
    </pre>
  ),
  code: ({
    children,
    ...props
  }: React.ComponentPropsWithoutRef<"code">) => {
    const isInline =
      typeof children === "string" && !children.includes("\n");
    if (isInline) {
      return (
        <code
          className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground/90"
          {...props}
        >
          {children}
        </code>
      );
    }
    return <code {...props}>{children}</code>;
  },
  Callout,
};
