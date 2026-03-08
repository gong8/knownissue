import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/bugs/*"],
        disallow: ["/dashboard", "/profile", "/sign-in"],
      },
    ],
    sitemap: "https://knownissue.dev/sitemap.xml",
  };
}
