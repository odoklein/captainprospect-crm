import { finalCta } from "@/content/home";
import { resolveImage } from "@/lib/resolve-image";
import { PhotoFrame } from "@/components/ui/PhotoFrame";
import { ButtonLink, Container, Eyebrow } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/motion";

/** 13. Final CTA over a full-bleed landscape with a dark overlay. */
export function FinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className="on-dark">
      <PhotoFrame
        image={resolveImage("ctaLandscape")}
        sizes="100vw"
        className="bg-navy-deep"
        overlay={<div aria-hidden className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(7,21,24,.15)_0%,rgba(17,47,53,.35)_100%)]" />}
      >
        <Container className="flex min-h-[560px] flex-col items-center justify-center py-24 text-center text-white sm:min-h-[640px]">
          <Reveal className="flex flex-col items-center gap-6">
            <Eyebrow tone="dark">{finalCta.eyebrow}</Eyebrow>
            <h2 id="final-cta-title" className="font-display-tight max-w-[16ch] text-[clamp(2.5rem,6vw,4.75rem)] leading-[1] font-light">
              {finalCta.title}
            </h2>
            <p className="max-w-[46ch] text-lg text-white/85">{finalCta.subtitle}</p>
            <ButtonLink href={finalCta.action.href} variant="light" size="lg" arrow className="mt-3">
              {finalCta.action.label}
            </ButtonLink>
          </Reveal>
        </Container>
      </PhotoFrame>
    </section>
  );
}
