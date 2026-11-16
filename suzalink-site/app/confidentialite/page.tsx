import { confidentialite as page } from "@/content/pages/legal";
import { LegalPage } from "@/components/landing/LegalPage";
import { pageMetadata } from "@/lib/page-meta";

export const metadata = pageMetadata(page);

export default function Page() {
  return <LegalPage page={page} />;
}
