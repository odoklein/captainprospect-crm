import Image from "next/image";
import { security } from "@/content/home";
import { resolveImage } from "@/lib/resolve-image";
import { Icon } from "@/components/ui/Icon";
import { Container, SectionHeader } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/motion";

/** 12. Security band on a deep navy gradient. */
export function Security() {
  const texture = resolveImage("securityTexture");
  return (
    <section
      id="securite"
      aria-labelledby="security-title"
      className="on-dark relative overflow-hidden bg-[linear-gradient(155deg,#0B2126_0%,#112F35_55%,#081A1E_100%)] py-24 text-white sm:py-32"
    >
      {texture ? (
        <Image
          src={texture.src}
          alt=""
          fill
          sizes="100vw"
          loading="lazy"
          className="pointer-events-none object-cover opacity-40 mix-blend-luminosity"
        />
      ) : null}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(70%_60%_at_70%_40%,black,transparent)]"
      />
      <Container className="relative">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.2fr] lg:items-end lg:gap-20">
          <Reveal>
            <SectionHeader
              id="security-title"
              eyebrow={security.eyebrow}
              title={security.title}
              subtitle={security.subtitle}
              action={security.action}
              tone="dark"
            />
          </Reveal>
          <ul className="grid gap-4 sm:grid-cols-2">
            {security.badges.map((b, i) => (
              <Reveal as="li" key={b.title} delay={i * 0.06}>
                <div className="flex h-full flex-col gap-4 rounded-[20px] border border-white/15 bg-white/[.05] p-6 backdrop-blur-sm">
                  <span className="grid size-11 place-items-center rounded-full border border-white/20 text-white">
                    <Icon name={b.icon} className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-display-tight text-xl font-normal">{b.title}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-white/75">{b.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
