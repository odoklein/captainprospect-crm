"use client";

/**
 * One `[E1]` source marker: a small numbered chip. Clicking it opens what the
 * evidence ledger holds for it — tool, period, summary and the figures it
 * returned — from GET /api/manager/assistant/evidence/[id].
 */

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import type { CitationRef } from "@/lib/ai/agent/protocol";
import { cn } from "@/lib/utils";

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

export function CitationChip({ label, citation }: { label: string; citation: CitationRef | null }) {
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState<EvidenceDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const rootRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent | KeyboardEvent) => {
            if (e instanceof KeyboardEvent ? e.key === "Escape" : !rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", close);
        document.addEventListener("keydown", close);
        return () => {
            document.removeEventListener("mousedown", close);
            document.removeEventListener("keydown", close);
        };
    }, [open]);

    const toggle = async () => {
        const next = !open;
        setOpen(next);
        if (!next || detail || loading || !citation?.evidenceId) return;
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
    };

    const number = label.replace(/^E/, "");
    return (
        <span ref={rootRef} className="relative inline-block align-baseline">
            <button
                type="button"
                onClick={() => void toggle()}
                aria-expanded={open}
                title={citation ? `${citation.toolLabel} — ${citation.summary}` : `Source ${label}`}
                className={cn(
                    "mx-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums leading-none transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]",
                    citation
                        ? "bg-[var(--ds-accent-soft)] text-[var(--ds-accent-soft-ink)] hover:bg-[var(--ds-accent)] hover:text-[var(--ds-accent-fg)]"
                        : "bg-[var(--ds-line-subtle)] text-[var(--ds-ink-3)]",
                )}
            >
                {number}
            </button>
            {open && (
                <span
                    role="dialog"
                    aria-label={`Source ${label}`}
                    className="absolute left-1/2 top-full z-40 mt-1.5 block w-80 max-w-[85vw] -translate-x-1/2 rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] p-3 text-left text-[12.5px] leading-snug text-[var(--ds-ink)] shadow-lg"
                >
                    {!citation ? (
                        <span className="block text-[var(--ds-ink-3)]">Cette source n&apos;a pas été retrouvée pour cette réponse.</span>
                    ) : (
                        <>
                            <span className="flex items-center justify-between gap-2">
                                <span className="font-semibold">{citation.toolLabel}</span>
                                <span className="shrink-0 text-[11px] text-[var(--ds-ink-4)]">{formatAt(citation.retrievedAt)}</span>
                            </span>
                            <span className="mt-1 block text-[var(--ds-ink-2)]">{detail?.summary ?? citation.summary}</span>
                            {detail?.period && <span className="mt-1 block text-[11.5px] text-[var(--ds-ink-3)]">Période : {detail.period}</span>}
                            {loading && (
                                <span className="mt-2 flex items-center gap-1.5 text-[var(--ds-ink-3)]">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Chargement des chiffres…
                                </span>
                            )}
                            {failed && (
                                <span className="mt-2 flex items-center gap-1.5 text-[var(--ds-ink-3)]">
                                    <AlertCircle className="h-3 w-3" /> Détail indisponible.
                                </span>
                            )}
                            {detail && detail.facts.length > 0 && (
                                <span className="mt-2 block max-h-48 overflow-y-auto border-t border-[var(--ds-line-subtle)] pt-1.5">
                                    {detail.facts.slice(0, 24).map((f, i) => (
                                        <span key={`${f.key}-${i}`} className="flex justify-between gap-3 py-0.5">
                                            <span className="min-w-0 truncate text-[var(--ds-ink-3)]">
                                                {f.entity ? `${f.entity} · ` : ""}
                                                {f.key}
                                            </span>
                                            <span className="shrink-0 font-medium tabular-nums">
                                                {typeof f.value === "number" ? f.value.toLocaleString("fr-FR") : f.value}
                                                {f.unit ? ` ${f.unit}` : ""}
                                            </span>
                                        </span>
                                    ))}
                                </span>
                            )}
                        </>
                    )}
                </span>
            )}
        </span>
    );
}
