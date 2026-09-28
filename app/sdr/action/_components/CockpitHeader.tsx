"use client";

import { CheckCircle2, Keyboard, PhoneCall, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ListItem, Mission } from "../_lib/types";
import { CpButton, FilterSelect, IconButton, Kbd } from "./primitives";

interface CockpitHeaderProps {
    missions: Mission[];
    mission: Mission | null;
    onMissionChange: (id: string) => void;
    lists: ListItem[];
    listId: string | null;
    onListChange: (id: string | null) => void;
    doneToday: number;
    isSyncing: boolean;
    syncResult: { enriched: number; total: number } | null;
    onSync: () => void;
    scriptOpen: boolean;
    onToggleScript: () => void;
    onHelp: () => void;
}

export function CockpitHeader({
    missions,
    mission,
    onMissionChange,
    lists,
    listId,
    onListChange,
    doneToday,
    isSyncing,
    syncResult,
    onSync,
    scriptOpen,
    onToggleScript,
    onHelp,
}: CockpitHeaderProps) {
    return (
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cp-green text-white">
                    <PhoneCall className="size-5" aria-hidden />
                </div>
                <div className="min-w-0">
                    <h1 className="text-xl font-semibold leading-tight tracking-tight text-cp-ink">File d&apos;actions</h1>
                    <p className="truncate text-sm text-cp-ink-3">
                        {mission ? `${mission.client?.name ? `${mission.client.name} · ` : ""}${mission.name}` : "Aucune mission planifiée aujourd'hui"}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {missions.length > 0 && (
                    <FilterSelect
                        label="Mission"
                        value={mission?.id ?? ""}
                        onChange={onMissionChange}
                        options={missions.map((m) => ({ value: m.id, label: m.name }))}
                    />
                )}
                {mission && (
                    <FilterSelect
                        label="Liste"
                        value={listId ?? "all"}
                        onChange={(v) => onListChange(v === "all" ? null : v)}
                        options={[{ value: "all", label: "Toutes les listes" }, ...lists.map((l) => ({ value: l.id, label: l.name }))]}
                        active={!!listId}
                    />
                )}

                <span className="mx-1 hidden h-6 w-px bg-cp-border lg:block" aria-hidden />

                <div
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cp-green/20 bg-cp-green-soft px-2.5 text-xs text-cp-green"
                    title="Actions enregistrées depuis cette page aujourd'hui"
                >
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    <span className="text-sm font-semibold tabular-nums">{doneToday}</span>
                    <span>traité{doneToday > 1 ? "s" : ""} aujourd&apos;hui</span>
                </div>

                <CpButton
                    size="sm"
                    icon={ScrollText}
                    onClick={onToggleScript}
                    aria-pressed={scriptOpen}
                    className={cn(scriptOpen && "border-cp-green/40 bg-cp-green-soft text-cp-green")}
                    disabled={!mission}
                >
                    Script <Kbd className="ml-0.5">S</Kbd>
                </CpButton>

                <CpButton
                    size="sm"
                    icon={PhoneCall}
                    onClick={onSync}
                    isLoading={isSyncing}
                    title="Synchroniser les résumés et transcriptions d'appels Allo (24 dernières heures)"
                >
                    {isSyncing ? "Synchro…" : "Sync appels"}
                    {syncResult && !isSyncing && (
                        <span className="rounded-full bg-cp-sunken px-1.5 text-xs tabular-nums text-cp-ink-2">
                            {syncResult.enriched}/{syncResult.total}
                        </span>
                    )}
                </CpButton>

                <IconButton icon={Keyboard} label="Raccourcis clavier (?)" size="sm" onClick={onHelp} />
            </div>
        </header>
    );
}
