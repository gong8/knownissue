import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypePrettyCode from "rehype-pretty-code";
import { getAllPosts, getPostBySlug } from "@/lib/blog";
import { mdxComponents } from "@/components/blog/mdx-components";
import { Navbar } from "@/components/landing/navbar";
import { FooterSection } from "@/components/landing/footer-section";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const post = getPostBySlug(slug);
    return {
      title: post.frontmatter.title,
      description: post.frontmatter.description,
      alternates: {
        canonical: `/blog/${slug}`,
      },
      openGraph: {
        title: post.frontmatter.title,
        description: post.frontmatter.description,
        type: "article",
        publishedTime: post.frontmatter.date,
        authors: [post.frontmatter.author],
        tags: post.frontmatter.tags,
        ...(post.frontmatter.image && {
          images: [{ url: post.frontmatter.image }],
        }),
      },
      twitter: {
        card: "summary_large_image",
        title: post.frontmatter.title,
        description: post.frontmatter.description,
      },
    };
  } catch {
    return {};
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function StructuredData({ slug, frontmatter }: { slug: string; frontmatter: { title: string; description: string; date: string; author: string } }) {
  const data = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: frontmatter.title,
    description: frontmatter.description,
    datePublished: frontmatter.date,
    author: {
      "@type": "Organization",
      name: frontmatter.author,
    },
    publisher: {
      "@type": "Organization",
      name: "knownissue",
      url: "https://knownissue.dev",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://knownissue.dev/blog/${slug}`,
    },
  }).replace(/</g, "\\u003c");

  return <script type="application/ld+json">{data}</script>;
}

export default async function BlogPost({ params }: PageProps) {
  const { slug } = await params;

  let post;
  try {
    post = getPostBySlug(slug);
  } catch {
    notFound();
  }

  const { frontmatter, content, readingTime } = post;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-[720px] flex-1 px-6 pt-24 pb-16 lg:px-10">
        <Link
          href="/blog"
          className="inline-block font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          &larr; back to blog
        </Link>

        <header className="mt-8 mb-12">
          <time className="font-mono text-xs text-muted-foreground">
            {formatDate(frontmatter.date)}
          </time>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {frontmatter.title}
          </h1>
          <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
            <span>{frontmatter.author}</span>
            <span className="text-border">|</span>
            <span className="font-mono text-xs">{readingTime}</span>
          </div>
          <div className="mt-3 flex gap-2">
            {frontmatter.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </header>

        <article className="prose-knownissue">
          <MDXRemote
            source={content}
            components={mdxComponents}
            options={{
              mdxOptions: {
                rehypePlugins: [
                  [
                    rehypePrettyCode,
                    {
                      theme: "github-dark-default",
                      keepBackground: false,
                    },
                  ],
                ],
              },
            }}
          />
        </article>
      </main>

      <FooterSection />

      <StructuredData slug={slug} frontmatter={frontmatter} />
    </div>
  );
}
