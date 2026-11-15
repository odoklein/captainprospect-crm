import Link from "next/link";
import { cases } from "@/content/home";
import { sectors, contacts } from "@/content/pages/secteurs";
import { resolveImage } from "@/lib/resolve-image";
import { Icon } from "@/components/ui/Icon";
import { PhotoFrame } from "@/components/ui/PhotoFrame";
import { Container, SectionHeader } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/motion";

/**
 * 9. Our missions: the one documented mission with its real figures, and the targets we are
 * calling right now (no figures until the mission ends). Lists come from content/pages/secteurs.ts.
 */
export function CaseStudies() {
  const f = cases.featured;
  const running = [...sectors, ...contacts].filter((t) => t.state === "running");
  return (
    <section id="cas-clients" aria-labelledby="cases-title" className="py-24 sm:py-32">
      <Container>
        <Reveal>
          <SectionHeader id="cases-title" eyebrow={cases.eyebrow} title={cases.title} subtitle={cases.subtitle} action={cases.action} actionVariant="ghost" />
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Reveal className="min-w-0">
            <article className="group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-line bg-white">
              <PhotoFrame
                image={resolveImage(f.image)}
                sizes="(min-width: 1024px) 680px, 100vw"
                className="aspect-[16/9]"
                imgClassName="transition-transform duration-300 ease-out group-hover:scale-[1.02]"
              />
              <div className="flex flex-1 flex-col gap-4 p-6 sm:p-8">
                <p className="eyebrow flex items-center gap-2 text-muted">
                  <span className="inline-flex items-center gap-1 rounded-full bg-mint/70 px-2 py-0.5 text-[11px] font-medium tracking-normal text-navy normal-case">
                    <Icon name="check" className="size-3" /> Chiffres publiés
                  </span>
                  {f.eyebrow}
                </p>
                <h3 className="font-display-tight max-w-[22ch] text-[clamp(1.6rem,2.6vw,2.1rem)] leading-tight font-light text-ink">{f.title}</h3>
                <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[16px] border border-line bg-line">
                  {f.stats.map((s) => (
                    <div key={s.label} className="flex flex-col-reverse bg-paper px-4 py-3">
                      <dt className="text-[13px] text-muted">{s.label}</dt>
                      <dd className="font-display-tight text-[28px] leading-none font-light text-ink tabular-nums">{s.value}</dd>
                    </div>
                  ))}
                </dl>
                <Link href={f.href} className="mt-auto inline-flex items-center gap-1.5 pt-2 font-medium text-navy after:absolute after:inset-0 hover:underline">
                  {f.cta}
                  <span className="sr-only"> : {f.title}</span>
                  <Icon name="arrowRight" className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </div>
            </article>
          </Reveal>

          <Reveal delay={0.08} className="min-w-0">
            <div className="flex h-full min-w-0 flex-col rounded-[24px] border border-line bg-white p-6 sm:p-8">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <span aria-hidden className="relative flex size-2">
                  <span className="absolute inline-flex size-full rounded-full bg-rose opacity-70 motion-safe:animate-ping" />
                  <span className="relative inline-flex size-2 rounded-full bg-rose" />
                </span>
                {cases.runningTitle}
              </p>
              <ul className="mt-5 flex flex-col">
                {running.map((t) => (
                  <li key={t.path} className="border-t border-line first:border-t-0">
                    <Link href={t.path} className="group/row flex items-center gap-4 rounded-[14px] py-4 transition-colors duration-200 hover:bg-paper sm:px-2">
                      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-mint/60 text-navy transition-colors duration-200 group-hover/row:bg-navy group-hover/row:text-white">
                        <Icon name={t.icon} className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-ink">{t.name}</span>
                        <span className="block truncate text-[14px] text-muted">{t.card}</span>
                      </span>
                      <Icon name="arrowRight" className="size-4 shrink-0 text-navy transition-transform duration-200 group-hover/row:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={cases.runningCta.href}
                className="mt-auto inline-flex items-center gap-1.5 border-t border-line pt-5 font-medium text-navy hover:underline"
              >
                {cases.runningCta.label}
                <Icon name="arrowRight" className="size-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
