import { logos } from "@/content/home";
import { customers } from "@/content/brands";
import { BrandMark } from "@/components/ui/BrandMark";
import { ArrowLink, Container, Eyebrow } from "@/components/ui/primitives";

/** 4. Customer strip. Customers and logos live in content/brands.ts. */
export function LogoStrip() {
  return (
    <section aria-labelledby="logos-title" className="border-y border-line py-16 sm:py-20">
      <Container>
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="flex flex-col gap-4">
            <Eyebrow>{logos.eyebrow}</Eyebrow>
            <h2 id="logos-title" className="font-display-tight text-3xl font-light sm:text-4xl">
              {logos.title}
            </h2>
            <p className="text-muted">{logos.subtitle}</p>
          </div>
          <ArrowLink href={logos.action.href}>{logos.action.label}</ArrowLink>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
          {customers.map((c) => (
            <li
              key={c.domain}
              className="group flex h-24 items-center justify-center gap-3.5 rounded-[18px] border border-line bg-white/60 px-5 text-ink/75 transition-colors duration-300 hover:bg-white hover:text-ink"
            >
              <BrandMark
                brand={c}
                size={36}
                className="grayscale transition-[filter] duration-300 group-hover:grayscale-0"
              />
              <span className="font-display-tight text-[21px] leading-none font-normal whitespace-nowrap">{c.name}</span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
