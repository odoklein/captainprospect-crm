import Image from "next/image";
import { engines } from "@/content/home";
import { tools } from "@/content/brands";
import { BrandMark } from "@/components/ui/BrandMark";
import { AiMockup, ExecutionMockup, InstanceMockup } from "@/components/mockups/EngineMockups";
import { Icon } from "@/components/ui/Icon";
import { Container, SectionHeader, cx } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/motion";

const mockups = {
  execution: ExecutionMockup,
  ia: AiMockup,
  instance: InstanceMockup,
};

const tones = {
  navy: "on-dark bg-navy text-white",
  night: "on-dark bg-night text-white",
  light: "border border-line bg-white text-ink",
};

/** 6. "Une plateforme, trois moteurs": a wide execution card above two complementary feature cards. */
export function Engines() {
  return (
    <section id="produit" aria-labelledby="engines-title" className="py-24 sm:py-32">
      <Container>
        <Reveal>
          <SectionHeader
            id="engines-title"
            eyebrow={engines.eyebrow}
            title={engines.title}
            subtitle={engines.subtitle}
            action={engines.action}
            align="center"
          />
        </Reveal>

        <ol className="mt-12 grid gap-5 sm:mt-16 lg:grid-cols-2">
          {engines.items.map((item, i) => {
            const Mockup = mockups[item.id];
            const dark = item.tone !== "light";
            return (
              <li
                key={item.id}
                id={item.id}
                className={cx("min-w-0", i === 0 && "lg:col-span-2")}
              >
                <article
                  aria-labelledby={`${item.id}-title`}
                  className={cx(
                    "relative grid h-full gap-8 overflow-hidden rounded-[24px] p-6 sm:p-8 lg:p-10",
                    i === 0 && "lg:grid-cols-2 lg:items-center lg:gap-12",
                    tones[item.tone],
                  )}
                >
                  {item.tone === "night" ? (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -top-40 -right-32 size-[620px] rounded-full bg-[radial-gradient(closest-side,rgba(185,237,214,.22),rgba(185,237,214,0))]"
                    />
                  ) : null}
                  {item.tone === "navy" ? (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -bottom-48 -left-40 size-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,.08),rgba(255,255,255,0))]"
                    />
                  ) : null}

                  <div className="relative flex flex-col gap-5">
                    <Image src={`/creative/${item.id}.svg`} width={64} height={64} alt="" className="size-16" />
                    <p className={cx("eyebrow flex items-center gap-3", dark ? "text-white/70" : "text-muted")}>
                      <span className="font-mono">{item.index}</span>
                      <span aria-hidden className={cx("h-px w-8", dark ? "bg-white/30" : "bg-ink/20")} />
                      {item.eyebrow}
                    </p>
                    <h3 id={`${item.id}-title`} className="font-display-tight text-[clamp(2rem,3.6vw,3rem)] leading-[1.05] font-light">
                      {item.title}
                    </h3>
                    <p className={cx("max-w-[46ch] text-[17px] leading-relaxed", dark ? "text-white/75" : "text-muted")}>{item.body}</p>
                    <ul className="mt-2 flex flex-col gap-3">
                      {item.features.map((f) => (
                        <li key={f} className="flex gap-3">
                          <span
                            aria-hidden
                            className={cx(
                              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                              dark ? "bg-white/10 text-white" : "bg-navy/10 text-navy",
                            )}
                          >
                            <Icon name="check" className="size-3" />
                          </span>
                          <span className={dark ? "text-white/90" : "text-ink/85"}>{f}</span>
                        </li>
                      ))}
                    </ul>
                    {"integrations" in item ? (
                      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/15 pt-5">
                        <p className="eyebrow text-white/70">{item.integrations.label}</p>
                        <ul className="flex gap-2">
                          {item.integrations.tools.map((id) => (
                            <li key={id} className="flex items-center gap-2 rounded-full bg-white py-1 pr-3.5 pl-1 text-[14px] font-medium text-ink">
                              <BrandMark brand={tools[id]} size={24} className="rounded-full" />
                              {tools[id].name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>

                  <div className="relative min-w-0 self-end">
                    <Mockup label={item.mockupLabel} />
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      </Container>
    </section>
  );
}
