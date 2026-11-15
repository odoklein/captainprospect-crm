"use client";

// The hero's call console: the site's one idea, played in the product UI.
// One call goes unanswered (callback planned at another hour), the next one is answered:
// queue → ring → exchange → « RDV pris » → the slot lands in the week.
//
// It is a demonstration with sample data (labelled as such, texts in content/home.ts).
// Motion: transform and opacity only, each change under 300 ms. The loop stops when the
// console leaves the screen, when the tab is hidden, on the pause button, and never starts
// with prefers-reduced-motion: the visitor then sees the finished call, which is also what
// the server sends.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { hero } from "@/content/home";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";

type Phase = "ring" | "live" | "missed" | "result";
type Step = { answered: boolean; phase: Phase; lines: number; clock: string; ms: number; advance?: boolean };

const SCRIPT: Step[] = [
  // Opening state (and the static one): the answered call, just qualified.
  { answered: true, phase: "result", lines: 3, clock: "00:31", ms: 3400 },
  { answered: false, phase: "ring", lines: 0, clock: "00:00", ms: 2400, advance: true },
  { answered: false, phase: "missed", lines: 0, clock: "00:00", ms: 1200 },
  { answered: false, phase: "result", lines: 0, clock: "00:00", ms: 2600 },
  { answered: true, phase: "ring", lines: 0, clock: "00:00", ms: 1800, advance: true },
  { answered: true, phase: "live", lines: 1, clock: "00:06", ms: 2400 },
  { answered: true, phase: "live", lines: 2, clock: "00:14", ms: 2000 },
  { answered: true, phase: "live", lines: 3, clock: "00:22", ms: 2400 },
  { answered: true, phase: "result", lines: 3, clock: "00:31", ms: 3800 },
];
/** After the last step the loop resumes here (the opening state is shown once). */
const LOOP_FROM = 1;
const ROW = 56;

const c = hero.call;

function StatusPill({ step }: { step: Step }) {
  const label =
    step.phase === "ring" ? c.status.ring : step.phase === "live" ? c.status.live : step.phase === "missed" ? c.status.missed : c.status.done;
  const showClock = step.phase === "live" || (step.phase === "result" && step.answered);
  return (
    <span className="flex h-8 shrink-0 items-center gap-2 rounded-full bg-navy pr-3 pl-2.5 font-mono text-[11px] text-white">
      <span className="relative grid size-3 place-items-center">
        {step.phase === "ring" ? <span className="call-ring absolute size-3 rounded-full bg-rose" /> : null}
        <span className={cx("relative size-2 rounded-full transition-colors duration-200", step.phase === "missed" ? "bg-white/40" : "bg-rose")} />
      </span>
      {label}
      {showClock ? <span className="tabular-nums text-white/70">{step.clock}</span> : null}
    </span>
  );
}

