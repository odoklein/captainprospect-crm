import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { images, type ImageKey, type SiteImage } from "@/content/images";

const extensions = [".avif", ".webp", ".jpg", ".jpeg", ".png"];

export type ResolvedImage = SiteImage & { position?: string };

/**
 * Picks the local file in /public/photos when it exists, otherwise the Unsplash fallback.
 * Runs at build time (server components only), so swapping a visual is just dropping a file.
 */
export function resolveImage(key: ImageKey): ResolvedImage | null {
  const entry = images[key];
  const position = "position" in entry ? entry.position : undefined;
  for (const ext of extensions) {
    const file = `${entry.file}${ext}`;
    if (existsSync(path.join(process.cwd(), "public", file))) return { src: file, alt: entry.alt, position };
  }
  if ("fallback" in entry && entry.fallback) return { ...entry.fallback, position: undefined };
  return null;
}
