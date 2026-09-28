"use client";

import { forwardRef } from "react";
import { Loader2, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHANNEL_LABELS, type Channel } from "@/lib/types";
import { countActiveFilters, type QueueFilters, type SortId, type TargetType } from "../_lib/queue-selectors";
import { FilterSelect, focusRing, IconButton, Kbd, Segmented } from "./primitives";

const SORT_OPTIONS: Array<{ value: SortId; label: string }> = [
    { value: "priority", label: "Priorité (recommandé)" },
    { value: "callback", label: "Échéance de rappel" },
    { value: "stale", label: "Dernier contact le plus ancien" },
    { value: "name", label: "Nom A → Z" },
];

const TYPE_OPTIONS: Array<{ value: TargetType; label: string }> = [
    { value: "contact", label: "Contacts" },
    { value: "company", label: "Sociétés" },
    { value: "all", label: "Tous" },
];

interface CommandBarProps {
    search: string;
    onSearchChange: (value: string) => void;
    isSearching: boolean;
    filters: QueueFilters;
    onFiltersChange: (patch: Partial<QueueFilters>) => void;
    onReset: () => void;
    statusOptions: Array<{ value: string; label: string; count: number }>;
    channels: string[];
    shown: number;
    total: number;
    doneCount: number;
    isFetching: boolean;
    onRefresh: () => void;
}

export const CommandBar = forwardRef<HTMLInputElement, CommandBarProps>(function CommandBar(
    {
        search,
        onSearchChange,
        isSearching,
        filters,
        onFiltersChange,
        onReset,
        statusOptions,
        channels,
        shown,
        total,
        doneCount,
        isFetching,
        onRefresh,
    },
    searchRef,
) {
    const activeCount = countActiveFilters(filters) + (search.trim() ? 1 : 0);

    return (
        <div className="flex flex-col gap-2 border-b border-cp-border px-3 py-2.5 lg:flex-row lg:items-center">
            {/* Search */}
            <div className="relative w-full lg:max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-cp-ink-3" aria-hidden />
                <input
                    ref={searchRef}
                    type="search"
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Nom, société ou numéro…"
                    aria-label="Rechercher dans la file"
                    className={cn(
                        "h-8 w-full rounded-lg border border-cp-border bg-cp-canvas pl-8 pr-14 text-sm text-cp-ink placeholder:text-cp-ink-3",
                        "focus:border-cp-green focus:bg-cp-raised focus:outline-none focus:ring-2 focus:ring-cp-green/25",
                        "[&::-webkit-search-cancel-button]:hidden",
                    )}
                />
                <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    {isSearching ? (
                        <Loader2 className="size-3.5 animate-spin text-cp-ink-3" aria-label="Recherche en cours" />
                    ) : search ? (
                        <button
                            type="button"
                            onClick={() => onSearchChange("")}
                            aria-label="Effacer la recherche"
                            className={cn("rounded p-0.5 text-cp-ink-3 hover:text-cp-ink", focusRing)}
                        >
                            <X className="size-3.5" />
                        </button>
                    ) : (
                        <Kbd>/</Kbd>
                    )}
                </span>
            </div>

            {/* Filters */}
            <div className="flex flex-1 flex-wrap items-center gap-2">
                <Segmented label="Type de cible" value={filters.type} onChange={(type) => onFiltersChange({ type })} options={TYPE_OPTIONS} />
                <FilterSelect
                    label="Statut"
                    value={filters.status}
                    onChange={(status) => onFiltersChange({ status })}
                    active={!!filters.status}
                    options={[
                        { value: "", label: "Tous" },
                        ...statusOptions.map((o) => ({ value: o.value, label: `${o.label} (${o.count})` })),
                    ]}
                />
                {channels.length > 1 && (
                    <FilterSelect
                        label="Canal"
                        value={filters.channel}
                        onChange={(channel) => onFiltersChange({ channel })}
                        active={!!filters.channel}
                        options={[
                            { value: "", label: "Tous" },
                            ...channels.map((c) => ({ value: c, label: CHANNEL_LABELS[c as Channel] ?? c })),
                        ]}
                    />
                )}
                <FilterSelect
                    label="Tri"
                    value={filters.sort}
                    onChange={(sort) => onFiltersChange({ sort: sort as SortId })}
                    options={SORT_OPTIONS}
                    active={filters.sort !== "priority"}
                />
                <label
                    className={cn(
                        "inline-flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors",
                        "focus-within:ring-2 focus-within:ring-cp-green/40",
                        filters.hideDone ? "border-cp-green/40 bg-cp-green-soft text-cp-green" : "border-cp-border bg-cp-raised text-cp-ink-2 hover:border-cp-border-strong",
                    )}
                >
                    <input
                        type="checkbox"
                        checked={filters.hideDone}
                        onChange={(e) => onFiltersChange({ hideDone: e.target.checked })}
                        className="size-3.5 accent-cp-green"
                    />
                    Masquer les traités{doneCount > 0 ? ` (${doneCount})` : ""}
                </label>
                {activeCount > 0 && (
                    <button
                        type="button"
                        onClick={onReset}
                        className={cn("inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-cp-ink-3 hover:bg-cp-sunken hover:text-cp-ink", focusRing)}
                    >
                        <RotateCcw className="size-3" aria-hidden />
                        Réinitialiser ({activeCount})
                    </button>
                )}
            </div>

            {/* Count + refresh */}
            <div className="flex items-center gap-2 text-xs text-cp-ink-3">
                <span aria-live="polite" className="tabular-nums">
                    <span className="font-semibold text-cp-ink">{shown}</span>
                    {shown !== total && <> sur {total}</>} affiché{shown > 1 ? "s" : ""}
                </span>
                <IconButton
                    icon={RefreshCw}
                    label="Actualiser la file (r)"
                    size="sm"
                    onClick={onRefresh}
                    className={cn(isFetching && "[&_svg]:animate-spin")}
                />
            </div>
        </div>
    );
});
