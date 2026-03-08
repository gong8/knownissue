import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fetchBugById } from "@/app/actions/bugs";
import { BugDetailClient } from "./bug-detail-client";

const BASE_URL = "https://knownissue.dev";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const bug = await fetchBugById(id);

  if (!bug) {
    return { title: "Bug not found" };
  }

  const title = bug.title ?? bug.errorMessage ?? "Bug report";
  const description = (bug.description ?? bug.errorMessage ?? "").slice(0, 160);
  const url = `${BASE_URL}/bugs/${bug.id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      publishedTime: bug.createdAt,
      tags: bug.tags,
      images: [{ url: `${BASE_URL}/og/${bug.id}`, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${BASE_URL}/og/${bug.id}`],
    },
  };
}

export default async function BugDetailPage({ params }: Props) {
  const { id } = await params;
  const bug = await fetchBugById(id);
  if (!bug) notFound();

  const title = bug.title ?? bug.errorMessage ?? "Bug report";
  const description = (bug.description ?? bug.errorMessage ?? "").slice(0, 300);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: title,
        description,
        author: {
          "@type": "Person",
          name: bug.reporter?.githubUsername ?? "anonymous",
        },
        datePublished: bug.createdAt,
        dateModified: bug.updatedAt,
        keywords: bug.tags.join(", "),
        url: `${BASE_URL}/bugs/${bug.id}`,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
          { "@type": "ListItem", position: 2, name: "Activity", item: `${BASE_URL}/activity` },
          { "@type": "ListItem", position: 3, name: title, item: `${BASE_URL}/bugs/${bug.id}` },
        ],
      },
    ],
  };

  // Safe serialization: escape < to prevent script injection in JSON-LD
  // This is a standard Next.js pattern for JSON-LD structured data.
  // The content is server-generated from our own database, not from user input rendered as HTML.
  const safeJsonLd = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- JSON-LD requires dangerouslySetInnerHTML per Next.js docs. Content is escaped above.
        dangerouslySetInnerHTML={{ __html: safeJsonLd }}
      />
      <BugDetailClient bugId={id} initialBug={bug} />
    </>
  );
}
