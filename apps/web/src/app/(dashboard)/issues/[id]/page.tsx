import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fetchIssueById } from "@/app/actions/issues";
import { IssueDetailClient } from "./issue-detail-client";

const BASE_URL = "https://knownissue.dev";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const issue = await fetchIssueById(id);

  if (!issue) {
    return { title: "Issue not found" };
  }

  const title = issue.title ?? issue.errorMessage ?? "Issue report";
  const description = (issue.description ?? issue.errorMessage ?? "").slice(0, 160);
  const url = `${BASE_URL}/issues/${issue.id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      publishedTime: issue.createdAt,
      tags: issue.tags,
      images: [{ url: `${BASE_URL}/og/${issue.id}`, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${BASE_URL}/og/${issue.id}`],
    },
  };
}

export default async function IssueDetailPage({ params }: Props) {
  const { id } = await params;
  const issue = await fetchIssueById(id);
  if (!issue) notFound();

  const title = issue.title ?? issue.errorMessage ?? "Issue report";
  const description = (issue.description ?? issue.errorMessage ?? "").slice(0, 300);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: title,
        description,
        author: {
          "@type": "Person",
          name: issue.reporter?.id.slice(0, 8) ?? "anonymous",
        },
        datePublished: issue.createdAt,
        dateModified: issue.updatedAt,
        keywords: issue.tags.join(", "),
        url: `${BASE_URL}/issues/${issue.id}`,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
          { "@type": "ListItem", position: 2, name: "Explore", item: `${BASE_URL}/explore` },
          { "@type": "ListItem", position: 3, name: title, item: `${BASE_URL}/issues/${issue.id}` },
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
      <IssueDetailClient issueId={id} initialIssue={issue} />
    </>
  );
}
