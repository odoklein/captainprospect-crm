import Link from "next/link";
import type { ReactNode } from "react";
import { site } from "@/content/site";
import { formatEuro } from "@/content/pricing";
import { guarantees, prospectionOffers } from "@/content/offers";
import type { Block, LandingPage as LandingPageData } from "@/content/pages/types";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/motion";
import { JsonLd } from "@/components/ui/JsonLd";
import { ButtonLink, Container, Eyebrow, SectionHeader, cx } from "@/components/ui/primitives";
import { SiteHeader } from "@/components/sections/SiteHeader";
import { Pricing } from "@/components/sections/Pricing";
import { Footer } from "@/components/sections/Footer";

// Pages d'offre, de secteur et de tarifs : une page = un fichier de content/pages/.
// Ce fichier ne contient que la mise en page ; les textes sont dans content/.


function Breadcrumbs({ trail }: { trail: Array<{ label: string; href: string }> }) {
  return (
    <nav aria-label="Fil d'Ariane" className="text-[14px] text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {trail.map((c, i) => (
          <li key={c.href} className="flex items-center gap-1.5">
            {i > 0 ? <span aria-hidden>/</span> : null}
            {i === trail.length - 1 ? (
              <span aria-current="page" className="text-ink/80">
                {c.label}
              </span>
            ) : (
              <Link href={c.href} className="underline-offset-4 hover:text-ink hover:underline">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Section({ id, children, tone = "paper", className }: { id?: string; children: ReactNode; tone?: "paper" | "white" | "dark"; className?: string }) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cx(
        "py-20 sm:py-28",
        tone === "white" && "border-y border-line bg-white",
        tone === "dark" && "on-dark bg-navy text-white",
        className,
      )}
    >
      <Container>{children}</Container>
    </section>
  );
}

function Check({ dark }: { dark?: boolean }) {
  return (
    <span aria-hidden className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", dark ? "bg-mint text-navy" : "bg-navy text-white")}>
      <Icon name="check" className="size-3" />
    </span>
  );
}

export function OfferCards() {
  return (
    <ul className="grid gap-5 lg:grid-cols-3">
      {prospectionOffers.map((o) => {
        const featured = Boolean(o.highlight);
        return (
          <li
            key={o.id}
            id={o.id}
            className={cx(
              "relative flex scroll-mt-28 flex-col rounded-[24px] border p-7 sm:p-8",
              featured ? "on-dark border-navy bg-navy text-white" : "border-line bg-paper",
            )}
          >
            {featured ? (
              <p className="absolute -top-3 left-8 rounded-full border border-rose bg-white px-3 py-1 text-[12px] font-medium text-navy">{o.highlight}</p>
            ) : null}
            <h3 className="font-display-tight text-2xl font-normal">{o.name}</h3>
            <p className={cx("mt-2 min-h-[3em] text-[15px] leading-relaxed", featured ? "text-white/75" : "text-muted")}>{o.audience}</p>
            <p className="mt-6 flex flex-wrap items-baseline gap-x-2">
              {o.price.prefix ? <span className={featured ? "text-white/75" : "text-muted"}>{o.price.prefix}</span> : null}
              <span className="font-display-tight text-[52px] leading-none font-light">{formatEuro(o.price.amount)}</span>
              <span className={featured ? "text-white/75" : "text-muted"}>{o.price.unit}</span>
            </p>
            {o.extra ? <p className={cx("mt-2 text-[14px]", featured ? "text-white/75" : "text-muted")}>{o.extra}</p> : null}
            <ul className={cx("mt-6 flex flex-1 flex-col gap-3 border-t pt-6 text-[15px]", featured ? "border-white/15" : "border-line")}>
              {o.features.map((f) => (
                <li key={f} className="flex gap-3">
                  <Check dark={featured} />
                  {f}
                </li>
              ))}
            </ul>
            <ButtonLink href={`/demo?offre=${o.id}`} variant={featured ? "light" : "primary"} arrow className="mt-8 w-full justify-between">
              {o.cta}
            </ButtonLink>
          </li>
        );
      })}
    </ul>
  );
}

export function Guarantees() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {guarantees.map((g) => (
        <li key={g.title} className="rounded-[20px] border border-line bg-white p-6">
          <p className="flex items-center gap-2.5 font-medium text-ink">
            <Icon name="shield" className="size-5 text-navy" />
            {g.title}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{g.body}</p>
        </li>
      ))}
    </ul>
  );
}

