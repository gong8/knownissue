import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@knownissue/shared"],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  experimental: {
    viewTransition: true,
  },
  async redirects() {
    return [
      { source: "/dashboard", destination: "/overview", permanent: true },
      { source: "/activity", destination: "/overview", permanent: true },
      { source: "/profile", destination: "/your-agent", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "github.com" },
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
};

export default nextConfig;
