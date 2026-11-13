import { doors } from "@/content/home";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/motion";
import { ButtonLink, Container, SectionHeader, cx } from "@/components/ui/primitives";

/** Just below the hero: the two ways to work with Suzalink (service or software). */
export function Doors() {
  return (
    <section aria-labelledby="doors-title" className="pb-24 sm:pb-32">
      <Container>
        <Reveal>
          <SectionHeader id="doors-title" eyebrow={doors.eyebrow} title={doors.title} align="center" />
        </Reveal>
        <ul className="mt-12 grid gap-5 md:grid-cols-2">
          {doors.items.map((d, i) => {
            const dark = i === 0;
            return (
              <li
                key={d.title}
                className={cx(
                  "flex flex-col rounded-[28px] border p-8 sm:p-10",
                  dark ? "on-dark border-navy bg-navy text-white" : "border-line bg-white",
                )}
              >
                <p className={cx("eyebrow", dark ? "text-mint" : "text-muted")}>{d.eyebrow}</p>
                <h3 className="font-display-tight mt-4 text-[clamp(1.9rem,3.4vw,2.6rem)] leading-[1.05] font-light">{d.title}</h3>
                <p className={cx("mt-4 max-w-[46ch] text-[17px] leading-relaxed", dark ? "text-white/80" : "text-muted")}>{d.body}</p>
                <ul className="mt-6 flex flex-1 flex-col gap-3 text-[15px]">
                  {d.points.map((p) => (
                    <li key={p} className="flex gap-3">
                      <span aria-hidden className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", dark ? "bg-mint text-navy" : "bg-navy text-white")}>
                        <Icon name="check" className="size-3" />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
                <ButtonLink href={d.action.href} variant={dark ? "light" : "primary"} arrow className="mt-8 w-fit">
                  {d.action.label}
                </ButtonLink>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
