import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Directory containing this config file (real app root). */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const tailwindCssEntry = path.join(projectRoot, "node_modules", "tailwindcss", "index.css");

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
    // Bare `@import "tailwindcss"` must resolve inside this repo (not a parent folder with package-lock.json).
    resolveAlias: {
      tailwindcss: tailwindCssEntry,
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  productionBrowserSourceMaps: true,
  allowedDevOrigins: [process.env.REPLIT_DEV_DOMAIN || "*.replit.dev"],
  // Prevent bundling pdfkit so its font data files (.afm) resolve correctly at runtime
  // puppeteer + @sparticuz/chromium: keep external for PDF generation (Chrome binary)
  serverExternalPackages: ["pdfkit", "puppeteer", "puppeteer-core", "@sparticuz/chromium-min"],
  // Allow larger request bodies for email send (attachments). Default is 1MB.
  experimental: {
    serverActions: {
      bodySizeLimit: "26mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https:; frame-src 'self' https://cal.com https://*.cal.com; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
          },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
      {
        source: "/api/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
