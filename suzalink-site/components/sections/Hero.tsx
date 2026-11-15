import Link from "next/link";
import { cases, hero } from "@/content/home";
import { Icon } from "@/components/ui/Icon";
import { ButtonLink, Container } from "@/components/ui/primitives";
import { HeroCall } from "./HeroCall";

/**
 * 3. Hero. Text on the left (who it is for, title, the two ways in, the documented mission),
 * the live call console on the right. On a phone: text first, then the call pane alone.
 * No backdrop, no floating cards: the product is the picture.
 */
export function Hero() {
  const [line1, line2] = hero.titleLines;
  const stats = cases.featured.stats;
  return (
    <section aria-labelledby="hero-title" className="pt-10 pb-14 sm:pt-14 lg:pt-16 lg:pb-20">
      <Container className="grid items-center gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]">
        <div className="flex flex-col items-start">
          <p className="text-[15px] text-muted">{hero.audience}</p>
          <h1 id="hero-title" className="font-display-tight mt-5 text-[clamp(2.75rem,4.7vw,4.25rem)] leading-[0.98] font-light text-ink">
            <span className="block whitespace-nowrap">{line1}</span>
            <span className="block">
              {line2.replace(/\.$/, "")}
              <span className="text-rose">.</span>
            </span>
          </h1>
          <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-muted sm:text-[19px]">{hero.subtitle}</p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <ButtonLink href={hero.primary.href} size="lg" arrow className="w-full sm:w-auto">
              {hero.primary.label}
            </ButtonLink>
            <ButtonLink href={hero.secondary.href} size="lg" variant="ghost" className="w-full sm:w-auto">
              {hero.secondary.label}
            </ButtonLink>
          </div>

          {/* The documented mission, in three figures (content/home.ts → cases.featured). */}
          <Link
            href={hero.proof.href}
            className="group mt-10 block w-full max-w-[520px] rounded-[6px] border-t border-ink/15 pt-5"
          >
            <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[14px]">
              <span className="text-muted">{hero.proof.label}</span>
              <span className="inline-flex items-center gap-1.5 font-medium whitespace-nowrap text-navy underline-offset-4 group-hover:underline">
                {hero.proof.cta}
                <Icon name="arrowRight" className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
              </span>
            </span>
            <span className="mt-3 flex gap-8 sm:gap-10">
              {stats.map((s) => (
                <span key={s.label} className="flex flex-col">
                  <span className="font-display-tight text-[30px] leading-none font-light text-ink tabular-nums sm:text-[34px]">{s.value}</span>
                  <span className="mt-1.5 text-[13px] text-muted">{s.label}</span>
                </span>
              ))}
            </span>
          </Link>
        </div>

        <HeroCall />
      </Container>
    </section>
  );
}
