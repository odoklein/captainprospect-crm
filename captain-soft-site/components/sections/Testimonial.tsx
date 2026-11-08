import { testimonial } from "@/content/home";
import { ArrowLink, Container, Eyebrow, PlaceholderBadge } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/motion";

/** 10. Large testimonial. Placeholder until a real, approved quote exists. */
export function Testimonial() {
  return (
    <section aria-labelledby="testimonial-title" className="pb-24 sm:pb-32">
      <Container>
        <Reveal>
          <figure className="grid gap-10 rounded-[24px] border border-line bg-white p-8 sm:p-12 lg:grid-cols-[260px_1fr] lg:gap-16 lg:p-16">
            <div className="flex flex-col items-start gap-6">
              <Eyebrow>
                <span id="testimonial-title">{testimonial.eyebrow}</span>
              </Eyebrow>
              <div className="grid h-24 w-full max-w-[220px] place-items-center rounded-[16px] border border-dashed border-ink/20 bg-ink/[.02]">
                <span className="eyebrow text-muted">{testimonial.logoLabel} · TODO</span>
              </div>
              <PlaceholderBadge>{testimonial.placeholderBadge}</PlaceholderBadge>
            </div>
            <div className="flex flex-col gap-8">
              <blockquote className="font-display-tight text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.15] font-light text-ink">
                <p>« {testimonial.quote} »</p>
              </blockquote>
              <figcaption className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="font-semibold">{testimonial.name}</p>
                  <p className="text-muted">{testimonial.role}</p>
                </div>
                <ArrowLink href={testimonial.action.href}>{testimonial.action.label}</ArrowLink>
              </figcaption>
            </div>
          </figure>
        </Reveal>
      </Container>
    </section>
  );
}
