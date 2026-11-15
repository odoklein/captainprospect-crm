import Link from "next/link";
import { finalCta } from "@/content/home";
import { demo } from "@/content/demo";
import { ButtonLink, Container } from "@/components/ui/primitives";

/**
 * 13. Final CTA: the last step of the call, a slot to book. Title and action on the left,
 * what the demo covers on the right (the list comes from content/demo.ts).
 */
export function FinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className="on-dark bg-navy py-20 text-white sm:py-28">
      <Container className="grid items-end gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-20">
        <div className="flex flex-col items-start gap-6">
          <h2 id="final-cta-title" className="font-display-tight max-w-[14ch] text-[clamp(2.5rem,5.6vw,4.5rem)] leading-[1] font-light">
            {finalCta.title}
          </h2>
          <p className="max-w-[46ch] text-lg text-white/80">{finalCta.subtitle}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-4">
            <ButtonLink href={finalCta.action.href} variant="light" size="lg" arrow>
              {finalCta.action.label}
            </ButtonLink>
            <Link href={finalCta.secondary.href} className="rounded-[6px] font-medium text-white underline decoration-white/40 underline-offset-4 transition-colors duration-150 hover:decoration-white">
              {finalCta.secondary.label}
            </Link>
          </div>
        </div>

        <div className="rounded-[24px] bg-paper p-6 text-ink sm:p-8">
          <p className="eyebrow text-muted">{finalCta.agendaTitle}</p>
          <ol className="mt-4 border-t border-line">
            {demo.points.map((p, i) => (
              <li key={p} className="flex gap-4 border-b border-line py-3.5 text-[16px]">
                <span aria-hidden className="pt-0.5 font-mono text-[12px] text-muted tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {p}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[14px] text-muted">{demo.subtitle}</p>
        </div>
      </Container>
    </section>
  );
}
