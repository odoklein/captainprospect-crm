"use client";

/**
 * One `[E1]` source marker: a small numbered chip. Hovering (or focusing, or
 * tapping) it opens what the evidence ledger holds for it — tool, period,
 * summary and the figures it returned — from GET
 * /api/manager/assistant/evidence/[id], fetched once.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import type { CitationRef } from "@/lib/ai/agent/protocol";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";

interface EvidenceDetail {
    toolLabel: string;
    status: string;
    summary: string;
    period: string | null;
    retrievedAt: string;
    facts: Array<{ key: string; value: number | string; unit?: string | null; entity: string | null }>;
}

const formatAt = (iso: string) =>
    new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const OPEN_DELAY = 250;
const CLOSE_DELAY = 150;

export function CitationChip({ label, citation }: { label: string; citation: CitationRef | null }) {
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState<EvidenceDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimer = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
    };
    useEffect(() => clearTimer, []);

    const load = useCallback(async () => {
        if (detail || loading || !citation?.evidenceId) return;
        setLoading(true);
        setFailed(false);
        try {
            const res = await fetch(`/api/manager/assistant/evidence/${encodeURIComponent(citation.evidenceId)}`);
            if (!res.ok) throw new Error();
            setDetail((await res.json()).data as EvidenceDetail);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [detail, loading, citation]);

    const change = (next: boolean) => {
        clearTimer();
        setOpen(next);
        if (next) void load();
    };
    // Hover intent: open after a beat, close a beat after the pointer leaves chip and card.
    const hoverOpen = () => {
        clearTimer();
        timerRef.current = setTimeout(() => change(true), OPEN_DELAY);
    };
    const hoverClose = () => {
        clearTimer();
        timerRef.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
    };

    const number = label.replace(/^E/, "");
    return (
        <Popover open={open} onOpenChange={change}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    onPointerEnter={(e) => e.pointerType === "mouse" && hoverOpen()}
                    onPointerLeave={(e) => e.pointerType === "mouse" && hoverClose()}
                    aria-label={citation ? `Source ${number} : ${citation.toolLabel}` : `Source ${label}`}
                    className={cn(
                        "mx-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-chip px-1 align-baseline text-[10.5px] font-semibold tabular-nums leading-none",
                        "transition-[background-color,color] duration-150 ease-snappy",
                        FOCUS_RING,
                        citation
                            ? "bg-accent-soft text-accent-soft-ink hover:bg-accent hover:text-accent-fg data-[state=open]:bg-accent data-[state=open]:text-accent-fg"
                            : "bg-surface-3 text-ink-3",
                    )}
                >
                    {number}
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="top"
                className="w-80 max-w-[85vw] p-3 text-[12.5px] leading-snug"
                onPointerEnter={clearTimer}
                onPointerLeave={(e) => e.pointerType === "mouse" && hoverClose()}
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                {!citation ? (
                    <p className="text-ink-3">Cette source n’a pas été retrouvée pour cette réponse.</p>
                ) : (
                    <>
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-ink">{citation.toolLabel}</span>
                            <span className="shrink-0 text-[11px] text-ink-4">{formatAt(citation.retrievedAt)}</span>
                        </div>
                        <p className="mt-1 text-ink-2">{detail?.summary ?? citation.summary}</p>
                        {detail?.period && <p className="mt-1 text-[11.5px] text-ink-3">Période : {detail.period}</p>}
                        {loading && (
                            <p className="mt-2 flex items-center gap-1.5 text-ink-3">
                                <Loader2 className="size-3 animate-spin" aria-hidden /> Chargement des chiffres…
                            </p>
                        )}
                        {failed && (
                            <p className="mt-2 flex items-center gap-1.5 text-ink-3">
                                <AlertCircle className="size-3" aria-hidden /> Détail indisponible.
                            </p>
                        )}
                        {detail && detail.facts.length > 0 && (
                            <dl className="mt-2 max-h-48 overflow-y-auto border-t border-line-subtle pt-1.5">
                                {detail.facts.slice(0, 24).map((f, i) => (
                                    <div key={`${f.key}-${i}`} className="flex justify-between gap-3 py-0.5">
                                        <dt className="min-w-0 truncate text-ink-3">
                                            {f.entity ? `${f.entity} · ` : ""}
                                            {f.key}
                                        </dt>
                                        <dd className="shrink-0 font-medium tabular-nums text-ink">
                                            {typeof f.value === "number" ? f.value.toLocaleString("fr-FR") : f.value}
                                            {f.unit ? ` ${f.unit}` : ""}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
}
