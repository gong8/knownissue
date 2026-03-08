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

  const description = bug.description.slice(0, 160);
  const url = `${BASE_URL}/bugs/${bug.id}`;

  return {
    title: bug.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: bug.title,
      description,
      url,
      type: "article",
      publishedTime: bug.createdAt,
      tags: bug.tags,
      images: [{ url: `${BASE_URL}/og/${bug.id}`, width: 1200, height: 630, alt: bug.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: bug.title,
      description,
      images: [`${BASE_URL}/og/${bug.id}`],
    },
  };
}

export default async function BugDetailPage({ params }: Props) {
  const { id } = await params;
  const bug = await fetchBugById(id);
  if (!bug) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: bug.title,
        description: bug.description.slice(0, 300),
        author: {
          "@type": "Person",
          name: bug.reporter?.githubUsername,
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
          { "@type": "ListItem", position: 2, name: "Bugs", item: `${BASE_URL}/bugs` },
          { "@type": "ListItem", position: 3, name: bug.title, item: `${BASE_URL}/bugs/${bug.id}` },
        ],
      },
    ],
  };

  // Safe serialization: escape < to prevent script injection in JSON-LD
  const safeJsonLd = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd }}
      />
      <BugDetailClient bugId={id} initialBug={bug} />
    </>
  );
}
