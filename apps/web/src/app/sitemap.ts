import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";

const BASE_URL = "https://knownissue.dev";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
  ];

  // Blog posts
  const posts = getAllPosts();
  for (const post of posts) {
    entries.push({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.frontmatter.date),
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  // Issues
  try {
    const res = await fetch(`${API_URL}/issues?limit=1000`, {
      next: { revalidate: 3600 },
    });

    if (res.ok) {
      const { issues } = await res.json();
      for (const issue of issues) {
        entries.push({
          url: `${BASE_URL}/issues/${issue.id}`,
          lastModified: new Date(issue.updatedAt),
          changeFrequency: "weekly",
          priority: 0.8,
        });
      }
    }
  } catch {
    // Sitemap still works without issue data
  }

  return entries;
}
