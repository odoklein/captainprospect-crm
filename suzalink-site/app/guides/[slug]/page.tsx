import { notFound } from "next/navigation";
import { findGuide, guides } from "@/content/pages/guides";
import { LandingPage } from "@/components/landing/Landing";
import { pageMetadata } from "@/lib/page-meta";

export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const guide = findGuide((await params).slug);
  if (!guide) return {};
  const meta = pageMetadata(guide);
  return { ...meta, openGraph: { ...meta.openGraph, type: "article" as const, publishedTime: guide.article?.published, modifiedTime: guide.updated } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const guide = findGuide((await params).slug);
  if (!guide) notFound();
  return <LandingPage page={guide} />;
}
