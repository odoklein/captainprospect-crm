"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Briefcase, ChevronDown, ListChecks, Phone, Search, SlidersHorizontal, X } from "lucide-react";
import { Kbd, SegmentedControl } from "@/components/ui";
import { FIELD_BASE, FOCUS_RING } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";
import {
    countAdvancedFilters,
    hasAnyQueueFilter,
    matchesQueueFilters,
    phoneNeedle,
    prepareSearch,
    type LineType,
    type PhoneAvailability,
    type PhoneScope,
    type QueueFilters,
    type QueueRowLike,
    type QueueRowType,
} from "@/lib/sdr-queue/queue-filters";

// Compact filter bar of the SDR action table: context (mission/list) + search
// + type on one line, priority chips + active filters on the second, phone and
// status filters folded into an "advanced" panel.

const PRIORITY_DOT: Record<string, string> = {
    ABSENT_RDV: "bg-danger",
    CALLBACK: "bg-warning",
    FOLLOW_UP: "bg-info",
    NEW: "bg-success",
    RETRY: "bg-ink-4",
};

const AVAILABILITY_LABELS: Record<Exclude<PhoneAvailability, "">, string> = {
    contact: "Tél. contact renseigné",
    company: "Standard société renseigné",
    companyOnly: "Standard uniquement (sans tél. contact)",
    both: "Contact + standard",
    none: "Aucun numéro",
};

const SCOPE_LABELS: Record<PhoneScope, string> = { any: "Numéro", contact: "Tél. contact", company: "Standard" };
const LINE_LABELS: Record<Exclude<LineType, "">, string> = { mobile: "Mobile", landline: "Fixe" };

const SELECT =
    "h-9 w-full cursor-pointer appearance-none rounded-control border border-line bg-surface pl-3 pr-8 text-[13px] text-ink shadow-2xs transition-[border-color,box-shadow] hover:border-line-strong focus:outline-none focus:border-primary-400 focus:ring-4 focus:ring-primary-500/12";

const nf = new Intl.NumberFormat("fr-FR");

interface Option {
    id: string;
    name: string;
}

interface ActionQueueToolbarProps<T extends QueueRowLike> {
    /** Full queue (unfiltered) — used for facet counts. */
    items: T[];
    filteredCount: number;
    filters: QueueFilters;
    onChange: (patch: Partial<QueueFilters>) => void;
    onReset: () => void;
    missions: Option[];
    missionId: string | null;
    onMissionChange: (id: string) => void;
    lists: Option[];
    listId: string | null;
    onListChange: (id: string | null) => void;
    statusLabels: Record<string, string>;
    priorityLabels: Record<string, { label: string }>;
    channelLabels: Record<string, string>;
    /** View toggle, stats, sync… rendered at the end of the first row. */
    trailing?: ReactNode;
}

