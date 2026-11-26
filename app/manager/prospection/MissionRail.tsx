"use client";

// ============================================
// MISSION RAIL — the left column of « Appels » (/manager/prospection): every
// running mission of the channel as a card that says whether it needs the
// manager (lib/missions/board): its verdict, today's activity, its meetings
// against the target, who is on it now, and the one thing to fix — a link
// that does it, not just a way into the mission.
// ============================================

import { useState, type Ref } from "react";
import Link from "next/link";
import { Linkedin, Mail, Mic, Phone, SlidersHorizontal } from "lucide-react";
import { Kbd } from "@/components/ui";
import { cn } from "@/lib/utils";
import { isLive, type BoardEntry, type MissionPulseSdr, type VerdictTone } from "@/lib/missions/board";
import type { NextActionKind } from "@/lib/missions/pulse";
import { ICON_CONTROL, SearchField } from "@/components/workspace/Workspace";

export const CHANNELS = [
    { value: "CALL", label: "Appels", icon: Phone },
    { value: "EMAIL", label: "Email", icon: Mail },
    { value: "LINKEDIN", label: "LinkedIn", icon: Linkedin },
] as const;
export type ChannelValue = (typeof CHANNELS)[number]["value"];

const CHANNEL_ICON: Record<string, typeof Phone> = { CALL: Phone, EMAIL: Mail, LINKEDIN: Linkedin };
const UNIT: Record<ChannelValue, [string, string]> = { CALL: ["appel", "appels"], EMAIL: ["email", "emails"], LINKEDIN: ["action", "actions"] };

/** Where each « next action » is done, in the mission's workspace. */
const NEXT_TAB: Record<NextActionKind, string> = {
    assign: "equipe",
    lists: "audience",
    launch: "lancement",
    resume: "general",
    target: "general",
    extend: "general",
    funnel: "general",
    none: "general",
};

const VERDICT_CLASS: Record<VerdictTone, string> = {
    danger: "bg-danger-soft text-danger-ink",
    warning: "bg-warning-soft text-warning-ink",
    good: "text-success-ink",
    neutral: "text-ink-3",
};

export function VerdictChip({ verdict, className }: { verdict: BoardEntry["verdict"]; className?: string }) {
    return (
        <span className={cn("inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-md px-1.5 text-[11.5px] font-medium", VERDICT_CLASS[verdict.tone], className)}>
            {verdict.label}
        </span>
    );
}

const initials = (name: string) =>
    name
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

