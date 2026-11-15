import { doors } from "@/content/home";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { ButtonLink, Container, SectionHeader, cx } from "@/components/ui/primitives";

/**
 * The two ways to work with Suzalink (service or software), as the two halves of one panel:
 * the visitor picks a side. Each half ends on its own action.
 */
export function Doors() {
  return (
    <section aria-labelledby="doors-title" className="py-20 sm:py-28">
      <Container>
        <SectionHeader id="doors-title" title={doors.title} />
        <ul className="mt-10 grid overflow-hidden rounded-[28px] border border-line sm:mt-12 md:grid-cols-2">
          {doors.items.map((d, i) => {
            const dark = i === 0;
            return (
              <li key={d.title} className={cx("bi-host flex flex-col p-7 sm:p-10 lg:p-12", dark ? "on-dark bg-navy text-white" : "bg-white")}>
                <div className="flex items-center justify-between gap-4">
                  <p className={cx("eyebrow", dark ? "text-mint" : "text-muted")}>{d.eyebrow}</p>
                  <BrandIcon name={dark ? "phoneRing" : "dashboard"} tone={dark ? "dark" : "light"} className="size-12" />
                </div>
                <h3 className="font-display-tight mt-6 max-w-[14ch] text-[clamp(2rem,3.6vw,2.875rem)] leading-[1.02] font-light">{d.title}</h3>
                <p className={cx("mt-5 max-w-[44ch] text-[17px] leading-relaxed", dark ? "text-white/80" : "text-muted")}>{d.body}</p>
                <ul className={cx("mt-8 flex flex-1 flex-col border-t text-[15px]", dark ? "border-white/15" : "border-line")}>
                  {d.points.map((p) => (
                    <li key={p} className={cx("border-b py-3.5", dark ? "border-white/15 text-white/90" : "border-line text-ink/85")}>
                      {p}
                    </li>
                  ))}
                </ul>
                <ButtonLink href={d.action.href} variant={dark ? "light" : "primary"} className="mt-8 w-full sm:w-fit">
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