function renderBlock(block: Block, i: number) {
  const id = block.id ?? `bloc-${i}`;
  const header = "eyebrow" in block && block.eyebrow ? (
    <SectionHeader id={`${id}-title`} eyebrow={block.eyebrow} title={block.title} subtitle={block.intro} tone={block.kind === "proof" ? "dark" : "light"} />
  ) : null;

  switch (block.kind) {
    case "pains":
      return (
        <Section key={id} id={id}>
          <Reveal>{header}</Reveal>
          <ul className="mt-12 grid gap-4 md:grid-cols-2">
            {block.items.map((it) => (
              <li key={it.title} className="rounded-[24px] border border-line bg-white p-7">
                <h3 className="font-display-tight text-[24px] leading-tight font-normal text-ink">{it.title}</h3>
                <p className="mt-3 leading-relaxed text-muted">{it.body}</p>
              </li>
            ))}
          </ul>
        </Section>
      );

    case "steps":
      return (
        <Section key={id} id={id} tone="white">
          <Reveal>{header}</Reveal>
          <ol className="mt-12 grid gap-4 lg:grid-cols-5">
            {block.items.map((it, n) => (
              <li key={it.title} className="flex flex-col rounded-[20px] border border-line bg-paper p-6">
                <span className="font-mono text-[13px] text-muted">{String(n + 1).padStart(2, "0")}{it.when ? ` · ${it.when}` : ""}</span>
                <h3 className="mt-3 text-[18px] leading-snug font-semibold text-ink">{it.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{it.body}</p>
              </li>
            ))}
          </ol>
        </Section>
      );

    case "features":
      return (
        <Section key={id} id={id}>
          <Reveal>{header}</Reveal>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {block.items.map((it) => (
              <li key={it.title} className="rounded-[20px] border border-line bg-white p-6">
                <span aria-hidden className="grid size-10 place-items-center rounded-[12px] bg-mint/60 text-navy">
                  <Icon name={(it.icon ?? "check") as IconName} className="size-5" />
                </span>
                <h3 className="mt-4 text-[18px] font-semibold text-ink">{it.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{it.body}</p>
              </li>
            ))}
          </ul>
        </Section>
      );

    case "proof":
      return (
        <Section key={id} id={id} tone="dark">
          <Reveal>{header}</Reveal>
          <dl className="mt-12 grid gap-px overflow-hidden rounded-[24px] border border-white/15 bg-white/15 sm:grid-cols-2 lg:grid-cols-4">
            {block.stats.map((s) => (
              <div key={s.label} className="flex flex-col-reverse bg-navy p-7">
                <dt className="mt-2 text-[15px] leading-snug text-white/75">{s.label}</dt>
                <dd className="font-display-tight text-[clamp(2.5rem,5vw,3.5rem)] leading-none font-light text-white">{s.value}</dd>
              </div>
            ))}
          </dl>
          {block.story ? <p className="mt-10 max-w-[68ch] text-[17px] leading-relaxed text-white/85">{block.story}</p> : null}
          <p className="mt-6 text-[13px] text-white/60">{block.note}</p>
        </Section>
      );

    case "compare":
      return (
        <Section key={id} id={id} tone="white">
          <Reveal>{header}</Reveal>
          <div className="mt-12 overflow-x-auto rounded-[20px] border border-line">
            <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
              <caption className="sr-only">{block.title}</caption>
              <thead>
                <tr className="bg-paper">
                  <th scope="col" className="p-4 font-medium text-muted" />
                  {block.columns.map((c, n) => (
                    <th key={c} scope="col" className={cx("p-4 font-semibold", n === block.columns.length - 1 ? "bg-navy text-white" : "text-ink")}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((r) => (
                  <tr key={r.label} className="border-t border-line">
                    <th scope="row" className="p-4 align-top font-medium text-ink">{r.label}</th>
                    {r.cells.map((c, n) => (
                      <td key={n} className={cx("p-4 align-top", n === r.cells.length - 1 ? "bg-mint/25 font-medium text-ink" : "text-muted")}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.note ? <p className="mt-4 text-[13px] text-muted">{block.note}</p> : null}
        </Section>
      );

    case "offers":
      return (
        <Section key={id} id={id} tone="white">
          <Reveal>{header}</Reveal>
          <div className="mt-12">
            <OfferCards />
          </div>
          <div className="mt-8">
            <Guarantees />
          </div>
        </Section>
      );

    case "crm-pricing":
      return (
        <div key={id} id={id} className="scroll-mt-20">
          <Pricing />
        </div>
      );

    case "prose":
      return (
        <Section key={id} id={id}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-20">
            <Reveal>{header}</Reveal>
            <div className="flex max-w-[68ch] flex-col gap-8">
              {block.parts.map((p) => (
                <div key={p.title}>
                  <h3 className="text-[20px] font-semibold text-ink">{p.title}</h3>
                  {p.paragraphs.map((t) => (
                    <p key={t.slice(0, 40)} className="mt-3 text-[17px] leading-relaxed text-ink/80">
                      {t}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Section>
      );

    case "faq":
      return (
        <Section key={id} id={id} tone="white">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-20">
            {header}
            <div className="divide-y divide-line border-y border-line">
              {block.items.map((q) => (
                <details key={q.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-[17px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                    {q.q}
                    <span aria-hidden className="mt-1 grid size-6 shrink-0 place-items-center rounded-full border border-line text-navy transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-[64ch] leading-relaxed text-muted">{q.a}</p>
                </details>
              ))}
            </div>
          </div>
        </Section>
      );

    case "links":
      return (
        <Section key={id} id={id}>
          {header}
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {block.items.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="group flex h-full flex-col rounded-[20px] border border-line bg-white p-6 transition-colors hover:border-navy/40">
                  <span className="flex items-center justify-between gap-3 text-[18px] font-semibold text-ink">
                    {l.label}
                    <Icon name="arrowRight" className="size-4 text-navy transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-2 text-[15px] leading-relaxed text-muted">{l.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      );

    case "cta":
      return (
        <section key={id} aria-labelledby={`${id}-title`} className="on-dark bg-navy-deep py-24 text-white sm:py-32">
          <Container className="flex flex-col items-center gap-6 text-center">
            <Eyebrow tone="dark">{block.eyebrow}</Eyebrow>
            <h2 id={`${id}-title`} className="font-display-tight max-w-[18ch] text-[clamp(2.25rem,5vw,4rem)] leading-[1.02] font-light">
              {block.title}
            </h2>
            <p className="max-w-[54ch] text-lg text-white/80">{block.intro}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <ButtonLink href={block.primary.href} variant="light" size="lg" arrow>
                {block.primary.label}
              </ButtonLink>
              {block.secondary ? (
                <ButtonLink href={block.secondary.href} variant="ghost-light" size="lg">
                  {block.secondary.label}
                </ButtonLink>
              ) : null}
            </div>
          </Container>
        </section>
      );
  }
}

/** Full page: header, hero, blocks, footer, plus Breadcrumb / FAQPage / page-specific JSON-LD. */
export function LandingPage({ page, extra, children }: { page: LandingPageData; extra?: object[]; children?: ReactNode }) {
  const trail = [{ label: "Accueil", href: "/" }, ...(page.parent ? [page.parent] : []), { label: page.breadcrumb, href: page.path }];
  const faq = page.blocks.find((b) => b.kind === "faq");
  const schemas: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: trail.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: `${site.url}${c.href}` })),
    },
    ...(faq && faq.kind === "faq"
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.items.map((q) => ({ "@type": "Question", name: q.q, acceptedAnswer: { "@type": "Answer", text: q.a } })),
          },
        ]
      : []),
    ...(extra ?? []),
  ];
  const { hero } = page;

  return (
    <>
      {schemas.map((s, i) => (
        <JsonLd key={i} data={s} />
      ))}
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <section aria-labelledby="page-title" className="relative overflow-hidden pt-10 pb-20 sm:pt-14 sm:pb-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[560px] [background-image:radial-gradient(rgba(17,47,53,.12)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_30%_20%,black_20%,transparent_70%)]"
          />
          <Container className="relative">
            <Breadcrumbs trail={trail} />
            <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_380px] lg:items-end lg:gap-16">
              <div className="flex flex-col gap-6">
                <Eyebrow>{hero.eyebrow}</Eyebrow>
                <h1 id="page-title" className="font-display-tight max-w-[18ch] text-[clamp(2.75rem,6.4vw,5rem)] leading-[1] font-light text-ink">
                  {hero.title}
                </h1>
                <p className="max-w-[58ch] text-lg leading-relaxed text-muted sm:text-xl">{hero.lead}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <ButtonLink href={hero.primary.href} size="lg" arrow>
                    {hero.primary.label}
                  </ButtonLink>
                  {hero.secondary ? (
                    <ButtonLink href={hero.secondary.href} variant="ghost" size="lg">
                      {hero.secondary.label}
                    </ButtonLink>
                  ) : null}
                </div>
              </div>
              {hero.bullets ? (
                <ul className="flex flex-col gap-3 rounded-[24px] border border-line bg-white p-6 text-[15px] shadow-[0_18px_40px_-30px_rgba(12,31,35,.35)]">
                  {hero.bullets.map((b) => (
                    <li key={b} className="flex gap-3">
                      <Check />
                      {b}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Container>
        </section>
        {children}
        {page.blocks.map(renderBlock)}
      </main>
      <Footer />
    </>
  );
}
