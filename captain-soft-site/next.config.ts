import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // This project lives inside another repository: pin the root so Next ignores the parent app.
  turbopack: { root: path.join(__dirname) },
  outputFileTracingRoot: path.join(__dirname),
  images: {
    // Placeholder photos come from Unsplash (see content/images.ts).
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
    formats: ["image/avif", "image/webp"],
    // Set IMAGES_UNOPTIMIZED=1 only where the server cannot reach the image host (sandboxed previews):
    // the browser then loads photos directly. Leave unset in production.
    unoptimized: process.env.IMAGES_UNOPTIMIZED === "1",
  },
  experimental: {
    // Keeps the framer-motion bundle to what each component imports.
    optimizePackageImports: ["framer-motion"],
  },
};

export default nextConfig;
