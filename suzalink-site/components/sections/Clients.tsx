import { clients } from "@/content/home";
import { customers, type Brand } from "@/content/brands";
import { BrandMark } from "@/components/ui/BrandMark";
import { Container, SectionHeader, cx } from "@/components/ui/primitives";
import { frTypo } from "@/lib/typo";

type Quote = (typeof clients.quotes)[number];

/**
 * « Ils prospectent avec Suzalink » : the voices first, then the full client roster.
 * The first published quote leads on navy; the others stack beside it. Only quotes whose
 * company approved the text in writing are shown (content/home.ts → clients.quotes).
 */
export function Clients() {
  const brandOf = (domain: string) => customers.find((c) => c.domain === domain);
  const quotes = clients.quotes.filter((q) => q.published && brandOf(q.domain));
  const [lead, ...rest] = quotes;

  return (
    <section id="clients" aria-labelledby="clients-title" className="border-y border-line bg-white py-20 sm:py-24">
      <Container>
        <SectionHeader id="clients-title" title={clients.title} subtitle={clients.subtitle} layout="split" />

        {lead ? (
          <div className={cx("mt-12 grid gap-5", rest.length > 0 && "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]")}>
            <Voice quote={lead} brand={brandOf(lead.domain)!} lead />
            {rest.length > 0 ? (
              <div className="grid gap-5">
                {rest.map((q) => (
                  <Voice key={q.domain} quote={q} brand={brandOf(q.domain)!} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Everyone on Suzalink, quoted or not. */}
        <div className="mt-10 flex flex-col gap-x-10 gap-y-5 border-t border-line pt-7 md:flex-row md:items-center">
          <p className="eyebrow shrink-0 text-muted">{clients.rosterLabel}</p>
          <ul className="flex flex-wrap items-center gap-x-9 gap-y-4">
            {customers.map((c) => (
              <li key={c.domain} className="group flex items-center gap-3 text-ink/80 transition-colors duration-200 hover:text-ink">
                <BrandMark brand={c} size={28} className="grayscale transition-[filter] duration-200 group-hover:grayscale-0" />
                <span className="font-display-tight text-[18px] leading-none whitespace-nowrap">{c.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

function Voice({ quote, brand, lead = false }: { quote: Quote; brand: Brand; lead?: boolean }) {
  return (
    <figure
      className={cx(
        "flex flex-col justify-between gap-10 rounded-[24px] p-7 sm:p-10",
        lead ? "on-dark bg-navy text-white lg:p-12" : "border border-line bg-paper text-ink",
      )}
    >
      <blockquote
        className={cx(
          "font-display-tight font-light",
          lead ? "text-[clamp(1.5rem,2.6vw,2.125rem)] leading-[1.22]" : "text-[clamp(1.375rem,2.1vw,1.875rem)] leading-[1.25]",
        )}
      >
        <p>
          <span aria-hidden className={lead ? "text-rose" : "text-navy"}>«&nbsp;</span>
          {frTypo(quote.quote)}
          <span aria-hidden className={lead ? "text-rose" : "text-navy"}>&nbsp;»</span>
        </p>
      </blockquote>
      <figcaption className="flex items-center gap-4">
        <span className={cx("grid size-12 shrink-0 place-items-center rounded-[14px]", lead ? "bg-white" : "border border-line bg-white")}>
          <BrandMark brand={brand} size={30} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{brand.name}</span>
          <span className={cx("block text-[14px]", lead ? "text-white/75" : "text-muted")}>
            {quote.who} · {quote.relation}
          </span>
        </span>
        <span
          className={cx(
            "hidden shrink-0 rounded-full px-3 py-1 text-[12px] font-medium sm:inline",
            lead ? "border border-white/25 text-white/85" : "border border-line bg-white text-ink/80",
          )}
        >
          {quote.uses}
        </span>
      </figcaption>
    </figure>
  );
}
