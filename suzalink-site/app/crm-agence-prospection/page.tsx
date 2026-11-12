import { site } from "@/content/site";
import { plans } from "@/content/pricing";
import { crmAgencePage as page } from "@/content/pages/crm-agence-prospection";
import { LandingPage } from "@/components/landing/Landing";
import { pageMetadata } from "@/lib/page-meta";

export const metadata = pageMetadata(page);

const software = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: `${site.name} CRM`,
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "CRM",
  operatingSystem: "Web",
  inLanguage: "fr-FR",
  url: `${site.url}${page.path}`,
  description: page.meta.description,
  publisher: { "@id": `${site.url}/#organisation` },
  offers: plans.map((p) => ({
    "@type": "Offer",
    name: p.name,
    price: p.price.annual,
    priceCurrency: "EUR",
    url: `${site.url}/tarifs#crm`,
  })),
};

export default function Page() {
  return <LandingPage page={page} extra={[software]} />;
}
