import { hero } from "@/content/home";
import { resolveImage } from "@/lib/resolve-image";
import { SdrQueueMockup } from "@/components/mockups/SdrQueueMockup";
import { PhotoFrame } from "@/components/ui/PhotoFrame";
import { ButtonLink, Container, Eyebrow } from "@/components/ui/primitives";

/** 3. Centred hero + wide photo frame holding the SDR workspace mockup. */
export function Hero() {
  const [line1, line2] = hero.titleLines;
  return (
    <section aria-labelledby="hero-title" className="pt-14 pb-20 sm:pt-20 lg:pt-24 lg:pb-28">
      <Container className="flex flex-col items-center text-center">
        <Eyebrow>{hero.eyebrow}</Eyebrow>
        <h1
          id="hero-title"
          className="font-display-tight mt-6 text-[clamp(3rem,8.4vw,6rem)] leading-[0.95] font-light text-ink"
        >
          <span className="block">{line1}</span>
          <span className="block text-navy">
            {line2.replace(/\.$/, "")}
            <span className="text-rose">.</span>
          </span>
        </h1>
        <p className="mt-7 max-w-[40ch] text-lg leading-relaxed text-muted sm:text-xl">{hero.subtitle}</p>
        <div className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <ButtonLink href={hero.primary.href} size="lg" arrow className="w-full sm:w-auto">
            {hero.primary.label}
          </ButtonLink>
          <ButtonLink href={hero.secondary.href} size="lg" variant="ghost" className="w-full sm:w-auto">
            {hero.secondary.label}
          </ButtonLink>
        </div>
      </Container>

      <Container className="mt-14 sm:mt-20">
        <PhotoFrame
          image={resolveImage("heroNature")}
          priority
          sizes="(min-width: 1240px) 1200px, 100vw"
          className="rounded-[24px] px-3 pt-10 pb-0 sm:px-10 sm:pt-16 lg:px-16 lg:pt-20"
          overlay={<div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/20" />}
        >
          <div className="animate-float mx-auto max-w-[1040px] translate-y-6 sm:translate-y-10">
            <SdrQueueMockup label={hero.mockupLabel} />
          </div>
        </PhotoFrame>
      </Container>
    </section>
  );
}