export function HeroCall() {
  const [i, setI] = useState(0);
  const [done, setDone] = useState(0);
  // null = follow the motion preference; the pause button sets it explicitly.
  const [choice, setChoice] = useState<boolean | null>(null);
  const reduce = useReducedMotion();
  const playing = choice ?? !reduce;
  const [visible, setVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const step = SCRIPT[i]!;

  // Run only while the console is on screen and the tab is visible.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let onScreen = true;
    const update = () => setVisible(onScreen && !document.hidden);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = Boolean(entry?.isIntersecting);
      update();
    }, { threshold: 0.25 });
    io.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if (!playing || !visible) return;
    const id = window.setTimeout(() => {
      const next = i + 1 >= SCRIPT.length ? LOOP_FROM : i + 1;
      if (SCRIPT[next]!.advance) setDone((d) => d + 1);
      setI(next);
    }, step.ms);
    return () => window.clearTimeout(id);
  }, [i, playing, visible, step.ms]);

  const n = c.queue.length;
  const current = c.queue[done % n]!;
  const upNext = c.queue[(done + 1) % n]!;
  const pressed = step.phase === "result" ? (step.answered ? 0 : 3) : -1;
  // The booked slot stays in the week while the next (unanswered) call plays.
  const booked = !step.answered || step.phase === "result";
  const callback = !step.answered && step.phase === "result";

  return (
    <div ref={rootRef} className="relative">
      <div
        role="img"
        aria-label={c.label}
        className="overflow-hidden rounded-[20px] border border-line bg-white text-left text-[13px] leading-snug text-ink shadow-[0_1px_0_rgba(12,31,35,.04),0_30px_60px_-36px_rgba(12,31,35,.45)] select-none"
      >
        <div aria-hidden>
          {/* Title bar */}
          <div className="flex h-11 items-center gap-3 border-b border-line bg-paper pr-12 pl-4">
            <p className="shrink-0 font-semibold whitespace-nowrap">{c.windowTitle}</p>
            <p className="hidden min-w-0 truncate text-muted sm:block">{c.mission}</p>
            <span className="ml-auto shrink-0 rounded-full border border-dashed border-ink/25 px-2 py-0.5 font-mono text-[10px] tracking-wide text-ink/70 uppercase">
              {c.sample}
            </span>
          </div>

          <div className="grid md:grid-cols-[212px_minmax(0,1fr)]">
            {/* Queue: rows slide up when a call ends. */}
            <div className="hidden border-r border-line bg-paper p-2 md:block">
              <div className="relative overflow-hidden" style={{ height: ROW * (n - 1) }}>
                {c.queue.map((row, idx) => {
                  const pos = (((idx - done) % n) + n) % n;
                  const active = pos === 0;
                  return (
                    <div
                      key={row.name}
                      className={cx(
                        "absolute inset-x-0 top-0 flex items-center gap-2.5 rounded-[12px] px-2.5",
                        // The row that just left jumps to the (hidden) end of the list without crossing it.
                        pos === n - 1 ? "opacity-0" : "transition-transform duration-[260ms] ease-out",
                        active && "bg-white shadow-[0_0_0_1px_var(--color-line)]",
                      )}
                      style={{ height: ROW - 4, transform: `translateY(${pos * ROW}px)` }}
                    >
                      <span className={cx("h-6 w-[3px] shrink-0 rounded-full", active ? "bg-rose" : "bg-transparent")} />
                      <span className="min-w-0 flex-1">
                        <span className={cx("block truncate", active ? "font-semibold" : "font-medium text-ink/80")}>{row.name}</span>
                        <span className="block truncate text-[11px] text-muted">{active ? row.role : row.note}</span>
                      </span>
                      <span className="font-mono text-[10px] text-muted tabular-nums">{active ? "" : pos + 1}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 flex items-center justify-between rounded-[10px] bg-navy px-3 py-2 font-medium text-white">
                {c.next}
                <span className="rounded-[5px] border border-white/25 px-1.5 font-mono text-[10px] leading-[16px] text-white/80">Espace</span>
              </p>
            </div>

            {/* Current call */}
            <div className="flex flex-col gap-3.5 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{current.name}</p>
                  <p className="truncate text-muted">
                    {current.role}
                    <span className="md:hidden"> · suivant : {upNext.name.split(" · ")[1]}</span>
                  </p>
                </div>
                <StatusPill step={step} />
              </div>

              {/* Exchange: every line has its place, so nothing moves when one appears. */}
              <div className="relative rounded-[14px] border border-line p-3">
                <p className="mb-2 font-mono text-[10px] tracking-wide text-muted uppercase">{c.transcriptTitle}</p>
                <ol className="flex flex-col gap-2">
                  {c.lines.map((line, k) => {
                    const shown = step.answered && step.lines > k;
                    const sdr = line.who === "sdr";
                    return (
                      <li
                        key={k}
                        className={cx(
                          "flex max-w-[92%] flex-col gap-0.5 transition-[opacity,transform] duration-[240ms] ease-out",
                          sdr ? "self-start" : "self-end",
                          shown ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0",
                        )}
                      >
                        <span className={cx("font-mono text-[10px] text-muted", !sdr && "self-end")}>{sdr ? c.speakers.sdr : c.speakers.other}</span>
                        <span className={cx("rounded-[12px] px-3 py-2 text-[12.5px] leading-snug sm:text-[13px]", sdr ? "rounded-tl-[4px] bg-paper" : "rounded-tr-[4px] bg-mint/60")}>
                          {line.text}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <p
                  className={cx(
                    "absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-[13px] text-muted transition-opacity duration-200",
                    !step.answered && step.phase !== "ring" ? "opacity-100" : "opacity-0",
                  )}
                >
                  {c.missedNote}
                </p>
              </div>

              {/* Outcome keys */}
              <div>
                <p className="mb-2 font-mono text-[10px] tracking-wide text-muted uppercase">{c.outcomesTitle}</p>
                <div className="grid grid-cols-2 gap-2">
                  {c.outcomes.map((o, k) => (
                    <span
                      key={o}
                      className={cx(
                        "flex items-center justify-between gap-2 rounded-[10px] border px-2.5 py-2 font-medium transition-colors duration-150",
                        pressed === k ? "call-press border-navy bg-navy text-white" : "border-line bg-white text-ink",
                      )}
                    >
                      {o}
                      <span className={cx("rounded-[5px] border px-1 font-mono text-[10px] leading-[16px]", pressed === k ? "border-white/30 text-white/80" : "border-ink/15 text-ink/60")}>
                        {k + 1}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* The week: the booked slot and the planned callback land here. */}
          <div className="grid grid-cols-5 gap-1.5 border-t border-line bg-paper px-3 py-3.5 sm:gap-2 sm:px-5">
            {c.week.map((day) => {
              const slot = day === c.booked.day ? { ...c.booked, on: booked, kind: "booked" as const } : day === c.callback.day ? { ...c.callback, on: callback, kind: "callback" as const } : null;
              return (
                <div key={day} className="flex min-w-0 flex-col gap-1.5">
                  <span className="font-mono text-[10px] text-muted">{day}</span>
                  <div className="relative h-[46px] rounded-[9px] bg-white shadow-[inset_0_0_0_1px_var(--color-line)]">
                    {slot ? (
                      <div
                        className={cx(
                          "absolute inset-0 flex origin-bottom flex-col justify-center rounded-[9px] px-1.5 whitespace-nowrap sm:px-2 transition-[opacity,transform] duration-[260ms] ease-out",
                          slot.kind === "booked" ? "bg-navy text-white" : "border border-dashed border-ink/30 bg-white text-ink",
                          slot.on ? "scale-100 opacity-100" : "scale-90 opacity-0",
                        )}
                      >
                        <span className="flex items-center gap-1 font-mono text-[10.5px] tabular-nums">
                          {slot.kind === "booked" ? <Icon name="check" className="hidden size-3 shrink-0 text-rose sm:block" /> : null}
                          {slot.time}
                        </span>
                        <span className={cx("truncate text-[10.5px]", slot.kind === "booked" ? "text-white/75" : "text-muted")}>{slot.title}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setChoice(!playing)}
        aria-pressed={!playing}
        className="absolute top-1.5 right-2 grid size-8 place-items-center rounded-full text-ink/60 transition-colors duration-150 hover:bg-ink/5 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
          {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />}
        </svg>
        <span className="sr-only">{playing ? c.pause : c.play}</span>
      </button>
    </div>
  );
}
