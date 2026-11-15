import Image from "next/image";
import { security } from "@/content/home";
import { resolveImage } from "@/lib/resolve-image";
import { Icon } from "@/components/ui/Icon";
import { Container, SectionHeader } from "@/components/ui/primitives";

/** 12. Security band: the heading on the left, the four guarantees as a spec sheet on the right. */
export function Security() {
  const texture = resolveImage("securityTexture");
  return (
    <section id="securite" aria-labelledby="security-title" className="on-dark relative overflow-hidden bg-navy-deep py-20 text-white sm:py-28">
      {texture ? (
        <Image src={texture.src} alt="" fill sizes="100vw" loading="lazy" className="pointer-events-none object-cover opacity-20" />
      ) : null}
      <Container className="relative">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-20">
          <SectionHeader id="security-title" title={security.title} subtitle={security.subtitle} action={security.action} tone="dark" />
          <dl className="self-end border-t border-white/20">
            {security.badges.map((b) => (
              <div key={b.title} className="grid gap-x-6 gap-y-1 border-b border-white/20 py-5 sm:grid-cols-[200px_minmax(0,1fr)] sm:py-6">
                <dt className="flex items-center gap-3 font-display-tight text-xl font-normal">
                  <Icon name={b.icon} className="size-5 shrink-0 text-mint" />
                  {b.title}
                </dt>
                <dd className="text-[16px] leading-relaxed text-white/75">{b.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </section>
  );
}
