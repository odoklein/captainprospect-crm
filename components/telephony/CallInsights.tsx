"use client";

// ============================================
// CALL INSIGHTS — live transcript and AI summary of a softphone call.
// Shared by the SDR's call dock (live) and the manager's call journal (after).
// ============================================

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, ListChecks, ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CallAiSummary, SummaryState } from "@/lib/telephony/summary";

export interface TranscriptLine {
    id?: string;
    speaker: "sdr" | "prospect" | string;
    text: string;
    at: string;
}

// ── polling ─────────────────────────────────────────────────────────────────

interface TranscriptPayload {
    live: boolean;
    lines: (TranscriptLine & { id: string; receivedAt: string })[];
    summary: SummaryState;
}

const TERMINAL = new Set<SummaryState["status"]>(["done", "skipped", "failed"]);

/**
 * Follows a softphone call's transcript and summary. Polls every 1.5 s while
 * the call is live, then every 3 s until the summary settles (2½ min at most).
 */
export function useCallTranscript(callId: string | null, enabled: boolean) {
    const [lines, setLines] = useState<TranscriptPayload["lines"]>([]);
    const [summary, setSummary] = useState<SummaryState>({ status: "none" });
    const [live, setLive] = useState(true);

    useEffect(() => {
        if (!callId || !enabled) return;
        let cancelled = false;
        let since: string | null = null;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let endedAt: number | null = null;

        const tick = async () => {
            try {
                const res = await fetch(`/api/telephony/calls/${callId}/transcript${since ? `?since=${encodeURIComponent(since)}` : ""}`);
                const json = await res.json();
                if (cancelled || !json?.success) return schedule(4000);
                const data = json.data as TranscriptPayload;
                if (data.lines.length) {
                    since = data.lines[data.lines.length - 1].receivedAt;
                    setLines((prev) => {
                        const seen = new Set(prev.map((l) => l.id));
                        return [...prev, ...data.lines.filter((l) => !seen.has(l.id))];
                    });
                }
                setSummary(data.summary);
                setLive(data.live);
                if (!data.live && endedAt === null) endedAt = Date.now();
                const settled = !data.live && TERMINAL.has(data.summary.status);
                const expired = endedAt !== null && Date.now() - endedAt > 150_000;
                if (!settled && !expired) schedule(data.live ? 1500 : 3000);
            } catch {
                schedule(4000);
            }
        };
        const schedule = (ms: number) => {
            if (!cancelled) timer = setTimeout(tick, ms);
        };
        void tick();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [callId, enabled]);

    return { lines, summary, live };
}

// ── transcript ──────────────────────────────────────────────────────────────

function clock(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function TranscriptView({
    lines,
    names,
    live,
    startedAt,
    className,
    emptyText = "Aucune transcription pour cet appel.",
}: {
    lines: TranscriptLine[];
    names: { sdr: string; prospect: string };
    live?: boolean;
    /** Call start on the SERVER clock, for mm:ss offsets. Defaults to the first line (never mix in the browser clock). */
    startedAt?: string | number | null;
    className?: string;
    emptyText?: string;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const stickRef = useRef(true);

    // Follow new lines while the reader is at the bottom; leave them alone if they scrolled up.
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (el && stickRef.current) el.scrollTop = el.scrollHeight;
    }, [lines.length]);

    const origin = startedAt != null ? new Date(startedAt).getTime() : lines[0] ? new Date(lines[0].at).getTime() : 0;

    return (
        <div
            ref={scrollRef}
            onScroll={(e) => {
                const el = e.currentTarget;
                stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
            }}
            className={cn("overflow-y-auto", className)}
            aria-live={live ? "polite" : undefined}
        >
            {lines.length === 0 ? (
                <p className="px-1 py-6 text-center text-[12px] text-ink-3">{emptyText}</p>
            ) : (
                <ol className="space-y-3">
                    {lines.map((l, i) => {
                        const sdr = l.speaker === "sdr";
                        const sameAsPrev = i > 0 && lines[i - 1].speaker === l.speaker;
                        return (
                            <li key={l.id ?? `${l.at}-${i}`} className={cn("grid grid-cols-[44px_1fr] gap-2", sameAsPrev && "-mt-1.5")}>
                                <span className="pt-0.5 text-right text-[10px] tabular-nums text-ink-4">
                                    {sameAsPrev ? "" : clock(new Date(l.at).getTime() - origin)}
                                </span>
                                <div className="min-w-0">
                                    {!sameAsPrev && (
                                        <p className={cn("mb-0.5 text-[11px] font-semibold", sdr ? "text-primary-soft-ink" : "text-ink")}>
                                            {sdr ? names.sdr : names.prospect}
                                        </p>
                                    )}
                                    <p className="text-[13px] leading-relaxed text-ink-2">{l.text}</p>
                                </div>
                            </li>
                        );
                    })}
                    {live && (
                        <li className="grid grid-cols-[44px_1fr] gap-2" aria-hidden>
                            <span />
                            <span className="flex h-4 items-center gap-1">
                                {[0, 150, 300].map((d) => (
                                    <span key={d} className="h-1 w-1 rounded-full bg-ink-4 animate-pulse" style={{ animationDelay: `${d}ms` }} />
                                ))}
                            </span>
                        </li>
                    )}
                </ol>
            )}
        </div>
    );
}

// ── AI summary ──────────────────────────────────────────────────────────────

export function summaryAsText(s: CallAiSummary): string {
    const block = (title: string, items: string[]) => (items.length ? `\n\n${title} :\n${items.map((x) => `• ${x}`).join("\n")}` : "");
    return `${s.summary}${block("Points clés", s.keyPoints)}${block("Objections", s.objections)}${block("Prochaines étapes", s.nextSteps)}`;
}

function Section({ icon: Icon, title, items }: { icon: typeof ListChecks; title: string; items: string[] }) {
    if (items.length === 0) return null;
    return (
        <section>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {title}
                <span className="font-medium tabular-nums text-ink-4">{items.length}</span>
            </h4>
            <ul className="space-y-1">
                {items.map((x, i) => (
                    <li key={i} className="flex gap-2 text-[13px] leading-snug text-ink-2">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-4" aria-hidden />
                        {x}
                    </li>
                ))}
            </ul>
        </section>
    );
}

export function AiSummaryView({ state, className }: { state: SummaryState; className?: string }) {
    const [copied, setCopied] = useState(false);

    if (state.status === "none") return null;

    if (state.status === "pending") {
        return (
            <div className={cn("space-y-2", className)} aria-busy="true">
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" aria-hidden />
                    Résumé en cours de rédaction…
                </p>
                {[92, 80, 64].map((w) => (
                    <div key={w} className="h-2.5 animate-pulse rounded bg-surface-3" style={{ width: `${w}%` }} />
                ))}
            </div>
        );
    }

    if (state.status === "skipped" || state.status === "failed") {
        return <p className={cn("text-[12px] text-ink-3", className)}>{state.reason}</p>;
    }

    const s = state.data;
    return (
        <div className={cn("space-y-4", className)}>
            <div className="flex items-start justify-between gap-3">
                <p className="text-[13px] leading-relaxed text-ink">{s.summary}</p>
                <button
                    type="button"
                    onClick={() => {
                        navigator.clipboard?.writeText(summaryAsText(s)).then(() => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                        });
                    }}
                    className="flex h-7 shrink-0 items-center gap-1 rounded-control border border-line px-2 text-[11px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    title="Copier le résumé (à coller dans la note)"
                >
                    {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copié" : "Copier"}
                </button>
            </div>
            <Section icon={ListChecks} title="Points clés" items={s.keyPoints} />
            <Section icon={ShieldAlert} title="Objections" items={s.objections} />
            <Section icon={ArrowRight} title="Prochaines étapes" items={s.nextSteps} />
        </div>
    );
}
