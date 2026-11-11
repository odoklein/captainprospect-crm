"use client";

// Lenis smooth scrolling for the whole site.
// - Off when the visitor asks for reduced motion (native scrolling stays).
// - Touch devices keep their native scrolling (Lenis default `syncTouch: false`).
// - Same-page links (#produit, /#tarifs…) glide to their section, below the sticky
//   header and the focus moves there, like a native jump. The skip link
//   (.sr-only-focusable) keeps its instant native jump.
import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({ autoRaf: true, lerp: 0.1 });

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href*='#']");
      if (!(link instanceof HTMLAnchorElement) || link.classList.contains("sr-only-focusable")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || !url.hash) return;
      const target = url.hash === "#" ? null : document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!target) return;

      event.preventDefault();
      history.pushState(null, "", url.hash);
      // Lenis already stops below the sticky header (it reads scroll-padding-top from
      // globals.css). Two frames later, so a closing mobile menu has left the layout.
      requestAnimationFrame(() => requestAnimationFrame(() => lenis.scrollTo(target)));
      // Focus moves at once, like a native jump; preventScroll lets Lenis keep gliding.
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    };

    // Capture phase: runs before Next.js <Link>, which then sees the click as handled.
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      lenis.destroy();
    };
  }, []);

  return null;
}
