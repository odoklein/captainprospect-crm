"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { site } from "@/content/site";
import { Logo } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";
import { ButtonLink, cx } from "@/components/ui/primitives";

/** 2. Sticky navigation with a disclosure menu on small screens. */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onResize = () => window.innerWidth >= 1024 && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <header
      className={cx(
        "sticky top-0 z-50 border-b transition-colors duration-300",
        scrolled || open ? "border-line bg-paper/90 backdrop-blur-md" : "border-transparent bg-paper",
      )}
    >
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0 rounded-md" aria-label="Suzalink, accueil">
          <Logo className="h-[52px] w-auto" title="" />
        </Link>

        <nav aria-label="Navigation principale" className="hidden flex-1 justify-center lg:flex">
          <ul className="flex items-center gap-1">
            {site.nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-full px-3.5 py-2 text-[15px] text-ink/80 transition-colors hover:bg-ink/[.04] hover:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <a href={site.loginUrl} className="rounded-full px-3.5 py-2 text-[15px] text-ink/80 hover:text-ink">
            {site.loginLabel}
          </a>
          <ButtonLink href={site.demoHref} size="sm" className="h-11 px-5">
            {site.demoLabel}
          </ButtonLink>
        </div>

        <button
          ref={buttonRef}
          type="button"
          className="ml-auto grid size-11 place-items-center rounded-full border border-line bg-white lg:hidden"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? "close" : "menu"} className="size-5" />
          <span className="sr-only">{open ? "Fermer le menu" : "Ouvrir le menu"}</span>
        </button>
      </div>

      <div id={menuId} hidden={!open} className="border-t border-line bg-paper lg:hidden">
        <nav aria-label="Navigation mobile" className="mx-auto max-w-[1240px] px-4 py-4 sm:px-6">
          <ul className="flex flex-col">
            {site.nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="font-display-tight block border-b border-line py-3.5 text-2xl font-light"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={site.demoHref} onClick={() => setOpen(false)}>
              {site.demoLabel}
            </ButtonLink>
            <ButtonLink href={site.loginUrl} variant="ghost">
              {site.loginLabel}
            </ButtonLink>
          </div>
        </nav>
      </div>
    </header>
  );
}
