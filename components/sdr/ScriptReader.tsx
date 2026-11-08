"use client";

// ============================================
// SCRIPT READER — the campaign script as it is read during a call.
//
// Sections (intro, discovery, objections, closing…) are numbered steps with
// a jump bar that follows the reading, so « Objections » is one click away
// mid-call. Placeholders are filled from the prospect on screen
// ({prénom} → Sophie) and marked, those with nothing on file stand out.
// Plain reading type: no coloured cards, no shadows.
// ============================================

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseStrategySections } from "@/components/strategy/StrategyArtifactViewer";
import { fillScript, shortSectionTitle, type ScriptVars } from "@/lib/sdr-queue/script-fill";

function ScriptText({ text, vars }: { text: string; vars: ScriptVars }) {
    const pieces = useMemo(() => fillScript(text, vars), [text, vars]);
    return (
        <>
            {pieces.map((p, i) =>
                p.kind === "text" ? (
                    <Fragment key={i}>{p.text}</Fragment>
                ) : p.value ? (
                    <mark key={i} title={`Rempli depuis la fiche (${p.raw})`} className="rounded-[4px] bg-primary-50 px-0.5 font-medium text-primary-800">
                        {p.value}
                    </mark>
                ) : (
                    <mark key={i} title="Rien sur la fiche pour ce champ" className="rounded-[4px] bg-warning-soft px-0.5 font-medium text-warning-ink">
                        {p.raw}
                    </mark>
                ),
            )}
        </>
    );
}

export function ScriptReader({
    content,
    vars = {},
    emptyText = "Aucun script configuré sur cette campagne.",
    stickyTop = 0,
}: {
    content: string | null | undefined;
    vars?: ScriptVars;
    emptyText?: string;
    /** Offset of the jump bar when the reader scrolls under a sticky header (px). */
    stickyTop?: number;
}) {
    const sections = useMemo(() => (content?.trim() ? parseStrategySections(content, "script") : []), [content]);
    const [active, setActive] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const multi = sections.length > 1;
    const current = active ?? sections[0]?.id ?? null;

    // The jump bar follows the section being read.
    useEffect(() => {
        if (!multi || !rootRef.current) return;
        const scroller = rootRef.current.closest<HTMLElement>(".drawer-scrollbar, [data-scroll-root]") ?? null;
        const obs = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible[0]) setActive(visible[0].target.getAttribute("data-section"));
            },
            { root: scroller, rootMargin: `-${stickyTop + 56}px 0px -55% 0px` },
        );
        rootRef.current.querySelectorAll("[data-section]").forEach((el) => obs.observe(el));
        return () => obs.disconnect();
    }, [multi, sections, stickyTop]);

    if (!sections.length) {
        return <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">{emptyText}</p>;
    }

    const copy = async (id: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(id);
            setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
        } catch {
            /* clipboard blocked */
        }
    };

    return (
        <div ref={rootRef}>
            {multi && (
                <nav
                    aria-label="Étapes du script"
                    className="sticky z-[1] -mx-5 mb-5 border-b border-line-subtle bg-surface/95 px-5 py-2 backdrop-blur"
                    style={{ top: stickyTop }}
                >
                    <ol className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
                        {sections.map((s, i) => {
                            const on = s.id === current;
                            return (
                                <li key={s.id} className="shrink-0">
                                    <button
                                        type="button"
                                        aria-current={on ? "step" : undefined}
                                        onClick={() => {
                                            setActive(s.id);
                                            rootRef.current?.querySelector(`[data-section="${s.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                                        }}
                                        className={cn(
                                            "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] transition-colors",
                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                                            on ? "bg-primary text-primary-fg" : "text-ink-3 hover:bg-surface-2 hover:text-ink",
                                        )}
                                    >
                                        <span className={cn("tabular-nums", on ? "text-primary-fg/70" : "text-ink-4")}>{i + 1}</span>
                                        {shortSectionTitle(s.title)}
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                </nav>
            )}

            <div className="space-y-7">
                {sections.map((s, i) => (
                    <section
                        key={s.id}
                        data-section={s.id}
                        aria-labelledby={`script-${s.id}`}
                        className="group"
                        style={{ scrollMarginTop: stickyTop + 60 }}
                    >
                        <header className="mb-2 flex items-center gap-2.5">
                            {multi && (
                                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold tabular-nums text-ink-2">
                                    {i + 1}
                                </span>
                            )}
                            <h3 id={`script-${s.id}`} className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                                {multi ? shortSectionTitle(s.title) : "Script d'appel"}
                            </h3>
                            <button
                                type="button"
                                onClick={() => void copy(s.id, s.content)}
                                className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11.5px] text-ink-4 opacity-0 transition-opacity hover:bg-surface-2 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus [@media(hover:none)]:opacity-100"
                                aria-label={`Copier « ${shortSectionTitle(s.title)} »`}
                            >
                                {copied === s.id ? <Check className="size-3 text-success" aria-hidden /> : <Copy className="size-3" aria-hidden />}
                                {copied === s.id ? "Copié" : "Copier"}
                            </button>
                        </header>
                        <div className={cn("whitespace-pre-wrap text-[14px] leading-[1.7] text-ink-2 [overflow-wrap:anywhere]", multi && "pl-[30px]")}>
                            <ScriptText text={s.content} vars={vars} />
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
