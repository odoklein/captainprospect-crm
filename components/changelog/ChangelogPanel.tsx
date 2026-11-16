"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, Info, Receipt, Rocket, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { FOCUS_RING } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, NOTE_TYPE_LABELS, NOTE_TYPES, type ChangelogCategory, type NoteType } from "@/lib/changelog/contract";
import type { FeedItem } from "@/lib/changelog/service";
import { formatDay, formatWindow } from "./format";

type Filter = "all" | "release" | "announcement";

const CATEGORY_LOOK: Record<ChangelogCategory, { icon: LucideIcon; tone: string; bar: string }> = {
    feature: { icon: Sparkles, tone: "bg-accent-50 text-accent-700", bar: "bg-accent-500" },
    maintenance: { icon: Wrench, tone: "bg-amber-50 text-amber-800", bar: "bg-amber-500" },
    info: { icon: Info, tone: "bg-sky-50 text-sky-800", bar: "bg-sky-500" },
    billing: { icon: Receipt, tone: "bg-violet-50 text-violet-800", bar: "bg-violet-500" },
};

const NOTE_LOOK: Record<NoteType, string> = {
    new: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    improved: "bg-sky-50 text-sky-800 ring-sky-200",
    fixed: "bg-amber-50 text-amber-900 ring-amber-200",
};

function Cta({ cta }: { cta: NonNullable<FeedItem["cta"]> }) {
    const cls = cn("mt-3 inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink/90", FOCUS_RING);
    return cta.url.startsWith("/") ? (
        <Link href={cta.url} className={cls}>
            {cta.label}
            <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
    ) : (
        <a href={cta.url} target="_blank" rel="noopener noreferrer" className={cls}>
            {cta.label}
            <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
    );
}

function NewDot({ show }: { show: boolean }) {
    if (!show) return null;
    return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-700">
            <span className="size-1.5 rounded-full bg-accent-600" aria-hidden />
            Non lu
        </span>
    );
}

function Announcement({ item, fresh }: { item: FeedItem; fresh: boolean }) {
    const cat = (item.category ?? "info") as ChangelogCategory;
    const look = CATEGORY_LOOK[cat] ?? CATEGORY_LOOK.info;
    const Icon = look.icon;
    const when = formatWindow(item.startsAt, item.endsAt);
    return (
        <>
            <span className={cn("absolute left-0 top-4 bottom-4 w-1 rounded-r-full", item.severity === "warning" ? "bg-amber-500" : look.bar)} aria-hidden />
            <div className="flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-semibold", look.tone)}>
                    <Icon className="size-3.5" aria-hidden />
                    {CATEGORY_LABELS[cat] ?? "Information"}
                </span>
                <NewDot show={fresh} />
                <span className="ml-auto text-[11.5px] text-ink-3">{formatDay(item.publishedAt)}</span>
            </div>
            <h3 className="mt-2 text-[15px] font-semibold leading-snug text-ink">{item.title}</h3>
            {when && (
                <p className={cn("mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium", item.severity === "warning" ? "text-amber-800" : "text-ink-2")}>
                    <CalendarClock className="size-3.5" aria-hidden />
                    {when}
                </p>
            )}
            {item.summary && <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{item.summary}</p>}
            {item.cta && <Cta cta={item.cta} />}
        </>
    );
}

