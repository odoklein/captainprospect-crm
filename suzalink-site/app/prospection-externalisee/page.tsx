import { site } from "@/content/site";
import { prospectionOffers } from "@/content/offers";
import { prospectionPage as page } from "@/content/pages/prospection-externalisee";
import { LandingPage } from "@/components/landing/Landing";
import { pageMetadata } from "@/lib/page-meta";

export const metadata = pageMetadata(page);

const service = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Prospection externalisée",
  serviceType: "Prospection téléphonique B2B et prise de rendez-vous",
  description: page.meta.description,
  url: `${site.url}${page.path}`,
  areaServed: { "@type": "Country", name: "France" },
  provider: { "@id": `${site.url}/#organisation` },
  offers: prospectionOffers.map((o) => ({
    "@type": "Offer",
    name: o.name,
    price: o.price.amount,
    priceCurrency: "EUR",
    url: `${site.url}/tarifs#${o.id}`,
  })),
};

export default function Page() {
  return <LandingPage page={page} extra={[service]} />;
}
