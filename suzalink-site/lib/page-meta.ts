import type { Metadata } from "next";
import type { LandingPage } from "@/content/pages/types";

/** Title, description, canonical and Open Graph for a content/pages entry. */
export function pageMetadata(page: LandingPage): Metadata {
  return {
    title: page.meta.title,
    description: page.meta.description,
    alternates: { canonical: page.path },
    openGraph: { title: page.meta.title, description: page.meta.description, url: page.path, type: "website" },
    twitter: { title: page.meta.title, description: page.meta.description },
  };
}
