import { notFound } from "next/navigation";
import { findSector, sectors } from "@/content/pages/secteurs";
import { LandingPage } from "@/components/landing/Landing";
import { pageMetadata } from "@/lib/page-meta";

export const dynamicParams = false;

export function generateStaticParams() {
  return sectors.map((s) => ({ cible: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ cible: string }> }) {
  const sector = findSector((await params).cible);
  return sector ? pageMetadata(sector) : {};
}

export default async function Page({ params }: { params: Promise<{ cible: string }> }) {
  const sector = findSector((await params).cible);
  if (!sector) notFound();
  return <LandingPage page={sector} />;
}
