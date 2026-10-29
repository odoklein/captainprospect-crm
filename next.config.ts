import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Directory containing this config file (real app root). */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const tailwindCssEntry = path.join(projectRoot, "node_modules", "tailwindcss", "index.css");

// OpenReplay origin allowed in script-src. headers() is evaluated at BUILD and
// baked into the routes manifest, so this is a build arg, not a runtime setting:
// every instance built from one image shares it. A per-instance host would need
// its own build or a middleware-generated CSP header (docs/WHITE_LABEL.md).
const openReplayOrigin = (process.env.OPENREPLAY_INGEST_ORIGIN || "https://openreplay.suzaliconseil.com").replace(/\/+$/, ""); // brand-check-ignore

const nextConfig: NextConfig = {
  output: "standalone",
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
  allowedDevOrigins: [process.env.REPLIT_DEV_DOMAIN || "*.replit.dev"],
  // Keep pdfkit external so its font data files (.afm) resolve correctly at runtime.
  // Document parsers for assistant folder files: loaded from node_modules at
  // runtime rather than bundled (unpdf ships pdf.js, exceljs/mammoth pull zip and xml libs).
  serverExternalPackages: ["pdfkit", "unpdf", "exceljs", "mammoth"],
  // unpdf loads pdf.js through a self-referencing dynamic import
  // (`import("unpdf/pdfjs")` in dist/index.mjs). Output file tracing resolves
  // it today, but a miss would only show at runtime in the standalone image
  // (« PDF.js could not be resolved »): ship the whole dist with every route
  // that can extract a document (assistant chat tools, folder files routes).
  outputFileTracingIncludes: {
    "/api/manager/assistant/**/*": ["./node_modules/unpdf/package.json", "./node_modules/unpdf/dist/**/*.mjs"],
  },
  // Allow larger request bodies for email send (attachments). Default is 1MB.
  experimental: {
    // middleware.ts runs on /api/*: without this, request bodies are truncated at 10 MB (RDV audio uploads go up to 50 MB).
    proxyClientMaxBodySize: "60mb",
    serverActions: {
      bodySizeLimit: "26mb",
    },
  },
  // The email area used to be split over /manager/email, /manager/emails and
  // /manager/emailing. Everything now lives in the Email Hub (/manager/emails,
  // /sdr/emails); old links, bookmarks and OAuth return URLs land on the right tab.
  async redirects() {
    return [
      { source: "/manager/email", destination: "/manager/emails/inbox", permanent: false },
      { source: "/manager/email/:path*", destination: "/manager/emails/:path*", permanent: false },
      { source: "/manager/emailing", destination: "/manager/emails/campaigns", permanent: false },
      { source: "/manager/emails/contacts", destination: "/manager/emails/sequences", permanent: false },
      { source: "/sdr/email", destination: "/sdr/emails/inbox", permanent: false },
      { source: "/client/portal/email", destination: "/client/portal/emailing?tab=sent", permanent: false },
    ];
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
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' ${openReplayOrigin} https://static.openreplay.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https:; frame-src 'self' https://cal.com https://*.cal.com https://calendly.com https://*.calendly.com https://meetings-eu1.hubspot.com https://*.hubspot.com; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';`,
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
