"use client";

/**
 * The canvas beside the chat: one visual at full size, as a chart or as the
 * same figures in a table (Tabs), and the ways out — CSV, image, copy, pin.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Image as ImageIcon, Loader2, Pin, PinOff, X } from "lucide-react";
import { formatValue, visualTable, type StoredVisual } from "@/lib/assistant/visuals/spec";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/shadcn/button";
import { Kbd } from "@/components/ui/shadcn/kbd";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { VisualView } from "./VisualView";
import { UnverifiedNote } from "./VisualCard";
import { canExportPng, copyAsTable, downloadCsv, exportPng } from "./export";

type View = "chart" | "data";

export function VisualCanvas({
    visual,
    pinned,
    pinBusy,
    onTogglePin,
    onClose,
    handlesEscape = true,
}: {
    visual: StoredVisual;
    pinned?: boolean;
    /** The pin request is in flight. */
    pinBusy?: boolean;
    onTogglePin?: (visual: StoredVisual) => void;
    onClose: () => void;
    /** False when a Sheet around it already closes on Échap. */
    handlesEscape?: boolean;
}) {
    const { spec } = visual;
    const [view, setView] = useState<View>("chart");
    const [copied, setCopied] = useState(false);
    const [exporting, setExporting] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);
    const table = visualTable(spec);

    // The close button promises Échap: honour it, unless a dialog or menu above owns the key.
    useEffect(() => {
        if (!handlesEscape) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented) return;
            if (document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"], [data-slot="dropdown-menu-content"]')) return;
            onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose, handlesEscape]);

    return (
        <aside className="cp-viz flex h-full min-h-0 w-full flex-col border-l border-line bg-surface motion-safe:animate-ds-slide-in" aria-label={`Visuel : ${spec.title}`}>
            <header className="flex items-start justify-between gap-3 border-b border-line-subtle px-5 py-4">
                <div className="min-w-0">
                    <h2 className="text-[16px] font-semibold tracking-tight text-ink">{spec.title}</h2>
                    {spec.subtitle && <p className="mt-0.5 text-[12.5px] text-ink-3">{spec.subtitle}</p>}
                </div>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer le visuel">
                            <X aria-hidden />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent className="flex items-center gap-1.5">
                        Fermer <Kbd>Échap</Kbd>
                    </TooltipContent>
                </Tooltip>
            </header>

            <Tabs value={view} onValueChange={(v) => setView(v as View)} className="min-h-0 flex-1 gap-0">
                <div className="px-5 pt-3">
                    <TabsList variant="underline">
                        <TabsTrigger value="chart">Graphique</TabsTrigger>
                        <TabsTrigger value="data">Données</TabsTrigger>
                    </TabsList>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    <TabsContent value="chart" className="mt-0 outline-none">
                        <div ref={chartRef}>
                            <VisualView spec={spec} large />
                        </div>
                    </TabsContent>
                    <TabsContent value="data" className="mt-0 outline-none">
                        <div className="overflow-auto rounded-control border border-line-subtle">
                            <table className="w-full border-collapse text-[13px]">
                                <thead className="sticky top-0 bg-surface">
                                    <tr>
                                        {table.header.map((h) => (
                                            <th key={h} scope="col" className="border-b border-line px-3 py-2 text-left text-[12px] font-medium text-ink-3">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {table.rows.map((row, i) => (
                                        <tr key={i} className="border-b border-line-subtle last:border-0">
                                            {row.map((v, c) => (
                                                <td key={c} className={cn("px-3 py-1.5", typeof v === "number" ? "text-right font-medium tabular-nums text-ink" : "text-ink-2")}>
                                                    {typeof v === "number" ? formatValue(v) : (v ?? "—")}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </TabsContent>
                    <UnverifiedNote values={visual.unverified} />
                    {visual.source && <p className="mt-3 text-[12px] text-ink-3">Source : {visual.source.label}</p>}
                </div>
            </Tabs>

            <footer className="flex flex-wrap gap-2 border-t border-line-subtle px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <Button type="button" variant="outline" size="sm" onClick={() => downloadCsv(spec)}>
                    <Download aria-hidden /> CSV
                </Button>
                {canExportPng(spec) && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={exporting}
                        onClick={async () => {
                            if (!chartRef.current) {
                                setView("chart");
                                return;
                            }
                            setExporting(true);
                            try {
                                await exportPng(chartRef.current, spec);
                            } finally {
                                setExporting(false);
                            }
                        }}
                    >
                        {exporting ? <Loader2 className="animate-spin" aria-hidden /> : <ImageIcon aria-hidden />}
                        {exporting ? "Export…" : "Image"}
                    </Button>
                )}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                        if (await copyAsTable(spec)) {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                        }
                    }}
                >
                    {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
                    {copied ? "Copié" : "Copier"}
                </Button>
                {onTogglePin && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onTogglePin(visual)}
                        disabled={pinBusy}
                        aria-pressed={pinned}
                        className={cn(pinned && "border-accent-200 bg-accent-soft text-accent-soft-ink hover:bg-accent-soft")}
                    >
                        {pinBusy ? <Loader2 className="animate-spin" aria-hidden /> : pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                        {pinned ? "Retirer du tableau" : "Épingler au dossier"}
                    </Button>
                )}
            </footer>
        </aside>
    );
}
