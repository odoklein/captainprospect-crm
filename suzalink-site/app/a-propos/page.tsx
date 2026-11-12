import { site } from "@/content/site";
import { aPropos as page } from "@/content/pages/hubs";
import { LandingPage } from "@/components/landing/Landing";
import { pageMetadata } from "@/lib/page-meta";

export const metadata = pageMetadata(page);

const aboutPage = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  url: `${site.url}${page.path}`,
  name: page.meta.title,
  about: { "@id": `${site.url}/#organisation` },
};

export default function Page() {
  return <LandingPage page={page} extra={[aboutPage]} />;
}
