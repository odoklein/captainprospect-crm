"use client";

import { useMemo } from "react";
import { Briefcase, Building2, Database, FilterX, UserRound } from "lucide-react";
import type { StatsFilterOptions } from "@/app/api/analytics/filters/route";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/utils";
import { PRESET_OPTIONS, resolvePreset, stateRange, type PeriodPreset, type StatsState } from "@/lib/stats/period";
import { FilterPopover } from "./shared";

const DATE_INPUT =
    "h-9 rounded-control border border-line bg-surface px-2.5 text-[13px] font-semibold text-ink shadow-2xs transition-colors hover:border-line-strong focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/15";

/**
 * Period + scope filters, kept in view while the page scrolls: the question
 * "for whom, over what time" is always one glance away from the figures it changes.
 */
export function StatsToolbar({
    state,
    onChange,
    options,
}: {
    state: StatsState;
    onChange: (patch: Partial<StatsState>) => void;
    options: StatsFilterOptions | undefined;
}) {
    const scopeActive = state.sdrIds.length + state.missionIds.length + state.clientIds.length + state.listIds.length > 0;

    const clientOptions = useMemo(() => (options?.clients ?? []).map((c) => ({ value: c.id, label: c.name })), [options]);

    // A chosen client narrows the missions on offer, a chosen mission narrows the lists.
    const missionOptions = useMemo(
        () =>
            (options?.missions ?? [])
                .filter((m) => state.clientIds.length === 0 || state.clientIds.includes(m.clientId))
                .map((m) => ({ value: m.id, label: m.name, hint: m.clientName, muted: m.status !== "ACTIVE" })),
        [options, state.clientIds],
    );
    const missionNames = useMemo(() => new Map((options?.missions ?? []).map((m) => [m.id, m.name])), [options]);
    const listOptions = useMemo(
        () =>
            (options?.lists ?? [])
                .filter((l) => state.missionIds.length === 0 || (l.missionId && state.missionIds.includes(l.missionId)))
                .map((l) => ({ value: l.id, label: l.name, hint: l.missionId ? missionNames.get(l.missionId) : undefined })),
        [options, state.missionIds, missionNames],
    );
    const sdrOptions = useMemo(
        () =>
            [...(options?.sdrs ?? [])]
                .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "fr"))
                .map((s) => ({ value: s.id, label: s.name, hint: s.isActive ? undefined : "Compte désactivé", muted: !s.isActive })),
        [options],
    );

    const choosePreset = (preset: PeriodPreset) => {
        if (preset === "custom") {
            // Start the custom range from what is currently on screen.
            const { start, end } = stateRange(state);
            onChange({ preset, from: start, to: end });
        } else {
            const { start, end } = resolvePreset(preset);
            onChange({ preset, from: start, to: end });
        }
    };

    return (
        <div className="sticky top-12 z-20 -mx-5 border-b border-line bg-canvas/90 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-canvas/75 lg:-mx-6 lg:px-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                    <SegmentedControl
                        ariaLabel="Période"
                        value={state.preset}
                        onChange={choosePreset}
                        options={PRESET_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                    />
                    {state.preset === "custom" && (
                        <div className="flex items-center gap-1.5">
                            <input
                                type="date"
                                aria-label="Début de la période"
                                value={state.from}
                                max={state.to}
                                onChange={(e) => e.target.value && onChange({ from: e.target.value })}
                                className={DATE_INPUT}
                            />
                            <span className="text-ink-4" aria-hidden>→</span>
                            <input
                                type="date"
                                aria-label="Fin de la période"
                                value={state.to}
                                min={state.from}
                                onChange={(e) => e.target.value && onChange({ to: e.target.value })}
                                className={DATE_INPUT}
                            />
                        </div>
                    )}
                </div>

                <span className="hidden h-6 w-px bg-line lg:block" aria-hidden />

                <div className="flex flex-wrap items-center gap-2">
                    <FilterPopover
                        label="Clients"
                        icon={<Building2 />}
                        options={clientOptions}
                        value={state.clientIds}
                        // A client change can orphan the chosen missions and lists: drop them.
                        onChange={(clientIds) => onChange({ clientIds, missionIds: [], listIds: [] })}
                        searchPlaceholder="Rechercher un client…"
                    />
                    <FilterPopover
                        label="Missions"
                        icon={<Briefcase />}
                        options={missionOptions}
                        value={state.missionIds}
                        onChange={(missionIds) => onChange({ missionIds, listIds: [] })}
                        searchPlaceholder="Rechercher une mission…"
                    />
                    <FilterPopover
                        label="SDR"
                        icon={<UserRound />}
                        options={sdrOptions}
                        value={state.sdrIds}
                        onChange={(sdrIds) => onChange({ sdrIds })}
                        searchPlaceholder="Rechercher un SDR…"
                    />
                    <FilterPopover
                        label="Listes"
                        icon={<Database />}
                        options={listOptions}
                        value={state.listIds}
                        onChange={(listIds) => onChange({ listIds })}
                        searchPlaceholder="Rechercher une liste…"
                    />
                    <button
                        type="button"
                        onClick={() => onChange({ sdrIds: [], missionIds: [], clientIds: [], listIds: [] })}
                        disabled={!scopeActive}
                        className={cn(
                            "inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-semibold text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink",
                            "outline-none focus-visible:ring-2 focus-visible:ring-focus",
                            !scopeActive && "pointer-events-none invisible",
                        )}
                    >
                        <FilterX className="size-3.5" aria-hidden /> Réinitialiser
                    </button>
                </div>
            </div>
        </div>
    );
}
