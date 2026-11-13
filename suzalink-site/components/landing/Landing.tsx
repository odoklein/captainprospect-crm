import Image from "next/image";
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
import { RichText, plainText } from "./RichText";
import { CountUp, ReadingProgress, Spotlight, StickyCta, Toc } from "./interactive";

// Pages d'offre, de secteur, de guide et de tarifs : une page = un fichier de content/pages/.
// Ce fichier ne contient que la mise en page ; les textes sont dans content/.

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

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
        "scroll-mt-20 py-20 sm:py-28",
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
          <Spotlight
            as="li"
            key={o.id}
            tone={featured ? "dark" : "light"}
            className={cx(
              "flex scroll-mt-28 flex-col overflow-visible rounded-[24px] border p-7 sm:p-8",
              featured ? "on-dark border-navy bg-navy text-white" : "border-line bg-paper",
            )}
          >
            <span id={o.id} className="absolute -top-28" aria-hidden />
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
          </Spotlight>
        );
      })}
    </ul>
  );
}

export function Guarantees() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {guarantees.map((g) => (
        <Spotlight as="li" key={g.title} className="rounded-[20px] border border-line bg-white p-6">
          <p className="flex items-center gap-2.5 font-medium text-ink">
            <span className="grid size-8 place-items-center rounded-full bg-mint/60 text-navy transition-colors duration-300 group-hover/card:bg-navy group-hover/card:text-white">
              <Icon name="shield" className="size-4" />
            </span>
            {g.title}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">{g.body}</p>
        </Spotlight>
      ))}
    </ul>
  );
}

const cardTitle = "font-display-tight text-[24px] leading-tight font-normal text-ink";

