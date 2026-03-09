import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/issues/*"],
        disallow: ["/dashboard", "/profile", "/sign-in"],
      },
    ],
    sitemap: "https://knownissue.dev/sitemap.xml",
  };
}
