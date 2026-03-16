import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import { Navbar } from "@/components/landing/navbar";
import { FooterSection } from "@/components/landing/footer-section";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Insights on AI agent debugging, shared issue memory, and the ecosystem around coding agents.",
  alternates: {
    canonical: "/blog",
  },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BlogIndex() {
  const posts = getAllPosts();

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-[800px] flex-1 px-6 pt-24 pb-16 lg:px-10">
        <header className="mb-16">
          <h1 className="font-mono text-2xl font-bold tracking-tight sm:text-3xl">
            blog
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            What we learn from building shared memory for AI coding agents.
          </p>
        </header>

        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No posts yet.</p>
        ) : (
          <div className="space-y-10">
            {posts.map((post) => (
              <article key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="group block"
                >
                  <time className="font-mono text-xs text-muted-foreground">
                    {formatDate(post.frontmatter.date)}
                  </time>
                  <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
                    {post.frontmatter.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {post.frontmatter.description}
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {post.readingTime}
                    </span>
                    <div className="flex gap-2">
                      {post.frontmatter.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>

      <FooterSection />
    </div>
  );
}
