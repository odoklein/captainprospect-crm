import { stack } from "@/content/home";
import { formatEuro, stackComparison, stackTotal, startingPrice } from "@/content/pricing";
import { tools } from "@/content/brands";
import { Logo } from "@/components/brand/Logo";
import { BrandMark } from "@/components/ui/BrandMark";
import { Container, SectionHeader } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/motion";

const range = (min: number, max: number) => `${formatEuro(min).replace(/\s?€/, "")}–${formatEuro(max)}`;

/** 8. "Le stack morcelé vous coûte 4×": big number + comparison table, on a navy band. */
export function StackCost() {
  return (
    <section id="cout" aria-labelledby="stack-title" className="on-dark bg-navy py-24 text-white sm:py-32">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
          <Reveal className="flex min-w-0 flex-col gap-12">
            <SectionHeader
              id="stack-title"
              eyebrow={stack.eyebrow}
              title={stack.title}
              subtitle={stack.subtitle}
              action={stack.action}
              tone="dark"
            />
            <div className="border-t border-white/15 pt-8">
              <p className="eyebrow text-white/70">Suzalink, dès</p>
              <p className="font-display-tight mt-2 text-[clamp(5rem,12vw,9.5rem)] leading-[0.9] font-light">
                {formatEuro(startingPrice)}
              </p>
              <p className="mt-4 max-w-[36ch] text-white/75">{stack.bigNumberCaption}</p>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="min-w-0 self-center">
            <div className="overflow-x-auto rounded-[20px] border border-white/15 bg-white/[.04]">
              <table className="w-full min-w-[460px] border-collapse text-left">
                <caption className="px-6 pt-6 pb-2 text-left text-[15px] text-white/75">{stack.tableCaption}</caption>
                <thead>
                  <tr className="eyebrow text-white/70">
                    <th scope="col" className="px-6 py-3 font-medium">
                      {stack.columns.tool}
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      {stack.columns.use}
                    </th>
                    <th scope="col" className="px-6 py-3 text-right font-medium">
                      {stack.columns.price}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stackComparison.rows.map((row) => (
                    <tr key={row.tool} className="border-t border-white/10">
                      <th scope="row" className="px-6 py-4 font-medium">
                        <span className="flex items-center gap-3">
                          <span className="flex -space-x-1.5">
                            {row.logos.map((id) => (
                              <BrandMark key={id} brand={tools[id]} size={24} className="rounded-[7px] bg-white ring-2 ring-navy" />
                            ))}
                          </span>
                          {row.tool}
                        </span>
                      </th>
                      <td className="px-3 py-4 text-white/75">{row.use}</td>
                      <td className="px-6 py-4 text-right font-mono text-[15px] whitespace-nowrap">{range(row.min, row.max)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/30">
                    <th scope="row" colSpan={2} className="px-6 py-4 font-semibold">
                      {stack.totalLabel}
                    </th>
                    <td className="px-6 py-4 text-right font-mono text-[15px] font-semibold whitespace-nowrap">
                      ≈ {range(stackTotal.min, stackTotal.max)}
                    </td>
                  </tr>
                  <tr className="bg-white text-ink">
                    <th scope="row" className="relative px-6 py-5 font-semibold">
                      <span aria-hidden className="absolute top-3 bottom-3 left-0 w-1 rounded-r-full bg-rose" />
                      <span className="flex items-center gap-3">
                        <Logo className="h-7 w-auto" title="" />
                        {stack.oursLabel}
                      </span>
                    </th>
                    <td className="px-3 py-5 text-muted">{stack.oursUse}</td>
                    <td className="px-6 py-5 text-right font-mono text-[15px] font-semibold whitespace-nowrap text-navy">
                      dès {formatEuro(startingPrice)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-white/65">{stackComparison.footnote}</p>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
