import Link from "next/link";
import { site } from "@/content/site";
import { Icon } from "@/components/ui/Icon";

/** 1. Navy announcement bar. */
export function AnnouncementBar() {
  const { badge, text, href } = site.announcement;
  return (
    <div className="on-dark bg-navy text-white">
      <div className="mx-auto flex max-w-[1240px] justify-center px-4 py-2.5">
        <Link href={href} className="group inline-flex items-center gap-3 text-[13.5px] leading-tight sm:text-sm">
          <span className="eyebrow rounded-full border border-white/30 px-2 py-0.5 text-[10px] text-white">{badge}</span>
          <span className="underline-offset-4 group-hover:underline">{text}</span>
          <Icon name="arrowRight" className="size-4 shrink-0 text-white transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
