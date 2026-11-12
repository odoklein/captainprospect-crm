"use client";

// Desktop mega menu (Produit, Solutions, Ressources) and the matching mobile accordions.
// Panels open on hover (with a short intent delay), on click, or with the keyboard
// (Enter, Space, ArrowDown), and close on Escape, outside click, pointer leave or navigation.
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { menu, type MenuFeature, type MenuItem, type MenuLink } from "@/content/menu";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";

type Panel = Extract<MenuItem, { columns: unknown }>;
const isPanel = (item: MenuItem): item is Panel => "columns" in item;

const ease = [0.16, 1, 0.3, 1] as const;

const linksOf = (item: Panel) => [
  ...item.columns.flatMap((c) => c.links),
  ...(item.feature ? [item.feature] : []),
  ...(item.footer ?? []),
];

function matches(pathname: string, href: string) {
  const path = href.split("#")[0];
  if (!path || path === "/" || href.startsWith("http")) return false;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function ListLink({ link, delay, onNavigate }: { link: MenuLink; delay: number; onNavigate: () => void }) {
  return (
    <m.li initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay, ease }}>
      <Link
        href={link.href}
        onClick={onNavigate}
        className="group/link flex items-center gap-3 rounded-[12px] px-2.5 py-2 text-[15px] font-medium text-ink transition-colors duration-200 hover:bg-mint/35 focus-visible:bg-mint/35"
      >
        {link.icon ? (
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-paper text-navy ring-1 ring-line transition-[background-color,color,transform] duration-200 group-hover/link:-rotate-6 group-hover/link:bg-navy group-hover/link:text-white group-hover/link:ring-navy">
            <Icon name={link.icon} className="size-[18px]" />
          </span>
        ) : null}
        <span className="flex-1">{link.label}</span>
        <Icon name="arrowRight" className="size-4 -translate-x-1 text-navy opacity-0 transition-[opacity,transform] duration-200 group-hover/link:translate-x-0 group-hover/link:opacity-100" />
      </Link>
    </m.li>
  );
}

function CardLink({ link, delay, onNavigate }: { link: MenuLink; delay: number; onNavigate: () => void }) {
  return (
    <m.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay, ease }}>
      <Link
        href={link.href}
        onClick={onNavigate}
        className="group/card flex h-full flex-col rounded-[18px] border border-line bg-white p-5 transition-[transform,border-color,box-shadow,background-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-navy/20 hover:bg-[linear-gradient(160deg,rgba(185,237,214,.45),#fff_70%)] hover:shadow-[0_18px_36px_-24px_rgba(12,31,35,.4)]"
      >
        {link.image ? (
          <span className="relative mb-4 block aspect-[16/10] overflow-hidden rounded-[12px] bg-[radial-gradient(ellipse_at_50%_45%,rgba(185,237,214,.85),rgba(185,237,214,.2)_72%)]">
            <Image
              src={link.image}
              alt=""
              fill
              loading="eager"
              sizes="360px"
              className="object-contain p-3 transition-transform duration-500 ease-out group-hover/card:scale-[1.04]"
            />
          </span>
        ) : null}
        <span className="flex items-center justify-between">
          {link.icon ? (
            <span className="grid size-10 place-items-center rounded-[12px] bg-mint/60 text-navy transition-[background-color,color,transform] duration-300 group-hover/card:-rotate-6 group-hover/card:bg-navy group-hover/card:text-white">
              <Icon name={link.icon} className="size-5" />
            </span>
          ) : null}
          <Icon name="arrowUpRight" className="size-4 text-muted transition-[color,transform] duration-300 group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5 group-hover/card:text-navy" />
        </span>
        <span className="mt-4 text-[16px] font-semibold text-ink">{link.label}</span>
        {link.body ? <span className="mt-1.5 text-[14px] leading-relaxed text-muted">{link.body}</span> : null}
      </Link>
    </m.li>
  );
}