function Release({ item, fresh }: { item: FeedItem; fresh: boolean }) {
    const groups = NOTE_TYPES.map((t) => ({ type: t, notes: item.items.filter((n) => n.type === t) })).filter((g) => g.notes.length);
    return (
        <>
            <span className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-ink" aria-hidden />
            <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-3 px-2 py-0.5 text-[11.5px] font-semibold text-ink">
                    <Rocket className="size-3.5" aria-hidden />
                    Mise à jour
                </span>
                {item.version && <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-3">{item.version}</code>}
                <NewDot show={fresh} />
                <span className="ml-auto text-[11.5px] text-ink-3">{formatDay(item.publishedAt)}</span>
            </div>
            <h3 className="mt-2 text-[15px] font-semibold leading-snug text-ink">{item.title}</h3>
            {item.summary && <p className="mt-1.5 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{item.summary}</p>}
            <div className="mt-3 space-y-3">
                {groups.map((g) => (
                    <section key={g.type}>
                        <h4 className={cn("mb-1.5 inline-flex rounded-md px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide ring-1", NOTE_LOOK[g.type])}>
                            {NOTE_TYPE_LABELS[g.type]}
                        </h4>
                        <ul className="space-y-2">
                            {g.notes.map((n, i) => (
                                <li key={`${g.type}-${i}`} className="text-[13.5px] leading-snug">
                                    <span className="font-medium text-ink">{n.title}</span>
                                    {n.module && <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-px text-[11px] font-medium text-ink-3">{n.module}</span>}
                                    {n.body && <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{n.body}</p>}
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
            {item.cta && <Cta cta={item.cta} />}
        </>
    );
}

export default function ChangelogPanel({ items, unseenAtOpen, focusId, onClose }: { items: FeedItem[]; unseenAtOpen: Set<string>; focusId?: string; onClose: () => void }) {
    const [filter, setFilter] = useState<Filter>("all");
    const focusRef = useRef<HTMLLIElement>(null);
    const counts = useMemo(() => ({ all: items.length, release: items.filter((i) => i.kind === "release").length, announcement: items.filter((i) => i.kind === "announcement").length }), [items]);
    const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);

    useEffect(() => {
        if (focusId) focusRef.current?.scrollIntoView({ block: "start" });
    }, [focusId]);

    const tabs: { id: Filter; label: string }[] = [
        { id: "all", label: "Tout" },
        { id: "release", label: "Mises à jour" },
        { id: "announcement", label: "Annonces" },
    ];

    return (
        <Drawer isOpen onClose={onClose} title="Nouveautés" description="Ce qui change dans votre CRM, et ce qui arrive bientôt." size="md">
            <div className="-mt-1 mb-4 inline-flex rounded-lg bg-surface-2 p-0.5" role="tablist" aria-label="Filtrer">
                {tabs.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={filter === t.id}
                        onClick={() => setFilter(t.id)}
                        className={cn(
                            "rounded-md px-2.5 py-1 text-[12.5px] font-semibold transition-colors",
                            filter === t.id ? "bg-white text-ink shadow-2xs" : "text-ink-3 hover:text-ink",
                            FOCUS_RING,
                        )}
                    >
                        {t.label}
                        <span className="ml-1 tabular-nums text-ink-4">{counts[t.id]}</span>
                    </button>
                ))}
            </div>

            {shown.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-16 text-center">
                    <span className="mb-3 inline-flex size-11 items-center justify-center rounded-2xl bg-surface-2 text-ink-3">
                        <Sparkles className="size-5" aria-hidden />
                    </span>
                    <p className="text-sm font-semibold text-ink">Rien de neuf pour l&apos;instant</p>
                    <p className="mt-1 max-w-xs text-[12.5px] text-ink-3">Les mises à jour du CRM et les annonces de la plateforme apparaîtront ici.</p>
                </div>
            ) : (
                <ol className="space-y-3">
                    {shown.map((item) => (
                        <li
                            key={item.id}
                            ref={item.id === focusId ? focusRef : undefined}
                            className={cn(
                                "relative overflow-hidden rounded-2xl border bg-white py-4 pl-5 pr-4",
                                item.severity === "warning" ? "border-amber-200" : "border-line",
                                item.id === focusId && "ring-2 ring-accent-200",
                            )}
                        >
                            {item.kind === "release" ? <Release item={item} fresh={unseenAtOpen.has(item.id)} /> : <Announcement item={item} fresh={unseenAtOpen.has(item.id)} />}
                        </li>
                    ))}
                </ol>
            )}
        </Drawer>
    );
}
