import type { Metadata } from "next";
import { demo } from "@/content/demo";
import { DemoForm } from "@/components/DemoForm";
import { Icon } from "@/components/ui/Icon";
import { Container, Eyebrow } from "@/components/ui/primitives";
import { SiteHeader } from "@/components/sections/SiteHeader";
import { Footer } from "@/components/sections/Footer";

export const metadata: Metadata = {
  title: demo.meta.title,
  description: demo.meta.description,
  alternates: { canonical: "/demo" },
  openGraph: { title: demo.meta.title, description: demo.meta.description, url: "/demo" },
};

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ offre?: string | string[] }> }) {
  const { offre } = await searchParams;
  const plan = typeof offre === "string" ? offre : undefined;

  return (
    <>
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <Container className="grid gap-12 py-16 sm:py-24 lg:grid-cols-[1fr_520px] lg:gap-20">
          <div className="flex flex-col gap-6">
            <Eyebrow>{demo.eyebrow}</Eyebrow>
            <h1 className="font-display-tight text-[clamp(2.75rem,6vw,4.5rem)] leading-[1] font-light">{demo.title}</h1>
            <p className="max-w-[44ch] text-lg text-muted">{demo.subtitle}</p>
            <ul className="mt-4 flex flex-col gap-3">
              {demo.points.map((p) => (
                <li key={p} className="flex gap-3">
                  <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-navy text-white">
                    <Icon name="check" className="size-3.5" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <DemoForm plan={plan} />
        </Container>
      </main>
      <Footer />
    </>
  );
}
