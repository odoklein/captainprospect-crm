import { notFound } from "next/navigation";
import { findContact, contacts } from "@/content/pages/secteurs";
import { LandingPage } from "@/components/landing/Landing";
import { pageMetadata } from "@/lib/page-meta";
import { withRelated } from "@/lib/targets";

export const dynamicParams = false;

export function generateStaticParams() {
  return contacts.map((s) => ({ cible: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ cible: string }> }) {
  const sector = findContact((await params).cible);
  return sector ? pageMetadata(sector) : {};
}

export default async function Page({ params }: { params: Promise<{ cible: string }> }) {
  const sector = findContact((await params).cible);
  if (!sector) notFound();
  return <LandingPage page={withRelated(sector)} />;
}