export function ActionQueueToolbar<T extends QueueRowLike>({
    items,
    filteredCount,
    filters,
    onChange,
    onReset,
    missions,
    missionId,
    onMissionChange,
    lists,
    listId,
    onListChange,
    statusLabels,
    priorityLabels,
    channelLabels,
    trailing,
}: ActionQueueToolbarProps<T>) {
    const searchRef = useRef<HTMLInputElement>(null);
    const advancedCount = countAdvancedFilters(filters);
    const [advancedOpen, setAdvancedOpen] = useState(advancedCount > 0);

    // "/" focuses the search from anywhere on the page.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
            const el = e.target as HTMLElement | null;
            if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
            e.preventDefault();
            searchRef.current?.focus();
            searchRef.current?.select();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    // Facet counts: each control counts what it would show if picked.
    const deferred = useDeferredValue(filters);
    const facets = useMemo(() => {
        const search = prepareSearch(deferred.search);
        const type = { contact: 0, company: 0 };
        const priority: Record<string, number> = {};
        let priorityAll = 0;
        for (const row of items) {
            if (matchesQueueFilters(row, deferred, search, "type")) {
                if (row.contactId) type.contact++;
                else type.company++;
            }
            if (matchesQueueFilters(row, deferred, search, "priority")) {
                priority[row.priority] = (priority[row.priority] ?? 0) + 1;
                priorityAll++;
            }
        }
        return { type, priority, priorityAll };
    }, [items, deferred]);

    const typeOptions: { value: QueueRowType; label: string; count: number }[] = [
        { value: "contact", label: "Contacts", count: facets.type.contact },
        { value: "company", label: "Sociétés", count: facets.type.company },
        { value: "", label: "Tous", count: facets.type.contact + facets.type.company },
    ];

    const priorityChips = Object.entries(priorityLabels)
        .map(([value, { label }]) => ({ value, label, count: facets.priority[value] ?? 0 }))
        .filter((c) => c.count > 0 || c.value === filters.priority);

    const activeChips: { key: string; label: string; clear: Partial<QueueFilters> }[] = [];
    if (filters.result) {
        activeChips.push({
            key: "result",
            label: `Statut : ${filters.result === "NONE" ? "Jamais contacté" : statusLabels[filters.result] ?? filters.result}`,
            clear: { result: "" },
        });
    }
    if (filters.channel) {
        activeChips.push({ key: "channel", label: `Canal : ${channelLabels[filters.channel] ?? filters.channel}`, clear: { channel: "" } });
    }
    if (phoneNeedle(filters.phone)) {
        activeChips.push({ key: "phone", label: `${SCOPE_LABELS[filters.phoneScope]} : ${filters.phone.trim()}`, clear: { phone: "" } });
    }
    if (filters.lineType) {
        const scope = filters.phoneScope === "any" ? "" : ` (${SCOPE_LABELS[filters.phoneScope].toLowerCase()})`;
        activeChips.push({ key: "line", label: `${LINE_LABELS[filters.lineType]}${scope}`, clear: { lineType: "" } });
    }
    if (filters.phoneAvailability) {
        activeChips.push({ key: "avail", label: AVAILABILITY_LABELS[filters.phoneAvailability], clear: { phoneAvailability: "" } });
    }

    const anyFilter = hasAnyQueueFilter(filters);

    return (
        <section className="rounded-2xl border border-line bg-surface shadow-sm">
            {/* Row 1 — context, search, type, advanced toggle, page actions */}
            <div className="flex flex-wrap items-center gap-2 p-2.5">
                <ContextSelect
                    icon={Briefcase}
                    label="Mission"
                    value={missionId ?? ""}
                    onChange={onMissionChange}
                    options={missions.map((m) => ({ value: m.id, label: m.name }))}
                />
                <ContextSelect
                    icon={ListChecks}
                    label="Liste"
                    value={listId ?? "all"}
                    onChange={(v) => onListChange(v === "all" ? null : v)}
                    options={[{ value: "all", label: "Toutes les listes" }, ...lists.map((l) => ({ value: l.id, label: l.name }))]}
                />

                <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
                    <input
                        ref={searchRef}
                        type="search"
                        value={filters.search}
                        onChange={(e) => onChange({ search: e.target.value })}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") {
                                if (filters.search) onChange({ search: "" });
                                else e.currentTarget.blur();
                            }
                        }}
                        placeholder="Nom, société, numéro, email, note…"
                        aria-label="Rechercher dans la file"
                        className={cn(FIELD_BASE, "h-9 pl-9 pr-10 text-[13px] [&::-webkit-search-cancel-button]:hidden")}
                    />
                    {filters.search ? (
                        <button
                            type="button"
                            onClick={() => {
                                onChange({ search: "" });
                                searchRef.current?.focus();
                            }}
                            aria-label="Effacer la recherche"
                            className={cn("absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-ink-4 hover:bg-surface-3 hover:text-ink", FOCUS_RING)}
                        >
                            <X className="size-3.5" />
                        </button>
                    ) : (
                        <Kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">/</Kbd>
                    )}
                </div>

                <SegmentedControl<QueueRowType>
                    ariaLabel="Type de cible"
                    value={filters.type}
                    onChange={(type) => onChange({ type })}
                    options={typeOptions}
                />

                <button
                    type="button"
                    onClick={() => setAdvancedOpen((v) => !v)}
                    aria-expanded={advancedOpen}
                    aria-controls="queue-advanced-filters"
                    className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-[13px] font-medium shadow-2xs transition-colors",
                        FOCUS_RING,
                        advancedOpen || advancedCount > 0
                            ? "border-primary-300 bg-primary-50 text-primary-700"
                            : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
                    )}
                >
                    <SlidersHorizontal className="size-3.5" aria-hidden />
                    Filtres
                    {advancedCount > 0 && (
                        <span className="grid min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-[18px] text-primary-fg tabular-nums">
                            {advancedCount}
                        </span>
                    )}
                    <ChevronDown className={cn("size-3.5 transition-transform", advancedOpen && "rotate-180")} aria-hidden />
                </button>

                {trailing && <div className="ml-auto flex flex-wrap items-center gap-1.5">{trailing}</div>}
            </div>

            {/* Advanced — phone, line type, status, channel */}
            {advancedOpen && (
                <div
                    id="queue-advanced-filters"
                    className="grid gap-3 border-t border-line-subtle bg-surface-2/60 px-3 py-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,0.8fr)]"
                >
                    <FilterField label="Numéro de téléphone" className="sm:col-span-2 xl:col-span-1">
                        <div className="flex items-center gap-1.5">
                            <div className="relative min-w-0 flex-1">
                                <Phone className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" aria-hidden />
                                <input
                                    type="text"
                                    inputMode="tel"
                                    value={filters.phone}
                                    onChange={(e) => onChange({ phone: e.target.value })}
                                    placeholder="06 12 34… ou +33 2…"
                                    aria-label="Numéro de téléphone"
                                    className={cn(FIELD_BASE, "h-9 pl-8 pr-2 font-mono text-[13px] tabular-nums")}
                                />
                            </div>
                            <SegmentedControl<PhoneScope>
                                ariaLabel="Numéro à comparer"
                                size="sm"
                                value={filters.phoneScope}
                                onChange={(phoneScope) => onChange({ phoneScope })}
                                options={[
                                    { value: "any", label: "Tous" },
                                    { value: "contact", label: "Contact" },
                                    { value: "company", label: "Société" },
                                ]}
                            />
                        </div>
                    </FilterField>

                    <FilterField label="Type de ligne" hint="Mobile = 06 / 07 (+33 6 / +33 7), le reste en fixe. Avec « Tous », on juge le numéro affiché.">

                        <SegmentedControl<LineType>
                            ariaLabel="Type de ligne"
                            fullWidth
                            value={filters.lineType}
                            onChange={(lineType) => onChange({ lineType })}
                            options={[
                                { value: "", label: "Toutes" },
                                { value: "mobile", label: "Mobile" },
                                { value: "landline", label: "Fixe" },
                            ]}
                        />
                    </FilterField>

                    <FilterField label="Numéro renseigné">
                        <NativeSelect
                            value={filters.phoneAvailability}
                            onChange={(v) => onChange({ phoneAvailability: v as PhoneAvailability })}
                            options={[{ value: "", label: "Peu importe" }, ...Object.entries(AVAILABILITY_LABELS).map(([value, label]) => ({ value, label }))]}
                        />
                    </FilterField>

                    <FilterField label="Dernier statut">
                        <NativeSelect
                            value={filters.result}
                            onChange={(result) => onChange({ result })}
                            options={[
                                { value: "", label: "Tous" },
                                { value: "NONE", label: "Jamais contacté" },
                                ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
                            ]}
                        />
                    </FilterField>

                    <FilterField label="Canal">
                        <NativeSelect
                            value={filters.channel}
                            onChange={(channel) => onChange({ channel })}
                            options={[{ value: "", label: "Tous" }, ...Object.entries(channelLabels).map(([value, label]) => ({ value, label }))]}
                        />
                    </FilterField>
                </div>
            )}

            {/* Row 2 — priority chips, active filters, result count */}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line-subtle px-3 py-2">
                <Chip active={!filters.priority} onClick={() => onChange({ priority: "" })} count={facets.priorityAll}>
                    Toutes
                </Chip>
                {priorityChips.map((c) => (
                    <Chip
                        key={c.value}
                        active={filters.priority === c.value}
                        onClick={() => onChange({ priority: filters.priority === c.value ? "" : c.value })}
                        count={c.count}
                        dot={PRIORITY_DOT[c.value] ?? "bg-ink-4"}
                    >
                        {c.label}
                    </Chip>
                ))}

                {activeChips.length > 0 && <span className="mx-1 h-4 w-px bg-line" aria-hidden />}
                {activeChips.map((c) => (
                    <span
                        key={c.key}
                        className="inline-flex h-7 items-center gap-1 rounded-full border border-accent-200 bg-accent-50 pl-2.5 pr-1 text-xs font-medium text-accent-700"
                    >
                        {c.label}
                        <button
                            type="button"
                            onClick={() => onChange(c.clear)}
                            aria-label={`Retirer le filtre ${c.label}`}
                            className={cn("grid size-5 place-items-center rounded-full hover:bg-accent-100", FOCUS_RING)}
                        >
                            <X className="size-3" />
                        </button>
                    </span>
                ))}

                <div className="ml-auto flex items-center gap-3 pl-2">
                    <span className="text-xs text-ink-3 tabular-nums" aria-live="polite">
                        <span className={cn("font-semibold", anyFilter ? "text-accent-600" : "text-ink")}>{nf.format(filteredCount)}</span>
                        {anyFilter || filters.type ? <> sur {nf.format(items.length)}</> : null} dans la file
                    </span>
                    {anyFilter && (
                        <button
                            type="button"
                            onClick={onReset}
                            className={cn("rounded-md text-xs font-medium text-ink-3 underline-offset-2 hover:text-danger hover:underline", FOCUS_RING)}
                        >
                            Réinitialiser
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
}

function ContextSelect({
    icon: Icon,
    label,
    value,
    onChange,
    options,
}: {
    icon: LucideIcon;
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
}) {
    return (
        <label className="relative inline-flex min-w-0 max-w-[240px] shrink">
            <span className="sr-only">{label}</span>
            <Icon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                title={label}
                className={cn(SELECT, "truncate pl-8 font-semibold")}
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" aria-hidden />
        </label>
    );
}

function NativeSelect({
    value,
    onChange,
    options,
}: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
}) {
    return (
        <div className="relative">
            <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(SELECT, value && "border-primary-300 bg-primary-50/50 font-medium")}>
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" aria-hidden />
        </div>
    );
}

function FilterField({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
    return (
        <div className={cn("min-w-0 space-y-1", className)} title={hint}>
            <span className="block text-[11px] font-medium uppercase tracking-wide text-ink-4">{label}</span>
            {children}
        </div>
    );
}

function Chip({
    active,
    onClick,
    count,
    dot,
    children,
}: {
    active: boolean;
    onClick: () => void;
    count: number;
    dot?: string;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                FOCUS_RING,
                active
                    ? "border-primary bg-primary text-primary-fg shadow-sm"
                    : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
            )}
        >
            {dot && <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />}
            {children}
            <span className={cn("tabular-nums", active ? "text-primary-fg/70" : "text-ink-4")}>{nf.format(count)}</span>
        </button>
    );
}
