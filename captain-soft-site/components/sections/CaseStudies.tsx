import Link from "next/link";
import { cases } from "@/content/home";
import { resolveImage } from "@/lib/resolve-image";
import { Icon } from "@/components/ui/Icon";
import { PhotoFrame } from "@/components/ui/PhotoFrame";
import { Container, PlaceholderBadge, SectionHeader } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/motion";

/** 9. Three case-study cards. Metrics are "XX" placeholders until real, approved results exist. */
export function CaseStudies() {
  return (
    <section id="cas-clients" aria-labelledby="cases-title" className="py-24 sm:py-32">
      <Container>
        <Reveal>
          <SectionHeader
            id="cases-title"
            eyebrow={cases.eyebrow}
            title={cases.title}
            subtitle={cases.subtitle}
            action={cases.action}
            actionVariant="ghost"
          />
        </Reveal>

        <ul className="mt-14 grid gap-6 md:grid-cols-3">
          {cases.items.map((item, i) => (
            <Reveal as="li" key={item.title} delay={i * 0.08}>
              <article className="group relative flex h-full flex-col overflow-hidden rounded-[20px] border border-line bg-white">
                <PhotoFrame
                  image={resolveImage(item.image)}
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="aspect-[4/3]"
                  imgClassName="transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <div className="flex flex-1 flex-col gap-3 p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="eyebrow text-muted">{item.eyebrow}</p>
                    <PlaceholderBadge>{cases.placeholderBadge}</PlaceholderBadge>
                  </div>
                  <h3 className="font-display-tight text-2xl leading-tight font-light">{item.title}</h3>
                  <Link
                    href={item.href}
                    className="mt-auto inline-flex items-center gap-1.5 pt-4 font-medium text-navy after:absolute after:inset-0 hover:underline"
                  >
                    {cases.readLabel}
                    <span className="sr-only"> : {item.title}</span>
                    <Icon name="arrowRight" className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </article>
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}
