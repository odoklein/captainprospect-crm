"use client";

import { useState } from "react";
import { pricing } from "@/content/home";
import { billing, formatEuro, maxAnnualSavingPercent, plans, type BillingPeriod } from "@/content/pricing";
import { Icon } from "@/components/ui/Icon";
import { ButtonLink, Container, SectionHeader, cx } from "@/components/ui/primitives";

/** 11. Pricing: three plans, monthly/annual toggle (native radios). Prices come from content/pricing.ts. */
export function Pricing() {
  const [period, setPeriod] = useState<BillingPeriod>("annual");

  return (
    <section id="tarifs" aria-labelledby="pricing-title" className="border-t border-line bg-white py-24 sm:py-32">
      <Container>
        <SectionHeader id="pricing-title" eyebrow={pricing.eyebrow} title={pricing.title} subtitle={pricing.subtitle} align="center" />

        <fieldset className="mx-auto mt-10 flex w-fit rounded-full border border-line bg-paper p-1">
          <legend className="sr-only">{pricing.periodLegend}</legend>
          {(Object.keys(billing) as BillingPeriod[]).map((p) => (
            <label
              key={p}
              className={cx(
                "relative flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-medium transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-rose",
                period === p ? "bg-navy text-white" : "text-ink/75 hover:text-ink",
              )}
            >
              <input
                type="radio"
                name="billing-period"
                value={p}
                checked={period === p}
                onChange={() => setPeriod(p)}
                className="sr-only"
              />
              {billing[p].label}
              {p === "annual" ? (
                <span className={cx("rounded-full px-2 py-0.5 text-[12px]", period === p ? "bg-white/15 text-white" : "bg-ink/[.06] text-ink/75")}>
                  {pricing.saveLabel(maxAnnualSavingPercent)}
                </span>
              ) : null}
            </label>
          ))}
        </fieldset>
        <p className="sr-only" aria-live="polite">
          Prix affichés : facturation {billing[period].label.toLowerCase()}.
        </p>

        <ul className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => {
            const featured = Boolean(plan.highlight);
            const price = plan.price[period];
            return (
              <li
                key={plan.id}
                className={cx(
                  "relative flex flex-col rounded-[24px] border p-7 sm:p-8",
                  featured ? "on-dark border-navy bg-navy text-white" : "border-line bg-paper",
                )}
              >
                {featured ? (
                  <p className="absolute -top-3 left-8 rounded-full border border-rose bg-white px-3 py-1 text-[12px] font-medium text-navy">
                    {plan.highlight}
                  </p>
                ) : null}
                <h3 className="font-display-tight text-2xl font-normal">{plan.name}</h3>
                <p className={cx("mt-2 min-h-[3em] text-[15px] leading-relaxed", featured ? "text-white/75" : "text-muted")}>{plan.audience}</p>

                <p className="mt-6 flex items-baseline gap-2">
                  <span className="font-display-tight text-[56px] leading-none font-light">
                    {formatEuro(price)}
                  </span>
                  <span className={featured ? "text-white/75" : "text-muted"}>{pricing.perMonth}</span>
                </p>
                <p className={cx("mt-2 text-[14px]", featured ? "text-white/75" : "text-muted")}>
                  {period === "annual" ? pricing.annualTotal(formatEuro(price * 12)) : pricing.monthlyNote}
                </p>

                <div className={cx("mt-6 border-t pt-5 text-[14px]", featured ? "border-white/15" : "border-line")}>
                  <p className="font-medium">{pricing.usersIncluded(plan.seatsIncluded)}</p>
                  {plan.extraSeat ? (
                    <p className={featured ? "text-white/75" : "text-muted"}>
                      {pricing.extraSeat(formatEuro(plan.extraSeat.price), plan.extraSeat.limit)}
                    </p>
                  ) : null}
                  <p className={featured ? "text-white/75" : "text-muted"}>
                    {plan.setupFee.label} : {formatEuro(plan.setupFee.price)} HT
                  </p>
                </div>

                <ul className="mt-6 flex flex-1 flex-col gap-3 text-[15px]">
                  {plan.features.map((f) => {
                    const isHeading = f.endsWith(":");
                    return (
                      <li key={f} className={cx("flex gap-3", isHeading && "font-medium")}>
                        {isHeading ? null : (
                          <Icon name="check" className={cx("mt-1 size-4 shrink-0", featured ? "text-white" : "text-navy")} />
                        )}
                        <span>{f}</span>
                      </li>
                    );
                  })}
                </ul>

                <ButtonLink
                  href={`/demo?offre=${plan.id}`}
                  variant={featured ? "light" : "ghost"}
                  className="mt-8 w-full"
                  arrow={featured}
                >
                  {plan.cta}
                </ButtonLink>
              </li>
            );
          })}
        </ul>

        <p className="mx-auto mt-8 max-w-[70ch] text-center text-[14px] text-muted">{pricing.footnote}</p>
      </Container>
    </section>
  );
}
