import { logos } from "@/content/home";
import { customers } from "@/content/brands";
import { BrandMark } from "@/components/ui/BrandMark";
import { Container } from "@/components/ui/primitives";

/** 4. Customers, on one line right under the hero. Customers and logos live in content/brands.ts. */
export function LogoStrip() {
  return (
    <section aria-labelledby="logos-title" className="border-y border-line">
      <Container className="flex flex-col gap-x-12 gap-y-5 py-7 lg:flex-row lg:items-center">
        <div className="shrink-0 lg:max-w-[240px]">
          <h2 id="logos-title" className="text-[15px] font-medium text-ink">
            {logos.title}
          </h2>
          <p className="text-[14px] text-muted">{logos.subtitle}</p>
        </div>
        <ul className="flex flex-1 flex-wrap items-center gap-x-8 gap-y-4 lg:justify-end lg:gap-x-10">
          {customers.map((c) => (
            <li key={c.domain} className="group flex items-center gap-3 text-ink/75 transition-colors duration-200 hover:text-ink">
              <BrandMark brand={c} size={30} className="grayscale transition-[filter] duration-200 group-hover:grayscale-0" />
              <span className="font-display-tight text-[18px] leading-none font-normal whitespace-nowrap sm:text-[19px]">{c.name}</span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
