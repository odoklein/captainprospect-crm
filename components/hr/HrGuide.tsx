"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface HrGuideStep {
  /** Value of a data-hr-tour attribute; omit for a centered message. */
  target?: string;
  title: string;
  body: React.ReactNode;
}

function readDone(key: string) {
  try {
    return window.localStorage.getItem(key) === "done";
  } catch {
    return false;
  }
}

function writeDone(key: string) {
  try {
    window.localStorage.setItem(key, "done");
  } catch {
    // Storage unavailable (private mode): the guide simply shows again next time.
  }
}

/** Opens the guide automatically once per browser, when `ready` becomes true. */
export function useHrGuide(storageKey: string, ready: boolean) {
  const [open, setOpen] = useState(false);
  const autoChecked = useRef(false);

  useEffect(() => {
    if (!ready || autoChecked.current) return;
    autoChecked.current = true;
    if (!readDone(storageKey)) {
      const t = window.setTimeout(() => setOpen(true), 400);
      return () => window.clearTimeout(t);
    }
  }, [ready, storageKey]);

  const close = useCallback(() => {
    writeDone(storageKey);
    setOpen(false);
  }, [storageKey]);

  return { open, start: () => setOpen(true), close };
}

const PAD = 6;
const GAP = 12;
const WIDTH = 360;

function findTarget(key?: string): HTMLElement | null {
  if (!key) return null;
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-hr-tour="${key}"]`));
  return all.find((el) => el.getClientRects().length > 0) ?? null;
}

interface HrGuideProps {
  steps: HrGuideStep[];
  open: boolean;
  onClose: () => void;
}

// Mounted only while open, so every run starts fresh at step 1.
export function HrGuide({ steps, open, onClose }: HrGuideProps) {
  return open ? <GuideRun steps={steps} onClose={onClose} /> : null;
}

function GuideRun({ steps, onClose }: Omit<HrGuideProps, "open">) {
  const open = true;
  const [index, setIndex] = useState(0);
  const [measured, setMeasured] = useState<{ index: number; rect: DOMRect } | null>(null);
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const directionRef = useRef<1 | -1>(1);
  const rect = measured?.index === index ? measured.rect : null;

  // Steps whose anchor is missing (e.g. an empty table) are skipped.
  const available = useCallback((i: number) => !steps[i]?.target || Boolean(findTarget(steps[i].target)), [steps]);

  useEffect(() => {
    if (index < 0 || index >= steps.length) return;
    if (!available(index)) {
      const next = index + directionRef.current;
      if (next >= 0 && next < steps.length) setIndex(next);
      else onClose();
    }
  }, [index, steps.length, available, onClose]);

  const step = steps[index];

  // Scroll the anchor into view, then keep the spotlight glued to it.
  useLayoutEffect(() => {
    if (!step) return;
    const el = findTarget(step.target);
    if (!el) return;
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setMeasured({ index, rect: el.getBoundingClientRect() }));
    };
    measure();
    const settle = window.setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, index]);

  useLayoutEffect(() => {
    if (!open || !popRef.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = popRef.current.offsetWidth;
    const h = popRef.current.offsetHeight;

    if (!rect) {
      setPopPos({ top: Math.max(16, (vh - h) / 2), left: Math.max(16, (vw - w) / 2) });
      return;
    }
    let top = rect.bottom + PAD + GAP;
    if (top + h > vh - 16) {
      const above = rect.top - PAD - GAP - h;
      top = above >= 16 ? above : Math.max(16, vh - h - 16);
    }
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(16, Math.min(left, vw - w - 16));
    setPopPos({ top, left });
  }, [open, rect, index]);

  useEffect(() => {
    if (open) popRef.current?.focus();
  }, [open, index]);

  const go = useCallback(
    (delta: 1 | -1) => {
      directionRef.current = delta;
      if (index + delta >= steps.length) {
        onClose();
        return;
      }
      setIndex(Math.max(0, index + delta));
    },
    [index, steps.length, onClose]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, go, onClose]);

  if (!open || !step || typeof document === "undefined") return null;

  const isLast = index === steps.length - 1;
  const titleId = `hr-guide-title-${index}`;

  return createPortal(
    <div className="fixed inset-0 z-[150]" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {/* Click shield: the guide is read-only, nothing behind reacts. */}
      <div className={`absolute inset-0 ${rect ? "" : "bg-slate-900/50"}`} />

      {rect && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-indigo-400 transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
          }}
        />
      )}

      <div
        ref={popRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none"
        style={{
          width: `min(${WIDTH}px, calc(100vw - 32px))`,
          top: popPos?.top ?? -9999,
          left: popPos?.left ?? -9999,
        }}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
              Guide RH · {index + 1} / {steps.length}
            </p>
            <h3 id={titleId} className="mt-0.5 text-sm font-bold text-slate-900">
              {step.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le guide"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 px-4 py-3 text-[13px] leading-relaxed text-slate-600">{step.body}</div>

        <div className="flex items-center gap-1 px-4" aria-hidden>
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= index ? "bg-indigo-500" : "bg-slate-200"}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            Passer le guide
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => go(-1)}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Précédent
              </button>
            )}
            <button
              type="button"
              onClick={() => go(1)}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              {isLast ? "J’ai compris" : "Suivant"}
              {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
