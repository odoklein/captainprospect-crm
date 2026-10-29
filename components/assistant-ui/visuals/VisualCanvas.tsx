"use client";

/**
 * The canvas beside the chat: one visual at full size, with the same figures
 * as a table, and the ways out — CSV, PNG, copy, pin.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Download, Image as ImageIcon, Loader2, Pin, PinOff, X } from "lucide-react";
import { formatValue, visualTable, type StoredVisual } from "@/lib/assistant/visuals/spec";
import { VisualView } from "./VisualView";
import { UnverifiedNote } from "./VisualCard";
import { canExportPng, copyAsTable, downloadCsv, exportPng } from "./export";
import { cn } from "@/lib/utils";

type View = "chart" | "data";

function ActionButton({ onClick, children, active, disabled }: { onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={active}
            className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border disabled:pointer-events-none disabled:opacity-60 border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-[12.5px] text-[var(--ds-ink-2)] transition-colors hover:border-[var(--ds-line-strong)] hover:text-[var(--ds-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]",
                active && "border-[var(--ds-accent)] text-[var(--ds-accent-soft-ink)]",
            )}
        >
            {children}
        </button>
    );
}

export function VisualCanvas({
    visual,
    pinned,
    pinBusy,
    onTogglePin,
    onClose,
}: {
    visual: StoredVisual;
    pinned?: boolean;
    /** The pin request is in flight. */
    pinBusy?: boolean;
    onTogglePin?: (visual: StoredVisual) => void;
    onClose: () => void;
}) {
    const { spec } = visual;
    const [view, setView] = useState<View>("chart");
    const [copied, setCopied] = useState(false);
    const [exporting, setExporting] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);
    const table = visualTable(spec);

    // The close button promises Échap: honour it, unless a dialog above owns the key.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented) return;
            if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
            onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <aside className="cp-viz flex h-full min-h-0 w-full flex-col border-l border-[var(--ds-line)] bg-[var(--ds-surface)] animate-ds-slide-in" aria-label={`Visuel : ${spec.title}`}>
            <header className="flex items-start justify-between gap-3 border-b border-[var(--ds-line-subtle)] px-5 py-4">
                <div className="min-w-0">
                    <h2 className="text-[16px] font-semibold text-[var(--ds-ink)]">{spec.title}</h2>
                    {spec.subtitle && <p className="mt-0.5 text-[12.5px] text-[var(--ds-ink-3)]">{spec.subtitle}</p>}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Fermer"
                    title="Fermer (Échap)"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--ds-ink-3)] hover:bg-[var(--ds-surface-3)] hover:text-[var(--ds-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]"
                >
                    <X className="h-4 w-4" />
                </button>
            </header>

            <div role="tablist" aria-label="Affichage" className="flex gap-1 px-5 pt-3">
                {(["chart", "data"] as const).map((v) => (
                    <button
                        key={v}
                        type="button"
                        role="tab"
                        aria-selected={view === v}
                        onClick={() => setView(v)}
                        className={cn(
                            "h-8 rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]",
                            view === v ? "bg-[var(--ds-surface-3)] text-[var(--ds-ink)]" : "text-[var(--ds-ink-3)] hover:text-[var(--ds-ink)]",
                        )}
                    >
                        {v === "chart" ? "Graphique" : "Données"}
                    </button>
                ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {view === "chart" ? (
                    <div ref={chartRef}>
                        <VisualView spec={spec} large />
                    </div>
                ) : (
                    <div className="overflow-auto rounded-lg border border-[var(--ds-line-subtle)]">
                        <table className="w-full border-collapse text-[13px]">
                            <thead className="sticky top-0 bg-[var(--ds-surface)]">
                                <tr>
                                    {table.header.map((h) => (
                                        <th key={h} scope="col" className="border-b border-[var(--ds-line)] px-3 py-2 text-left text-[12px] font-medium text-[var(--ds-ink-3)]">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {table.rows.map((row, i) => (
                                    <tr key={i} className="border-b border-[var(--ds-line-subtle)] last:border-0">
                                        {row.map((v, c) => (
                                            <td key={c} className={cn("px-3 py-1.5", typeof v === "number" ? "text-right font-medium tabular-nums text-[var(--ds-ink)]" : "text-[var(--ds-ink-2)]")}>
                                                {typeof v === "number" ? formatValue(v) : (v ?? "—")}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <UnverifiedNote values={visual.unverified} />
                {visual.source && (
                    <p className="mt-3 text-[12px] text-[var(--ds-ink-3)]">Source : {visual.source.label}</p>
                )}
            </div>

            <footer className="flex flex-wrap gap-2 border-t border-[var(--ds-line-subtle)] px-5 py-3">
                <ActionButton onClick={() => downloadCsv(spec)}>
                    <Download className="h-3.5 w-3.5" /> CSV
                </ActionButton>
                {canExportPng(spec) && (
                    <ActionButton
                        onClick={async () => {
                            if (!chartRef.current) {
                                setView("chart");
                                return;
                            }
                            setExporting(true);
                            await exportPng(chartRef.current, spec);
                            setExporting(false);
                        }}
                    >
                        <ImageIcon className="h-3.5 w-3.5" /> {exporting ? "Export…" : "Image"}
                    </ActionButton>
                )}
                <ActionButton
                    onClick={async () => {
                        if (await copyAsTable(spec)) {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                        }
                    }}
                >
                    {copied ? <Check className="h-3.5 w-3.5 text-[var(--ds-success)]" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copié" : "Copier"}
                </ActionButton>
                {onTogglePin && (
                    <ActionButton onClick={() => onTogglePin(visual)} active={pinned} disabled={pinBusy}>
                        {pinBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : pinned ? (
                            <PinOff className="h-3.5 w-3.5" />
                        ) : (
                            <Pin className="h-3.5 w-3.5" />
                        )}{" "}
                        {pinned ? "Retirer du tableau" : "Épingler au dossier"}
                    </ActionButton>
                )}
            </footer>
        </aside>
    );
}
