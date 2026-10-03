"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";

interface HrHelpTipProps {
  title?: string;
  children: React.ReactNode;
  label?: string;
}

const WIDTH = 280;
const GAP = 8;

// Small "?" button that explains a term in plain language. Portaled so it is
// never clipped by scrolling tables or modals.
export function HrHelpTip({ title, children, label = "Explication" }: HrHelpTipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const place = () => {
      const r = buttonRef.current!.getBoundingClientRect();
      const h = popRef.current?.offsetHeight ?? 120;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(WIDTH, vw - 32);
      let left = r.left + r.width / 2 - width / 2;
      left = Math.max(16, Math.min(left, vw - width - 16));
      let top = r.bottom + GAP;
      if (top + h > vh - 16) top = Math.max(16, r.top - h - GAP);
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center justify-center w-4 h-4 align-middle rounded-full text-slate-400 hover:text-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            id={id}
            role="tooltip"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: Math.min(WIDTH, typeof window !== "undefined" ? window.innerWidth - 32 : WIDTH),
            }}
            className="z-[160] rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-normal normal-case tracking-normal text-slate-600 shadow-xl"
          >
            {title && <p className="mb-1 font-semibold text-slate-900">{title}</p>}
            <div className="space-y-1.5 leading-relaxed">{children}</div>
          </div>,
          document.body
        )}
    </>
  );
}