function FeatureCard({ feature, onNavigate }: { feature: MenuFeature; onNavigate: () => void }) {
  return (
    <m.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.28, delay: 0.06, ease }}>
      <Link
        href={feature.href}
        onClick={onNavigate}
        className="group/feature flex h-full flex-col rounded-[20px] bg-paper p-3 ring-1 ring-line transition-shadow duration-300 hover:shadow-[0_22px_44px_-26px_rgba(12,31,35,.45)]"
      >
        <span className="relative block aspect-[4/3] overflow-hidden rounded-[14px] bg-[radial-gradient(ellipse_at_50%_40%,rgba(185,237,214,.9),rgba(185,237,214,.25)_70%)]">
          <Image
            src={feature.image}
            alt=""
            fill
            loading="eager"
            sizes="300px"
            className="object-contain p-4 transition-transform duration-500 ease-out group-hover/feature:scale-[1.05] group-hover/feature:-rotate-1"
          />
        </span>
        <span className="mt-4 px-2 pb-2">
          <span className="eyebrow text-muted">{feature.tag}</span>
          <span className="mt-2 flex items-start justify-between gap-3 text-[16px] font-semibold text-ink">
            {feature.label}
            <Icon name="arrowRight" className="mt-0.5 size-4 shrink-0 text-navy transition-transform duration-300 group-hover/feature:translate-x-1" />
          </span>
          <span className="mt-1.5 block text-[14px] leading-relaxed text-muted">{feature.body}</span>
        </span>
      </Link>
    </m.div>
  );
}

