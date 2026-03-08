import type { MetadataRoute } from "next";

const BASE_URL = "https://knownissue.dev";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
  ];

  try {
    const res = await fetch(`${API_URL}/bugs?limit=1000`, {
      next: { revalidate: 3600 },
    });

    if (res.ok) {
      const { bugs } = await res.json();
      for (const bug of bugs) {
        entries.push({
          url: `${BASE_URL}/bugs/${bug.id}`,
          lastModified: new Date(bug.updatedAt),
          changeFrequency: "weekly",
          priority: 0.8,
        });
      }
    }
  } catch {
    // Sitemap still works with just the homepage
  }

  return entries;
}
