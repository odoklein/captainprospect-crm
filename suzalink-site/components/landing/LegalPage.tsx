import Link from "next/link";
import type { LegalPageData } from "@/content/pages/legal";
import { site } from "@/content/site";
import { SiteHeader } from "@/components/sections/SiteHeader";
import { Footer } from "@/components/sections/Footer";
import { JsonLd } from "@/components/ui/JsonLd";
import { Container } from "@/components/ui/primitives";
import { RichText } from "./RichText";

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** Legal pages: a plain reading page. Numbered sections, a short index, no call to action. */
export function LegalPage({ page }: { page: LegalPageData }) {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Accueil", item: site.url },
            { "@type": "ListItem", position: 2, name: page.title, item: `${site.url}${page.path}` },
          ],
        }}
      />
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <Container className="grid gap-12 pt-10 pb-24 sm:pt-14 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
          <nav aria-label="Sur cette page" className="lg:sticky lg:top-28 lg:self-start">
            <Link href="/" className="text-[14px] text-muted underline-offset-4 hover:text-ink hover:underline">
              Accueil
            </Link>
            <ol className="mt-8 hidden flex-col gap-2 border-l border-line lg:flex">
              {page.sections.map((s, n) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-ml-px flex gap-3 border-l-2 border-transparent py-1 pl-4 text-[14px] text-muted transition-colors hover:border-navy hover:text-ink">
                    <span className="font-mono text-[12px] tabular-nums">{String(n + 1).padStart(2, "0")}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="max-w-[68ch]">
            <h1 className="font-display-tight text-[clamp(2.5rem,5vw,3.75rem)] leading-[1.02] font-light text-ink">{page.title}</h1>
            <p className="mt-5 text-lg leading-relaxed text-muted">{page.lead}</p>
            <p className="mt-4 text-[14px] text-muted">
              Mis à jour le <time dateTime={page.updated}>{dateFr(page.updated)}</time>
            </p>

            <div className="mt-12 flex flex-col">
              {page.sections.map((s, n) => (
                <section key={s.id} id={s.id} aria-labelledby={`${s.id}-t`} className="grid scroll-mt-28 gap-x-6 border-t border-ink/15 py-8 sm:grid-cols-[48px_minmax(0,1fr)]">
                  <span aria-hidden className="font-mono text-[13px] text-muted tabular-nums sm:pt-1">
                    {String(n + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h2 id={`${s.id}-t`} className="text-[20px] leading-snug font-semibold text-ink">
                      {s.title}
                    </h2>
                    {s.paragraphs.map((t) => (
                      <p key={t.slice(0, 40)} className="mt-3 text-[16.5px] leading-[1.7] text-ink/80">
                        <RichText text={t} />
                      </p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </article>
        </Container>
      </main>
      <Footer />
    </>
  );
}
