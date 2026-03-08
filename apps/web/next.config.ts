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
};

export default nextConfig;
