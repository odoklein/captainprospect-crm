"use client";

// Small client-side pieces for the inside pages. Every effect is decorative and stops
// when the visitor asks for reduced motion; the content is always in the HTML.
import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { cx } from "@/components/ui/primitives";

/** Card with a soft mint light that follows the pointer, plus a lift on hover. */
export function Spotlight({
  children,
  className,
  as: Comp = "div",
  tone = "light",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
  tone?: "light" | "dark";
}) {
  const onMove = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
  };
  return (
    <Comp
      onPointerMove={onMove}
      className={cx(
        "spotlight group/card relative isolate transition-[transform,box-shadow,border-color] duration-300 ease-out motion-safe:hover:-translate-y-1",
        tone === "dark" ? "spotlight-dark" : "hover:border-navy/25 hover:shadow-[0_24px_48px_-28px_rgba(12,31,35,.35)]",
        className,
      )}
    >
      {children}
    </Comp>
  );
}

/** Counts up to a number the first time it scrolls into view ("5 174", "20+", "≈ 20"). */
export function CountUp({ value }: { value: string }) {
  const match = value.match(/^(\D*)([\d\s ]+)(.*)$/);
  const target = match ? Number(match[2].replace(/\D/g, "")) : NaN;
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !match || !Number.isFinite(target) || target < 10) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const format = (n: number) => `${match[1]}${new Intl.NumberFormat("fr-FR").format(n)}${match[3]}`;
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / 1100);
          setShown(format(Math.round(target * (1 - Math.pow(1 - t, 3)))));
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span ref={ref} className="tabular-nums">
      <span aria-hidden>{shown}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}

/** Sticky table of contents that highlights the section being read. */
export function Toc({ items }: { items: Array<{ id: string; title: string }> }) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => Boolean(e));
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav aria-label="Sommaire" className="sticky top-28">
      <p className="eyebrow text-muted">Sommaire</p>
      <ol className="mt-4 flex flex-col gap-1 border-l border-line">
        {items.map((i, n) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? "true" : undefined}
              className="-ml-px flex gap-3 border-l-2 border-transparent py-1.5 pl-4 text-[14px] leading-snug text-muted transition-colors hover:text-ink aria-[current=true]:border-navy aria-[current=true]:font-medium aria-[current=true]:text-ink"
            >
              <span className="font-mono text-[12px] text-muted/80">{String(n + 1).padStart(2, "0")}</span>
              {i.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Thin reading-progress bar under the header (guides). */
export function ReadingProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      ref.current?.style.setProperty("transform", `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  return <div ref={ref} aria-hidden className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left scale-x-0 bg-rose" />;
}

/** Phone-only action bar that appears once the hero is out of view. */
export function StickyCta({ label, href }: { label: string; href: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 640);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div
      className={cx(
        "fixed inset-x-3 bottom-3 z-40 transition-[transform,opacity] duration-300 sm:hidden",
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0",
      )}
    >
      <a
        href={href}
        tabIndex={show ? 0 : -1}
        className="flex h-14 items-center justify-between rounded-full bg-navy pr-2 pl-6 text-[15px] font-medium text-white shadow-[0_18px_40px_-14px_rgba(7,21,24,.6)]"
      >
        {label}
        <span aria-hidden className="grid size-10 place-items-center rounded-full bg-rose text-navy">
          →
        </span>
      </a>
    </div>
  );
}
