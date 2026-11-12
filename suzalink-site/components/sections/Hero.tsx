import { hero } from "@/content/home";
import { resolveImage } from "@/lib/resolve-image";
import { SdrQueueMockup } from "@/components/mockups/SdrQueueMockup";
import { PhotoFrame } from "@/components/ui/PhotoFrame";
import Image from "next/image";
import { ButtonLink, Container } from "@/components/ui/primitives";
import { HeroCards } from "./HeroCards";

/** 3. Centred hero: app icon, audience pill, title, actions, floating product cards
 *  (xl screens), then the wide photo frame holding the SDR workspace mockup. */
export function Hero() {
  const [line1, line2] = hero.titleLines;
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden pt-7 pb-16 sm:pt-9 lg:pt-10 lg:pb-24">
      {/* Dotted grid fading out, with a soft mint glow behind the icon. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[760px] [background-image:radial-gradient(rgba(17,47,53,.13)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_50%_30%,black_25%,transparent_72%)]"
      />
      <div aria-hidden className="pointer-events-none absolute top-0 left-1/2 h-[560px] w-[min(820px,100%)] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(185,237,214,.75),rgba(185,237,214,0))]" />

      <Container className="relative flex flex-col items-center text-center">
        <HeroCards />
        <Image
          src="/brand/app-icon.png"
          alt=""
          width={112}
          height={112}
          priority
          className="size-[64px] drop-shadow-[0_18px_30px_rgba(17,47,53,.28)] sm:size-[80px]"
        />
        <p className="mt-6 inline-flex items-center gap-3 rounded-full border border-line bg-white/80 py-1.5 pr-4 pl-4 text-[13px] sm:pl-1.5 sm:text-[14px] text-ink shadow-[0_8px_24px_-18px_rgba(12,31,35,.4)] backdrop-blur">
          <span aria-hidden className="hidden -space-x-2 sm:flex">
            <span className="grid size-7 place-items-center rounded-full border-2 border-white bg-mint text-navy">
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
            </span>
            <span className="grid size-7 place-items-center rounded-full border-2 border-white bg-navy text-white">
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
            </span>
            <span className="grid size-7 place-items-center rounded-full border-2 border-white bg-rose text-navy">
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16v14H4zM8 3v4M16 3v4M4 10h16" /></svg>
            </span>
          </span>
          <span className="hidden h-4 w-px bg-line sm:block" aria-hidden />
          {hero.audience}
        </p>
        <h1
          id="hero-title"
          className="font-display-tight mt-6 text-[clamp(2.75rem,7vw,5.25rem)] leading-[0.95] font-light text-ink"
        >
          <span className="block">{line1}</span>
          <span className="block text-navy">
            {line2.replace(/\.$/, "")}
            <span className="text-rose">.</span>
          </span>
        </h1>
        <p className="mt-5 max-w-[40ch] text-lg leading-relaxed text-muted sm:text-xl">{hero.subtitle}</p>
        <div className="mt-7 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <ButtonLink href={hero.primary.href} size="lg" arrow className="w-full sm:w-auto">
            {hero.primary.label}
          </ButtonLink>
          <ButtonLink href={hero.secondary.href} size="lg" variant="ghost" className="w-full sm:w-auto">
            {hero.secondary.label}
          </ButtonLink>
        </div>
      </Container>

      <Container className="mt-12 sm:mt-14">
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