function renderBlock(block: Block, i: number) {
  const id = block.id ?? `bloc-${i}`;
  const header =
    "eyebrow" in block && block.eyebrow ? (
      <SectionHeader id={`${id}-title`} eyebrow={block.eyebrow} title={block.title} subtitle={block.intro} tone={block.kind === "proof" ? "dark" : "light"} />
    ) : null;

  switch (block.kind) {
    case "answer":
      return (
        <section key={id} id={id} aria-label="En bref" className="-mt-6 pb-16 sm:pb-20">
          <Container>
            <div className="answer-box grid gap-6 rounded-[28px] border border-navy/10 bg-[linear-gradient(135deg,rgba(185,237,214,.55),rgba(255,255,255,.9)_60%)] p-7 sm:p-10 lg:grid-cols-[1fr_320px] lg:gap-12">
              <div>
                <p className="eyebrow flex items-center gap-2 text-navy">
                  <Icon name="sparkle" className="size-4" /> En bref
                </p>
                <h2 className="mt-4 text-[22px] leading-snug font-semibold text-ink sm:text-[26px]">{block.question}</h2>
                <p className="mt-3 text-[17px] leading-relaxed text-ink/85 sm:text-lg">
                  <RichText text={block.answer} />
                </p>
              </div>
              {block.facts ? (
                <ul className="flex flex-col gap-3 self-center rounded-[20px] bg-white/80 p-5 text-[15px] backdrop-blur">
                  {block.facts.map((f) => (
                    <li key={f} className="flex gap-3">
                      <Check />
                      <span>
                        <RichText text={f} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Container>
        </section>
      );

    case "pains":
      return (
        <Section key={id} id={id}>
          <Reveal>{header}</Reveal>
          <ul className="mt-12 grid gap-4 md:grid-cols-2">
            {block.items.map((it, n) => (
              <Spotlight as="li" key={it.title} className="rounded-[24px] border border-line bg-white p-7">
                <span className="font-mono text-[12px] text-muted transition-colors group-hover/card:text-navy">{String(n + 1).padStart(2, "0")}</span>
                <h3 className={cx(cardTitle, "mt-3")}>{it.title}</h3>
                <p className="mt-3 leading-relaxed text-muted">
                  <RichText text={it.body} />
                </p>
              </Spotlight>
            ))}
          </ul>
        </Section>
      );

    case "steps":
      return (
        <Section key={id} id={id} tone="white">
          <Reveal>{header}</Reveal>
          <ol className="relative mt-12 grid gap-4 lg:grid-cols-5">
            <span aria-hidden className="absolute top-9 right-[10%] left-[10%] hidden h-px bg-[repeating-linear-gradient(90deg,var(--color-line)_0_6px,transparent_6px_12px)] lg:block" />
            {block.items.map((it, n) => (
              <Spotlight as="li" key={it.title} className="flex flex-col rounded-[20px] border border-line bg-paper p-6">
                <span className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-full border border-line bg-white font-mono text-[13px] text-navy transition-colors duration-300 group-hover/card:border-navy group-hover/card:bg-navy group-hover/card:text-white">
                    {n + 1}
                  </span>
                  {it.when ? <span className="font-mono text-[12px] text-muted">{it.when}</span> : null}
                </span>
                <h3 className="mt-4 text-[18px] leading-snug font-semibold text-ink">{it.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  <RichText text={it.body} />
                </p>
              </Spotlight>
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
              <Spotlight as="li" key={it.title} className="rounded-[20px] border border-line bg-white p-6">
                <span aria-hidden className="grid size-11 place-items-center rounded-[14px] bg-mint/60 text-navy transition-[background-color,color,transform] duration-300 group-hover/card:-rotate-6 group-hover/card:bg-navy group-hover/card:text-white">
                  <Icon name={(it.icon ?? "check") as IconName} className="size-5" />
                </span>
                <h3 className="mt-4 text-[18px] font-semibold text-ink">{it.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  <RichText text={it.body} />
                </p>
              </Spotlight>
            ))}
          </ul>
        </Section>
      );

    case "proof":
      return (
        <Section key={id} id={id} tone="dark" className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(185,237,214,.18),transparent)]" />
          <Reveal>{header}</Reveal>
          <dl className="relative mt-12 grid gap-px overflow-hidden rounded-[24px] border border-white/15 bg-white/15 sm:grid-cols-2 lg:grid-cols-4">
            {block.stats.map((s) => (
              <div key={s.label} className="group/stat flex flex-col-reverse bg-navy p-7 transition-colors duration-300 hover:bg-navy-deep">
                <dt className="mt-2 text-[15px] leading-snug text-white/75">{s.label}</dt>
                <dd className="font-display-tight text-[clamp(2.5rem,5vw,3.5rem)] leading-none font-light text-white transition-colors duration-300 group-hover/stat:text-mint">
                  <CountUp value={s.value} />
                </dd>
              </div>
            ))}
          </dl>
          {block.story ? (
            <p className="relative mt-10 max-w-[68ch] border-l-2 border-rose pl-5 text-[17px] leading-relaxed text-white/85">
              <RichText text={block.story} linkClassName="font-medium text-white underline decoration-mint underline-offset-4" />
            </p>
          ) : null}
          <p className="relative mt-6 text-[13px] text-white/60">{block.note}</p>
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
                  <tr key={r.label} className="border-t border-line transition-colors hover:bg-paper/70">
                    <th scope="row" className="p-4 align-top font-medium text-ink">{r.label}</th>
                    {r.cells.map((c, n) => (
                      <td key={n} className={cx("p-4 align-top", n === r.cells.length - 1 ? "bg-mint/25 font-medium text-ink" : "text-muted")}>
                        {n === r.cells.length - 1 ? (
                          <span className="flex gap-2">
                            <Check />
                            {c}
                          </span>
                        ) : (
                          c
                        )}
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

    case "article": {
      const toc = block.sections.map((s) => ({ id: s.id, title: s.title }));
      return (
        <section key={id} className="pb-20 sm:pb-28">
          <Container className="grid gap-12 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
            <aside className="hidden lg:block">
              <Toc items={toc} />
            </aside>
            <div className="flex min-w-0 max-w-[72ch] flex-col gap-16">
              {block.sections.map((s) => (
                <article key={s.id} id={s.id} aria-labelledby={`${s.id}-t`} className="scroll-mt-28">
                  <h2 id={`${s.id}-t`} className="font-display-tight text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.08] font-light text-ink">
                    {s.title}
                  </h2>
                  {s.answer ? (
                    <p className="answer-box mt-5 rounded-[18px] border-l-4 border-navy bg-white px-5 py-4 text-[17px] leading-relaxed text-ink">
                      <RichText text={s.answer} />
                    </p>
                  ) : null}
                  {s.paragraphs?.map((t) => (
                    <p key={t.slice(0, 48)} className="mt-5 text-[17px] leading-[1.75] text-ink/80">
                      <RichText text={t} />
                    </p>
                  ))}
                  {s.list ? (
                    s.list.ordered ? (
                      <ol className="mt-6 flex flex-col gap-3">
                        {s.list.items.map((t, n) => (
                          <li key={t.slice(0, 40)} className="flex gap-4 text-[17px] leading-relaxed text-ink/85">
                            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-navy font-mono text-[12px] text-white">{n + 1}</span>
                            <span>
                              <RichText text={t} />
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <ul className="mt-6 flex flex-col gap-3">
                        {s.list.items.map((t) => (
                          <li key={t.slice(0, 40)} className="flex gap-3 text-[17px] leading-relaxed text-ink/85">
                            <Check />
                            <span>
                              <RichText text={t} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : null}
                  {s.table ? (
                    <div className="mt-6 overflow-x-auto rounded-[18px] border border-line bg-white">
                      <table className="w-full min-w-[520px] border-collapse text-left text-[15px]">
                        <caption className="border-b border-line px-4 py-3 text-left text-[13px] font-medium text-muted">{s.table.caption}</caption>
                        <thead>
                          <tr className="bg-paper">
                            {s.table.columns.map((c) => (
                              <th key={c} scope="col" className="p-3.5 font-semibold text-ink">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {s.table.rows.map((r) => (
                            <tr key={r.join("|")} className="border-t border-line transition-colors hover:bg-mint/15">
                              {r.map((c, n) =>
                                n === 0 ? (
                                  <th key={n} scope="row" className="p-3.5 align-top font-medium text-ink">
                                    {c}
                                  </th>
                                ) : (
                                  <td key={n} className="p-3.5 align-top text-ink/75">
                                    {c}
                                  </td>
                                ),
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {s.table.note ? (
                        <p className="border-t border-line px-4 py-3 text-[13px] text-muted">
                          <RichText text={s.table.note} />
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {s.field ? (
                    <aside className="mt-6 flex gap-4 rounded-[18px] bg-navy p-5 text-white">
                      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-mint text-navy">
                        <Icon name="phone" className="size-4" />
                      </span>
                      <p className="text-[15px] leading-relaxed text-white/85">
                        <span className="eyebrow block text-mint">Sur le terrain</span>
                        <span className="mt-1 block">
                          <RichText text={s.field} linkClassName="font-medium text-white underline decoration-mint underline-offset-4" />
                        </span>
                      </p>
                    </aside>
                  ) : null}
                </article>
              ))}
              {block.sources ? (
                <div className="rounded-[18px] border border-line bg-white p-6">
                  <h2 className="eyebrow text-muted">Sources</h2>
                  <ul className="mt-3 flex flex-col gap-2 text-[14px] text-muted">
                    {block.sources.map((s) => (
                      <li key={s.href}>
                        <a href={s.href} rel="noopener" target="_blank" className="font-medium text-navy underline-offset-4 hover:underline">
                          {s.label}
                        </a>
                        {s.note ? ` · ${s.note}` : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Container>
        </section>
      );
    }

    case "showcase":
      return (
        <Section key={id} id={id}>
          <div className={cx("grid items-center gap-12 lg:grid-cols-2 lg:gap-20", block.reverse && "lg:[&>*:first-child]:order-2")}>
            <Reveal>
              {header}
              {block.points ? (
                <ul className="mt-8 flex flex-col gap-3 text-[16px]">
                  {block.points.map((p) => (
                    <li key={p} className="flex gap-3">
                      <Check />
                      <span>
                        <RichText text={p} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {block.action ? (
                <ButtonLink href={block.action.href} variant="ghost" arrow className="mt-8">
                  {block.action.label}
                </ButtonLink>
              ) : null}
            </Reveal>
            <div className="group/visual relative">
              <div aria-hidden className="absolute inset-[8%] -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(185,237,214,.75),transparent)] blur-2xl transition-transform duration-700 group-hover/visual:scale-110" />
              <Image
                src={block.image.src}
                alt={block.image.alt}
                width={block.image.width}
                height={block.image.height}
                sizes="(min-width: 1024px) 560px, 100vw"
                className="mx-auto h-auto w-full max-w-[560px] drop-shadow-[0_30px_50px_rgba(12,31,35,.16)] transition-transform duration-500 ease-out motion-safe:group-hover/visual:-translate-y-1.5 motion-safe:group-hover/visual:rotate-[-0.6deg]"
              />
            </div>
          </div>
        </Section>
      );

    case "prose":
      return (
        <Section key={id} id={id}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-20">
            <Reveal className="lg:sticky lg:top-28 lg:self-start">{header}</Reveal>
            <div className="flex max-w-[68ch] flex-col gap-8">
              {block.parts.map((p) => (
                <div key={p.title} className="border-t border-line pt-6">
                  <h3 className="text-[20px] font-semibold text-ink">{p.title}</h3>
                  {p.paragraphs.map((t) => (
                    <p key={t.slice(0, 40)} className="mt-3 text-[17px] leading-relaxed text-ink/80">
                      <RichText text={t} />
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
            <div className="lg:sticky lg:top-28 lg:self-start">{header}</div>
            <div className="divide-y divide-line border-y border-line">
              {block.items.map((q) => (
                <details key={q.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-6 rounded-md text-[17px] font-medium text-ink transition-colors hover:text-navy [&::-webkit-details-marker]:hidden">
                    <h3 className="font-medium">{q.q}</h3>
                    <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-line text-navy transition-[transform,background-color,color] duration-300 group-open:rotate-45 group-open:border-navy group-open:bg-navy group-open:text-white">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-[64ch] leading-relaxed text-muted">
                    <RichText text={q.a} />
                  </p>
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
              <Spotlight as="li" key={l.href} className="rounded-[20px] border border-line bg-white">
                <Link href={l.href} className="flex h-full flex-col p-6">
                  <span className="flex items-center justify-between gap-3 text-[18px] font-semibold text-ink">
                    {l.label}
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mint/60 text-navy transition-[transform,background-color,color] duration-300 group-hover/card:translate-x-0.5 group-hover/card:bg-navy group-hover/card:text-white">
                      <Icon name="arrowRight" className="size-4" />
                    </span>
                  </span>
                  <span className="mt-2 text-[15px] leading-relaxed text-muted">{l.body}</span>
                </Link>
              </Spotlight>
            ))}
          </ul>
        </Section>
      );

    case "cta":
      return (
        <section key={id} aria-labelledby={`${id}-title`} className="on-dark relative overflow-hidden bg-navy-deep py-24 text-white sm:py-32">
          <div aria-hidden className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgba(185,237,214,.14)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_50%_50%,black_10%,transparent_70%)]" />
          <Container className="relative flex flex-col items-center gap-6 text-center">
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

/** JSON-LD for a page: breadcrumb, FAQ, HowTo, and Article for guides. */
function pageSchemas(page: LandingPageData, trail: Array<{ label: string; href: string }>) {
  const url = `${site.url}${page.path}`;
  const out: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: trail.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: `${site.url}${c.href}` })),
    },
  ];
  for (const b of page.blocks) {
    if (b.kind === "faq")
      out.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: b.items.map((q) => ({ "@type": "Question", name: q.q, acceptedAnswer: { "@type": "Answer", text: plainText(q.a) } })),
      });
    if (b.kind === "steps" && b.howto)
      out.push({
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: b.title,
        step: b.items.map((s, n) => ({ "@type": "HowToStep", position: n + 1, name: s.title, text: plainText(s.body) })),
      });
  }
  if (page.article)
    out.push({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: page.hero.title,
      description: page.meta.description,
      inLanguage: "fr-FR",
      mainEntityOfPage: url,
      datePublished: page.article.published,
      dateModified: page.updated ?? page.article.published,
      timeRequired: `PT${page.article.readingMinutes}M`,
      author: { "@type": "Organization", name: "Suzali Conseil", url: site.footer.parent.url },
      publisher: { "@id": `${site.url}/#organisation` },
      image: `${site.url}/opengraph-image.png`,
      speakable: { "@type": "SpeakableSpecification", cssSelector: ["h1", ".answer-box"] },
    });
  return out;
}

/** Full page: header, hero, blocks, footer, plus the page's JSON-LD. */
export function LandingPage({ page, extra, children }: { page: LandingPageData; extra?: object[]; children?: ReactNode }) {
  const trail = [{ label: "Accueil", href: "/" }, ...(page.parent ? [page.parent] : []), { label: page.breadcrumb, href: page.path }];
  const schemas = [...pageSchemas(page, trail), ...(extra ?? [])];
  const { hero } = page;

  return (
    <>
      {schemas.map((s, i) => (
        <JsonLd key={i} data={s} />
      ))}
      {page.article ? <ReadingProgress /> : null}
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <section aria-labelledby="page-title" className="relative overflow-hidden pt-10 pb-20 sm:pt-14 sm:pb-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[560px] [background-image:radial-gradient(rgba(17,47,53,.12)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_30%_20%,black_20%,transparent_70%)]"
          />
          <div aria-hidden className="pointer-events-none absolute -top-24 right-[-10%] h-[520px] w-[620px] rounded-full bg-[radial-gradient(closest-side,rgba(185,237,214,.6),rgba(185,237,214,0))]" />
          <Container className="relative">
            <Breadcrumbs trail={trail} />
            <div className={cx("mt-10 grid gap-12 lg:items-end lg:gap-16", hero.visual ? "lg:grid-cols-[1fr_520px]" : "lg:grid-cols-[1fr_380px]")}>
              <div className="flex flex-col gap-6">
                <Eyebrow>{hero.eyebrow}</Eyebrow>
                <h1 id="page-title" className="font-display-tight max-w-[18ch] text-[clamp(2.75rem,6.4vw,5rem)] leading-[1] font-light text-ink">
                  {hero.title}
                </h1>
                <p className="max-w-[58ch] text-lg leading-relaxed text-muted sm:text-xl">
                  <RichText text={hero.lead} />
                </p>
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
                {page.updated ? (
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                    <span>
                      Par <a href={site.footer.parent.url} className="font-medium text-ink/80 underline-offset-4 hover:underline">l&apos;équipe Suzali Conseil</a>
                    </span>
                    <span aria-hidden>·</span>
                    <span>
                      Mis à jour le <time dateTime={page.updated}>{dateFr(page.updated)}</time>
                    </span>
                    {page.article ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{page.article.readingMinutes} min de lecture</span>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
              {hero.visual ? (
                <Image
                  src={hero.visual.src}
                  alt={hero.visual.alt}
                  width={hero.visual.width}
                  height={hero.visual.height}
                  priority
                  sizes="(min-width: 1024px) 520px, 100vw"
                  className="h-auto w-full drop-shadow-[0_30px_50px_rgba(12,31,35,.18)]"
                />
              ) : hero.bullets ? (
                <ul className="flex flex-col gap-3 rounded-[24px] border border-line bg-white/90 p-6 text-[15px] shadow-[0_18px_40px_-30px_rgba(12,31,35,.35)] backdrop-blur">
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
      <StickyCta label={hero.primary.label} href={hero.primary.href} />
    </>
  );
}