function Avatars({ sdrs, now }: { sdrs: MissionPulseSdr[]; now: number }) {
    if (sdrs.length === 0) return <span className="text-[12px] text-ink-3">Aucun SDR</span>;
    const shown = sdrs.slice(0, 3);
    const live = sdrs.filter((s) => isLive(s, now));
    return (
        <span className="flex items-center" title={sdrs.map((s) => `${s.name}${isLive(s, now) ? " (en ce moment)" : ""}`).join(", ")}>
            {shown.map((s, i) => (
                <span
                    key={s.id}
                    className={cn(
                        "relative flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 text-[9px] font-semibold text-ink-2 ring-2 ring-surface",
                        i > 0 && "-ml-1.5",
                    )}
                >
                    {initials(s.name)}
                    {isLive(s, now) && <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-surface" aria-hidden />}
                </span>
            ))}
            {sdrs.length > 3 && <span className="ml-1 text-[11.5px] text-ink-3">+{sdrs.length - 3}</span>}
            {live.length > 0 && <span className="ml-1.5 text-[11.5px] text-success-ink">{live.length} en ce moment</span>}
        </span>
    );
}

function MissionCard({ entry, channel, selected, onSelect, now }: { entry: BoardEntry; channel: ChannelValue; selected: boolean; onSelect: () => void; now: number }) {
    const { row, next, verdict } = entry;
    const [one, many] = UNIT[channel];
    const target = row.targetMeetings && row.targetMeetings > 0 ? row.targetMeetings : null;
    return (
        <li
            data-mission={row.id}
            className={cn(
                "group relative border-b border-line-subtle px-4 py-3 transition-colors",
                selected ? "bg-primary-soft shadow-[inset_2px_0_0_var(--ds-primary)]" : "hover:bg-surface-2",
            )}
        >
            <button type="button" onClick={onSelect} aria-current={selected ? "true" : undefined} aria-label={`${row.name} — ${verdict.label}`} className="absolute inset-0 focus-visible:outline-offset-[-2px]" />
            <div className="pointer-events-none">
                <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-[14px] font-semibold leading-tight text-ink">{row.name}</p>
                    <VerdictChip verdict={verdict} />
                </div>
                <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-ink-3">
                    <span className="truncate">{row.client?.name ?? "Sans client"}</span>
                    {row.channels.length > 1 &&
                        row.channels.map((c) => {
                            const Icon = CHANNEL_ICON[c] ?? Phone;
                            return <Icon key={c} className={cn("h-3 w-3 shrink-0", c === channel ? "text-ink-2" : "text-ink-4")} aria-label={c} />;
                        })}
                </p>
                <p className="mt-2 text-[12px] tabular-nums text-ink-2">
                    {row.today.actions ? (
                        <>
                            {row.today.actions} {row.today.actions > 1 ? many : one}
                            {channel === "CALL" && ` · ${row.today.reached} joint${row.today.reached > 1 ? "s" : ""}`}
                            {row.today.meetings > 0 && ` · ${row.today.meetings} RDV`}
                            <span className="text-ink-3"> aujourd&apos;hui</span>
                        </>
                    ) : (
                        <span className="text-ink-3">Rien aujourd&apos;hui</span>
                    )}
                </p>
                {target && (
                    <div className="mt-2 flex items-center gap-2" title={`${row.meetings} RDV sur ${target} visés`}>
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                            <div
                                className={cn("h-full rounded-full", verdict.tone === "warning" || verdict.tone === "danger" ? "bg-warning" : "bg-primary")}
                                style={{ width: `${Math.min(100, (row.meetings / target) * 100)}%` }}
                            />
                        </div>
                        <span className="text-[11.5px] tabular-nums text-ink-3">
                            {row.meetings}/{target} RDV
                        </span>
                    </div>
                )}
                <div className="mt-2 flex min-h-5 items-center justify-between gap-2">
                    <Avatars sdrs={row.sdrs} now={now} />
                    {next.action && next.kind !== "none" && (
                        <Link
                            href={`/manager/missions/${row.id}?tab=${NEXT_TAB[next.kind]}`}
                            title={next.title}
                            className="pointer-events-auto relative z-[1] shrink-0 rounded text-[12px] font-medium text-primary hover:underline"
                        >
                            {next.action}
                        </Link>
                    )}
                </div>
            </div>
        </li>
    );
}

export function MissionRail({
    channel,
    onChannel,
    entries,
    total,
    loading,
    selectedId,
    onSelect,
    search,
    onSearch,
    searchRef,
    clients,
    clientId,
    onClient,
    sdrs,
    sdrId,
    onSdr,
    onSyncAll,
    now,
    className,
}: {
    channel: ChannelValue;
    onChannel: (c: ChannelValue) => void;
    /** Sorted and filtered. */
    entries: BoardEntry[];
    /** Missions on the channel before the rail's filters. */
    total: number;
    loading: boolean;
    selectedId: string | null;
    onSelect: (id: string) => void;
    search: string;
    onSearch: (v: string) => void;
    searchRef?: Ref<HTMLInputElement>;
    clients: { id: string; name: string }[];
    clientId: string;
    onClient: (v: string) => void;
    sdrs: { id: string; name: string }[];
    sdrId: string;
    onSdr: (v: string) => void;
    onSyncAll?: () => void;
    now: number;
    className?: string;
}) {
    const [filtersOpen, setFiltersOpen] = useState(false);
    const filtering = Boolean(clientId || sdrId);
    const select = "h-8 w-full cursor-pointer rounded-control border border-line bg-surface px-2 text-[12.5px] text-ink";
    return (
        <aside className={cn("flex min-h-0 flex-col border-r border-line bg-surface", className)} aria-label="Missions">
            <div className="shrink-0 space-y-3 border-b border-line px-4 pb-3 pt-3">
                <div className="flex min-h-8 items-center justify-between gap-2">
                    <h1 className="text-[18px] font-semibold leading-tight tracking-[-0.015em] text-ink">Appels</h1>
                    {onSyncAll && (
                        <button type="button" onClick={onSyncAll} className={ICON_CONTROL} title="Synchroniser les appels Allo de toutes les missions" aria-label="Synchroniser les appels Allo de toutes les missions">
                            <Mic className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
                <div role="radiogroup" aria-label="Canal" className="grid grid-cols-3 rounded-control bg-surface-3/70 p-0.5">
                    {CHANNELS.map((c) => {
                        const Icon = c.icon;
                        return (
                            <button
                                key={c.value}
                                type="button"
                                role="radio"
                                aria-checked={channel === c.value}
                                onClick={() => onChannel(c.value)}
                                className={cn(
                                    "cp-press flex h-7 items-center justify-center gap-1.5 rounded-[6px] text-[12px] font-medium transition-colors",
                                    channel === c.value ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" aria-hidden />
                                {c.label}
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-2">
                    <SearchField value={search} onChange={onSearch} inputRef={searchRef} placeholder="Mission ou client…" label="Rechercher une mission" className="min-w-0 sm:max-w-none" />
                    <button
                        type="button"
                        onClick={() => setFiltersOpen((o) => !o)}
                        aria-expanded={filtersOpen}
                        aria-label="Filtrer par client ou SDR"
                        title="Filtrer par client ou SDR"
                        className={cn(ICON_CONTROL, "shrink-0", filtering && "border-primary text-primary")}
                    >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                    </button>
                </div>
                {(filtersOpen || filtering) && (
                    <div className="grid grid-cols-2 gap-2">
                        <select value={clientId} onChange={(e) => onClient(e.target.value)} aria-label="Client" className={select}>
                            <option value="">Tous les clients</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                        <select value={sdrId} onChange={(e) => onSdr(e.target.value)} aria-label="SDR affecté" className={select}>
                            <option value="">Tous les SDR</option>
                            {sdrs.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <ul className="min-h-0 flex-1 overflow-auto">
                {loading && entries.length === 0 ? (
                    Array.from({ length: 6 }, (_, i) => (
                        <li key={i} className="space-y-2 border-b border-line-subtle px-4 py-3.5">
                            <div className="cp-shimmer h-3.5 w-2/3 rounded" />
                            <div className="cp-shimmer h-2.5 w-1/3 rounded" />
                            <div className="cp-shimmer h-2.5 w-1/2 rounded" />
                        </li>
                    ))
                ) : entries.length === 0 ? (
                    <li className="px-4 py-10 text-center text-[13px] text-ink-3">
                        {total === 0 ? `Aucune mission active sur ce canal.` : "Aucune mission ne correspond."}
                    </li>
                ) : (
                    entries.map((e) => (
                        <MissionCard key={e.row.id} entry={e} channel={channel} selected={e.row.id === selectedId} onSelect={() => onSelect(e.row.id)} now={now} />
                    ))
                )}
            </ul>

            <footer className="flex h-10 shrink-0 items-center justify-between border-t border-line px-4 text-[12px] text-ink-3">
                <span className="tabular-nums">
                    {entries.length} mission{entries.length > 1 ? "s" : ""}
                    {entries.length !== total ? ` sur ${total}` : ""}
                </span>
                <span className="hidden items-center gap-1 text-[11px] text-ink-4 lg:flex">
                    <Kbd>[</Kbd> <Kbd>]</Kbd> changer
                </span>
            </footer>
        </aside>
    );
}