function PanelContent({ item, onNavigate }: { item: Panel; onNavigate: () => void }) {
  let n = 0;
  const next = () => (n++ * 0.025) + 0.04;
  const cols = item.columns.length;
  return (
    <div className="overflow-hidden rounded-[24px] border border-line bg-white shadow-[0_40px_80px_-40px_rgba(7,21,24,.45)]">
      <div className={cx("grid gap-8 p-7", item.feature ? "grid-cols-[1fr_300px]" : "grid-cols-1")}>
        <div className={cx("grid gap-8", cols === 3 ? "grid-cols-[1fr_1fr_1.4fr]" : cols === 2 ? "grid-cols-2" : "grid-cols-1")}>
          {item.columns.map((col) => (
            <div key={col.title}>
              <p className="eyebrow mb-3 px-2.5 text-muted">{col.title}</p>
              {col.layout === "cards" ? (
                <ul className={cx("grid gap-3", cols === 1 ? "grid-cols-2" : "grid-cols-1")}>
                  {col.links.map((l) => (
                    <CardLink key={l.label} link={l} delay={next()} onNavigate={onNavigate} />
                  ))}
                </ul>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {col.links.map((l) => (
                    <ListLink key={l.label} link={l} delay={next()} onNavigate={onNavigate} />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        {item.feature ? <FeatureCard feature={item.feature} onNavigate={onNavigate} /> : null}
      </div>
      {item.footer ? (
        <ul className="flex flex-wrap gap-2 border-t border-line bg-paper/70 px-5 py-3.5">
          {item.footer.map((l) => (
            <li key={l.label}>
              <Link
                href={l.href}
                onClick={onNavigate}
                className="group/foot flex items-center gap-2.5 rounded-full px-3 py-2 text-[14px] font-medium text-ink transition-colors hover:bg-white"
              >
                {l.icon ? (
                  <span className="grid size-7 place-items-center rounded-full bg-navy text-white transition-transform duration-200 group-hover/foot:scale-110">
                    <Icon name={l.icon} className="size-3.5" />
                  </span>
                ) : null}
                {l.label}
                <Icon name="arrowRight" className="size-3.5 text-navy transition-transform duration-200 group-hover/foot:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Desktop navigation with dropdown panels. */
export function MegaMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState<number | null>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggers = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();

  const clearTimers = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  };
  const close = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    setOpen(null);
  }, []);
  const hoverOpen = (i: number) => {
    clearTimers();
    // Instant switch when a panel is already open; short intent delay otherwise.
    if (open !== null) setOpen(i);
    else openTimer.current = window.setTimeout(() => setOpen(i), 70);
  };
  const scheduleClose = () => {
    window.clearTimeout(openTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(null), 160);
  };

  useEffect(() => {
    if (open === null) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        triggers.current[open]?.focus();
        close();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(i);
      requestAnimationFrame(() => document.getElementById(`${baseId}-${i}`)?.querySelector<HTMLElement>("a")?.focus());
    }
  };

  const current = open !== null ? menu[open] : null;

  return (
    <div ref={rootRef} className="hidden flex-1 justify-center lg:flex" onPointerLeave={(e) => e.pointerType === "mouse" && scheduleClose()}>
      <nav aria-label="Navigation principale">
        <ul className="flex items-center gap-1">
          {menu.map((item, i) => {
            const active = isPanel(item) ? linksOf(item).some((l) => matches(pathname, l.href)) : matches(pathname, item.href);
            const expanded = open === i;
            const cls = cx(
              "relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[15px] transition-colors duration-200",
              expanded ? "bg-ink/[.05] text-ink" : "text-ink/75 hover:bg-ink/[.04] hover:text-ink",
              active && "font-medium text-navy",
            );
            const dot = (
              <span
                aria-hidden
                className={cx(
                  "absolute -bottom-1.5 left-1/2 size-1.5 -translate-x-1/2 rounded-[2px] bg-rose transition-[opacity,transform] duration-200",
                  expanded || (open === null && active) ? "scale-100 opacity-100" : "scale-0 opacity-0",
                )}
              />
            );
            return (
              <li key={item.label} onPointerEnter={(e) => (e.pointerType === "mouse" ? (isPanel(item) ? hoverOpen(i) : scheduleClose()) : undefined)}>
                {isPanel(item) ? (
                  <button
                    ref={(el) => {
                      triggers.current[i] = el;
                    }}
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={expanded ? `${baseId}-${i}` : undefined}
                    onClick={() => (expanded ? close() : setOpen(i))}
                    onKeyDown={(e) => onTriggerKey(e, i)}
                    className={cls}
                  >
                    {item.label}
                    <svg viewBox="0 0 12 12" aria-hidden className={cx("size-3 transition-transform duration-300", expanded && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m3 4.5 3 3 3-3" />
                    </svg>
                    {dot}
                  </button>
                ) : (
                  <Link href={item.href} aria-current={active ? "page" : undefined} className={cls}>
                    {item.label}
                    {dot}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <AnimatePresence>
        {current && isPanel(current) ? (
          <>
            <m.div
              key="backdrop"
              aria-hidden
              className="fixed inset-x-0 top-[72px] bottom-0 -z-10 bg-night/15 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onPointerDown={close}
            />
            <m.div
              key="panel"
              className="absolute inset-x-0 top-full px-4 pt-2 sm:px-6 lg:px-8"
              initial={{ opacity: 0, y: -10, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.99, transition: { duration: 0.14 } }}
              transition={{ duration: 0.22, ease }}
              style={{ transformOrigin: "top center" }}
              onPointerEnter={clearTimers}
            >
              <div className="mx-auto max-w-[1176px]">
                <AnimatePresence mode="wait" initial={false}>
                  <m.div
                    key={open}
                    id={`${baseId}-${open}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.08 } }}
                    transition={{ duration: 0.16, ease }}
                  >
                    <PanelContent item={current} onNavigate={close} />
                  </m.div>
                </AnimatePresence>
              </div>
            </m.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Mobile menu: one accordion per panel, plain links otherwise. */
export function MobileMenu({ onNavigate }: { onNavigate: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const pathname = usePathname();
  return (
    <ul className="flex flex-col">
      {menu.map((item, i) =>
        isPanel(item) ? (
          <li key={item.label} className="border-b border-line">
            <button
              type="button"
              aria-expanded={expanded === i}
              onClick={() => setExpanded(expanded === i ? null : i)}
              className="font-display-tight flex w-full items-center justify-between py-3.5 text-2xl font-light"
            >
              {item.label}
              <span aria-hidden className={cx("grid size-8 place-items-center rounded-full border border-line text-navy transition-transform duration-300", expanded === i && "rotate-45 bg-navy text-white")}>
                +
              </span>
            </button>
            <div className={cx("grid transition-[grid-template-rows] duration-300 ease-out", expanded === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <ul className="flex flex-col gap-0.5 overflow-hidden" hidden={expanded !== i}>
                {linksOf(item).map((l) => (
                  <li key={`${l.label}-${l.href}`}>
                    <Link
                      href={l.href}
                      onClick={onNavigate}
                      aria-current={matches(pathname, l.href) ? "page" : undefined}
                      className="flex items-center gap-3 rounded-[12px] px-2 py-2.5 text-[16px] text-ink/85 active:bg-mint/40 aria-[current=page]:font-medium aria-[current=page]:text-navy"
                    >
                      <span className="grid size-8 place-items-center rounded-[10px] bg-mint/50 text-navy">
                        <Icon name={"icon" in l && l.icon ? l.icon : "arrowRight"} className="size-4" />
                      </span>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ) : (
          <li key={item.label}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={matches(pathname, item.href) ? "page" : undefined}
              className="font-display-tight block border-b border-line py-3.5 text-2xl font-light aria-[current=page]:text-ok"
            >
              {item.label}
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}
