import { site } from "@/content/site";
import { plans } from "@/content/pricing";
import { AnnouncementBar } from "@/components/sections/AnnouncementBar";
import { SiteHeader } from "@/components/sections/SiteHeader";
import { Hero } from "@/components/sections/Hero";
import { LogoStrip } from "@/components/sections/LogoStrip";
import { AiSplit } from "@/components/sections/AiSplit";
import { Engines } from "@/components/sections/Engines";
import { Roles } from "@/components/sections/Roles";
import { StackCost } from "@/components/sections/StackCost";
import { CaseStudies } from "@/components/sections/CaseStudies";
import { Testimonial } from "@/components/sections/Testimonial";
import { Pricing } from "@/components/sections/Pricing";
import { Security } from "@/components/sections/Security";
import { FinalCta } from "@/components/sections/FinalCta";
import { Footer } from "@/components/sections/Footer";

/** schema.org SoftwareApplication, offers built from content/pricing.ts. */
function StructuredData() {
  const prices = plans.flatMap((p) => [p.price.monthly, p.price.annual]);
  const json = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: site.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "CRM",
    operatingSystem: "Web",
    inLanguage: "fr-FR",
    url: site.url,
    description: site.seo.description,
    image: `${site.url}/opengraph-image.png`,
    publisher: { "@type": "Organization", name: site.name, logo: `${site.url}/brand/logo.svg` },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "EUR",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: plans.length,
      offers: plans.map((p) => ({
        "@type": "Offer",
        name: p.name,
        price: p.price.monthly,
        priceCurrency: "EUR",
        url: `${site.url}/#tarifs`,
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: p.price.monthly,
          priceCurrency: "EUR",
          unitText: "MONTH",
          valueAddedTaxIncluded: false,
        },
      })),
    },
  };
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe here: all values come from our own config files.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, "\\u003c") }}
    />
  );
}

export default function HomePage() {
  return (
    <>
      <StructuredData />
      <AnnouncementBar />
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <Hero />
        <LogoStrip />
        <AiSplit />
        <Engines />
        <Roles />
        <StackCost />
        <CaseStudies />
        <Testimonial />
        <Pricing />
        <Security />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
