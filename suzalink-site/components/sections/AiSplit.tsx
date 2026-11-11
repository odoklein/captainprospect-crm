import { aiSplit } from "@/content/home";
import { resolveImage } from "@/lib/resolve-image";
import { PhotoFrame } from "@/components/ui/PhotoFrame";
import { SectionHeader } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/motion";

/** 5. Split band: text left, full-bleed warm photo of an SDR right. */
export function AiSplit() {
  return (
    <section aria-labelledby="ai-split-title" className="bg-sand">
      <div className="grid lg:min-h-[640px] lg:grid-cols-2">
        <div className="flex items-center px-4 py-20 sm:px-6 lg:py-28 lg:pr-16 lg:pl-[max(2rem,calc((100vw-1240px)/2+2rem))]">
          <Reveal>
            <SectionHeader
              id="ai-split-title"
              eyebrow={aiSplit.eyebrow}
              title={aiSplit.title}
              subtitle={aiSplit.subtitle}
              action={aiSplit.action}
            />
          </Reveal>
        </div>
        <PhotoFrame
          image={resolveImage("sdrHeadset")}
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="min-h-[420px] lg:min-h-full"
          imgClassName="saturate-[.9]"
          overlay={<div aria-hidden className="absolute inset-0 bg-[#C9864F]/15 mix-blend-multiply" />}
        />
      </div>
    </section>
  );
}
