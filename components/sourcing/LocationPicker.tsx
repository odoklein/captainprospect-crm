"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Building2, ChevronDown, Flag, Globe2, Landmark, Loader2, Map as MapIcon, MapPin, Plus, Scissors, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Checkbox, SegmentedControl } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";
import {
    COUNTRIES,
    DEPARTEMENTS,
    METRO_DEPARTEMENTS,
    REGIONS,
    countryChip,
    deptChip,
    parseLocation,
    regionChip,
    villeChip,
    type ParsedLocation,
} from "@/lib/sourcing/france";

// ============================================
// WHERE: one chip field that takes a pays, a région, a département or a ville.
// - Typing suggests all four levels at once (villes from geo.api.gouv.fr).
// - "Parcourir" opens a checklist of régions → départements and countries,
//   so "toute la France" or "toute la Bretagne par département" is two clicks.
// - Google Maps caps each search, so large areas get a one-click
//   "découper en départements" nudge when Maps is among the sources.
// ============================================

type Kind = ParsedLocation["kind"];

const KIND: Record<Kind, { icon: LucideIcon; label: string }> = {
    pays: { icon: Globe2, label: "Pays" },
    region: { icon: MapIcon, label: "Région" },
    departement: { icon: Landmark, label: "Département" },
    ville: { icon: Building2, label: "Ville" },
    libre: { icon: MapPin, label: "Lieu" },
};

const COLLAPSE_AT = 8;

const norm = (s: string) =>
    s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[-']/g, " ")
        .trim();

interface Suggestion {
    chip: string;
    kind: Kind;
    label: string;
    meta?: string;
}

interface Commune {
    nom: string;
    codeDepartement: string;
    population?: number;
    codesPostaux?: string[];
}

function useCommunes(text: string) {
    const [communes, setCommunes] = useState<Commune[]>([]);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        const q = text.trim();
        const byPostcode = /^\d{5}$/.test(q);
        if (q.length < 2 || (/^\d+$/.test(q) && !byPostcode)) {
            setCommunes([]);
            return;
        }
        const ctrl = new AbortController();
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const qs = new URLSearchParams({ fields: "nom,codeDepartement,population,codesPostaux", limit: "6" });
                if (byPostcode) qs.set("codePostal", q);
                else {
                    qs.set("nom", q);
                    qs.set("boost", "population");
                }
                const res = await fetch(`https://geo.api.gouv.fr/communes?${qs}`, { signal: ctrl.signal });
                setCommunes(res.ok ? ((await res.json()) as Commune[]) : []);
            } catch {
                // Aborted or offline: the static levels still suggest.
            } finally {
                if (!ctrl.signal.aborted) setLoading(false);
            }
        }, 180);
        return () => {
            ctrl.abort();
            clearTimeout(t);
        };
    }, [text]);
    return { communes, loading };
}

export function LocationPicker({
    value,
    onChange,
    mapsSelected,
}: {
    value: string[];
    onChange: (v: string[]) => void;
    /** Google Maps is a selected source: nudge towards smaller areas. */
    mapsSelected: boolean;
}) {
    const [text, setText] = useState("");
    const [open, setOpen] = useState(false);
    const [cursor, setCursor] = useState(0);
    const [browse, setBrowse] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const listId = useId();
    const { communes, loading } = useCommunes(text);

    const has = useMemo(() => new Set(value.map((v) => v.toLowerCase())), [value]);
    const parsed = useMemo(() => value.map((v) => ({ chip: v, loc: parseLocation(v) })), [value]);

    const set = (next: string[]) => onChange(Array.from(new Map(next.map((v) => [v.toLowerCase(), v])).values()));
    const add = (chips: string[]) => set([...value, ...chips]);
    const remove = (chips: string[]) => {
        const drop = new Set(chips.map((c) => c.toLowerCase()));
        onChange(value.filter((v) => !drop.has(v.toLowerCase())));
    };
    const toggle = (chip: string) => (has.has(chip.toLowerCase()) ? remove([chip]) : add([chip]));

    // ---- Typeahead ----
    const suggestions = useMemo<Suggestion[]>(() => {
        const q = norm(text);
        if (!q) return [];
        const code = text.trim().toUpperCase();
        const out: Suggestion[] = [];
        for (const c of COUNTRIES.filter((c) => norm(c.name).startsWith(q)).slice(0, 2))
            out.push({ chip: countryChip(c), kind: "pays", label: c.name, meta: c.iso });
        for (const r of REGIONS.filter((r) => norm(r.name).includes(q)).slice(0, 2))
            out.push({ chip: regionChip(r), kind: "region", label: r.name, meta: `${r.departements.length} dép.` });
        for (const d of DEPARTEMENTS.filter((d) => d.code.startsWith(code) || norm(d.name).includes(q)).slice(0, 4))
            out.push({ chip: deptChip(d), kind: "departement", label: d.name, meta: d.code });
        for (const c of communes)
            out.push({
                chip: villeChip(c.nom, c.codeDepartement),
                kind: "ville",
                label: c.nom,
                meta: c.codesPostaux?.length === 1 ? c.codesPostaux[0] : c.codeDepartement,
            });
        return out.filter((s) => !has.has(s.chip.toLowerCase()));
    }, [text, communes, has]);

    const commitFree = () => {
        const raw = text.trim().replace(/[,;]$/, "");
        if (raw) add([raw]);
        setText("");
        setCursor(0);
    };
    const pick = (s: Suggestion) => {
        add([s.chip]);
        setText("");
        setCursor(0);
        inputRef.current?.focus();
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        // Row 0 is "use what I typed"; suggestions start at 1.
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setCursor((c) => Math.min(c + 1, suggestions.length));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
        } else if (e.key === "Enter" || e.key === ";") {
            if (!text.trim()) return;
            e.preventDefault();
            if (cursor > 0 && suggestions[cursor - 1]) pick(suggestions[cursor - 1]);
            else commitFree();
        } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1));
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    };

    // ---- Large-area nudge (Maps) ----
    const splittable = parsed.filter(
        ({ loc }) => loc.kind === "region" || (loc.kind === "pays" && loc.iso === "FR"),
    );
    const splitIntoDepartements = () => {
        const chips = splittable.flatMap(({ loc }) =>
            loc.kind === "region" ? loc.region.departements.map(deptChip) : METRO_DEPARTEMENTS.map(deptChip),
        );
        const drop = new Set(splittable.map((s) => s.chip.toLowerCase()));
        set([...value.filter((v) => !drop.has(v.toLowerCase())), ...chips]);
    };

    const chips = showAll || parsed.length <= COLLAPSE_AT + 2 ? parsed : parsed.slice(0, COLLAPSE_AT);
    const hidden = parsed.length - chips.length;
    const deptCount = parsed.filter((p) => p.loc.kind === "departement").length;

    return (
        <div className="space-y-2">
            <div className="relative">
                <div
                    onClick={() => inputRef.current?.focus()}
                    className="flex min-h-11 cursor-text flex-wrap items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1.5 shadow-2xs transition-[border-color,box-shadow] hover:border-line-strong focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-500/12"
                >
                    <MapPin className="size-4 shrink-0 text-ink-4" aria-hidden />
                    {chips.map(({ chip, loc }) => (
                        <LocationChip key={chip} loc={loc} onRemove={() => remove([chip])} />
                    ))}
                    {hidden > 0 && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowAll(true);
                            }}
                            className={cn(
                                "inline-flex h-7 items-center rounded-lg border border-line bg-surface-2 px-2 text-xs font-semibold text-ink-2 hover:border-line-strong hover:text-ink",
                                FOCUS_RING,
                            )}
                        >
                            +{hidden}
                        </button>
                    )}
                    <input
                        ref={inputRef}
                        value={text}
                        onChange={(e) => {
                            setText(e.target.value);
                            setOpen(true);
                            setCursor(0);
                        }}
                        onKeyDown={onKeyDown}
                        onFocus={() => setOpen(true)}
                        onBlur={() => setTimeout(() => setOpen(false), 120)}
                        placeholder={value.length ? "" : "Ville, département, région, pays…"}
                        role="combobox"
                        aria-controls={listId}
                        aria-expanded={open && !!text.trim()}
                        aria-autocomplete="list"
                        className="h-7 min-w-[6rem] flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-4"
                    />
                    {loading && <Loader2 className="size-3.5 shrink-0 animate-spin text-ink-4" aria-hidden />}
                </div>

                {open && text.trim() && (
                    <ul
                        id={listId}
                        role="listbox"
                        className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-auto rounded-panel border border-line bg-surface p-1 shadow-overlay animate-ds-pop"
                    >
                        <SuggestionRow active={cursor === 0} onPick={commitFree}>
                            <Plus className="size-3.5 text-ink-4" />
                            <span className="text-ink">
                                Ajouter « <span className="font-semibold">{text.trim()}</span> »
                            </span>
                            <span className="ml-auto text-2xs text-ink-4">texte libre</span>
                        </SuggestionRow>
                        {suggestions.map((s, i) => {
                            const Icon = KIND[s.kind].icon;
                            const firstOfKind = i === 0 || suggestions[i - 1].kind !== s.kind;
                            return (
                                <Fragment key={s.chip}>
                                    {firstOfKind && (
                                        <li
                                            role="presentation"
                                            className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-4"
                                        >
                                            {KIND[s.kind].label}s
                                        </li>
                                    )}
                                    <SuggestionRow active={cursor === i + 1} onPick={() => pick(s)}>
                                        <Icon className="size-3.5 text-ink-4" />
                                        <span className="font-medium text-ink">{s.label}</span>
                                        {s.meta && <span className="ml-auto shrink-0 font-mono text-2xs text-ink-3">{s.meta}</span>}
                                    </SuggestionRow>
                                </Fragment>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                    type="button"
                    aria-expanded={browse}
                    onClick={() => setBrowse((b) => !b)}
                    className={cn(
                        "inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-primary-700 hover:text-primary-800",
                        FOCUS_RING,
                    )}
                >
                    <Flag className="size-3.5" />
                    Parcourir pays, régions, départements
                    <ChevronDown className={cn("size-3.5 transition-transform", browse && "rotate-180")} />
                </button>
                {value.length > 0 && (
                    <span className="ml-auto flex items-center gap-2 text-2xs text-ink-4 tabular-nums">
                        {value.length} zone{value.length > 1 ? "s" : ""}
                        {deptCount > 0 && deptCount !== value.length && ` · ${deptCount} dép.`}
                        {showAll && parsed.length > COLLAPSE_AT + 2 && (
                            <button type="button" onClick={() => setShowAll(false)} className="font-medium text-ink-3 hover:text-ink">
                                Replier
                            </button>
                        )}
                        <button type="button" onClick={() => onChange([])} className="font-medium text-ink-3 hover:text-danger-ink">
                            Tout effacer
                        </button>
                    </span>
                )}
            </div>

            {browse && <BrowsePanel has={has} toggle={toggle} add={add} remove={remove} onClose={() => setBrowse(false)} />}

            {mapsSelected && splittable.length > 0 && (
                <div className="flex items-start gap-2.5 rounded-panel border border-warning-line bg-warning-soft px-3 py-2.5 text-xs text-warning-ink">
                    <Scissors className="mt-0.5 size-3.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                        Google Maps renvoie au plus quelques centaines de lieux par recherche. Sur{" "}
                        {splittable.map((s) => s.loc.name).join(", ")}, découpez en départements pour en couvrir beaucoup plus.
                        <button
                            type="button"
                            onClick={splitIntoDepartements}
                            className={cn("mt-1.5 block font-semibold underline underline-offset-2 hover:no-underline", FOCUS_RING)}
                        >
                            Découper en départements
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function LocationChip({ loc, onRemove }: { loc: ParsedLocation; onRemove: () => void }) {
    const Icon = KIND[loc.kind].icon;
    const meta =
        loc.kind === "departement" ? loc.code
        : loc.kind === "ville" ? loc.deptCode
        : loc.kind === "pays" ? loc.iso
        : loc.kind === "region" ? "région"
        : undefined;
    return (
        <span
            title={KIND[loc.kind].label}
            className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 pl-2 pr-1 text-xs font-medium text-primary-800"
        >
            <Icon className="size-3 shrink-0 text-primary-500" aria-hidden />
            <span className="truncate">{loc.name}</span>
            {meta && <span className="font-mono text-2xs text-primary-500">{meta}</span>}
            <button
                type="button"
                aria-label={`Retirer ${loc.name}`}
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                className={cn("inline-flex size-5 items-center justify-center rounded-md text-primary-500 hover:bg-primary-100 hover:text-primary-800", FOCUS_RING)}
            >
                <X className="size-3" />
            </button>
        </span>
    );
}

function SuggestionRow({ active, onPick, children }: { active: boolean; onPick: () => void; children: React.ReactNode }) {
    return (
        <li
            role="option"
            aria-selected={active}
            onMouseDown={(e) => {
                e.preventDefault();
                onPick();
            }}
            className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm", active ? "bg-primary-50" : "hover:bg-surface-2")}
        >
            {children}
        </li>
    );
}

// ============================================
// Browse panel
// ============================================

type Tab = "departements" | "regions" | "pays";

function BrowsePanel({
    has,
    toggle,
    add,
    remove,
    onClose,
}: {
    has: Set<string>;
    toggle: (chip: string) => void;
    add: (chips: string[]) => void;
    remove: (chips: string[]) => void;
    onClose: () => void;
}) {
    const [tab, setTab] = useState<Tab>("departements");
    const [filter, setFilter] = useState("");
    const isOn = (chip: string) => has.has(chip.toLowerCase());

    const allMetro = METRO_DEPARTEMENTS.map(deptChip);
    const allDom = DEPARTEMENTS.filter((d) => d.code.length === 3).map(deptChip);
    const metroOn = allMetro.filter(isOn).length;
    const domOn = allDom.filter(isOn).length;

    const q = norm(filter);
    const regions = REGIONS.map((r) => ({
        ...r,
        departements: q ? r.departements.filter((d) => d.code.toLowerCase().startsWith(q) || norm(d.name).includes(q)) : r.departements,
    })).filter((r) => !q || r.departements.length > 0 || norm(r.name).includes(q));

    return (
        <div className="overflow-hidden rounded-panel border border-line bg-surface-2 animate-ds-pop">
            <div className="flex items-center gap-2 border-b border-line bg-surface px-2.5 py-2">
                <SegmentedControl<Tab>
                    size="sm"
                    fullWidth
                    ariaLabel="Niveau"
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: "departements", label: "Départements", count: metroOn + domOn || undefined },
                        { value: "regions", label: "Régions" },
                        { value: "pays", label: "Pays" },
                    ]}
                />
                <button
                    type="button"
                    aria-label="Fermer"
                    onClick={onClose}
                    className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-4 hover:bg-surface-3 hover:text-ink", FOCUS_RING)}
                >
                    <X className="size-4" />
                </button>
            </div>

            {tab === "departements" && (
                <div>
                    <div className="space-y-2 border-b border-line p-2.5">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
                            <input
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                placeholder="Nom ou numéro (33, Gironde…)"
                                className="h-8 w-full rounded-control border border-line bg-surface pl-8 pr-2 text-[13px] text-ink outline-none placeholder:text-ink-4 focus:border-primary-400 focus:ring-4 focus:ring-primary-500/12"
                            />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            <QuickToggle
                                on={metroOn === allMetro.length}
                                partial={metroOn > 0 && metroOn < allMetro.length}
                                onClick={() => (metroOn === allMetro.length ? remove(allMetro) : add(allMetro))}
                                label="France métropolitaine"
                                count={allMetro.length}
                            />
                            <QuickToggle
                                on={domOn === allDom.length}
                                partial={domOn > 0 && domOn < allDom.length}
                                onClick={() => (domOn === allDom.length ? remove(allDom) : add(allDom))}
                                label="Outre-mer"
                                count={allDom.length}
                            />
                        </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto overscroll-contain px-2.5 py-1">
                        {regions.map((r) => {
                            const regionChips = r.departements.map(deptChip);
                            const on = regionChips.filter(isOn).length;
                            return (
                                <div key={r.name} className="border-b border-line-subtle py-2 last:border-0">
                                    <Checkbox
                                        checked={on > 0 && on === regionChips.length}
                                        indeterminate={on > 0 && on < regionChips.length}
                                        onChange={() => (on === regionChips.length ? remove(regionChips) : add(regionChips))}
                                        label={
                                            <span className="flex items-baseline gap-1.5">
                                                <span className="text-xs font-semibold text-ink">{r.name}</span>
                                                <span className="text-2xs text-ink-4 tabular-nums">
                                                    {on}/{regionChips.length}
                                                </span>
                                            </span>
                                        }
                                    />
                                    <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 pl-6">
                                        {r.departements.map((d) => (
                                            <Checkbox
                                                key={d.code}
                                                checked={isOn(deptChip(d))}
                                                onChange={() => toggle(deptChip(d))}
                                                label={
                                                    <span className="flex min-w-0 items-baseline gap-1.5 text-xs text-ink-2">
                                                        <span className="w-6 shrink-0 font-mono text-2xs text-ink-4">{d.code}</span>
                                                        <span className="truncate">{d.name}</span>
                                                    </span>
                                                }
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                        {regions.length === 0 && <p className="py-6 text-center text-xs text-ink-4">Aucun département ne correspond.</p>}
                    </div>
                </div>
            )}

            {tab === "regions" && (
                <div>
                    <p className="border-b border-line px-3 py-2 text-2xs leading-relaxed text-ink-3">
                        <span className="font-semibold text-ink-2">Région</span> : 1 recherche par activité, rapide.{" "}
                        <span className="font-semibold text-ink-2">Par département</span> : 1 recherche par département, bien plus de
                        résultats sur Google Maps.
                    </p>
                    <ul className="max-h-80 divide-y divide-line-subtle overflow-y-auto overscroll-contain">
                        {REGIONS.map((r) => {
                            const regionOn = isOn(regionChip(r));
                            const deptChips = r.departements.map(deptChip);
                            const deptsOn = deptChips.every(isOn);
                            return (
                                <li key={r.name} className="flex items-center gap-2 px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-xs font-semibold text-ink">{r.name}</div>
                                        <div className="truncate text-2xs text-ink-4">
                                            {r.departements.map((d) => d.code).join(" · ")}
                                        </div>
                                    </div>
                                    {r.name !== "Outre-mer" && (
                                        <PillToggle on={regionOn} onClick={() => toggle(regionChip(r))}>
                                            Région
                                        </PillToggle>
                                    )}
                                    <PillToggle on={deptsOn} onClick={() => (deptsOn ? remove(deptChips) : add(deptChips))}>
                                        {r.departements.length} dép.
                                    </PillToggle>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {tab === "pays" && (
                <div className="p-2.5">
                    <div className="grid grid-cols-2 gap-1.5">
                        {COUNTRIES.map((c) => {
                            const on = isOn(countryChip(c));
                            return (
                                <button
                                    key={c.iso}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => toggle(countryChip(c))}
                                    className={cn(
                                        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                                        FOCUS_RING,
                                        on
                                            ? "border-primary-300 bg-primary-50 font-semibold text-primary-800"
                                            : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
                                    )}
                                >
                                    <span className="w-5 shrink-0 font-mono text-2xs text-ink-4">{c.iso}</span>
                                    <span className="truncate">{c.name}</span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-2.5 text-2xs leading-relaxed text-ink-4">
                        Le registre officiel ne couvre que la France. Pour un pays entier sur Google Maps, ajoutez plutôt ses
                        grandes villes une par une.
                    </p>
                </div>
            )}
        </div>
    );
}

function QuickToggle({ on, partial, onClick, label, count }: { on: boolean; partial: boolean; onClick: () => void; label: string; count: number }) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                FOCUS_RING,
                on
                    ? "border-primary-300 bg-primary-50 text-primary-700"
                    : partial
                      ? "border-primary-200 bg-surface text-primary-700"
                      : "border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink",
            )}
        >
            {on ? <X className="size-3" /> : <Plus className="size-3" />}
            {label}
            <span className="tabular-nums text-ink-4">{count}</span>
        </button>
    );
}

function PillToggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            className={cn(
                "inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-2xs font-semibold transition-colors",
                FOCUS_RING,
                on
                    ? "border-primary bg-primary text-primary-fg"
                    : "border-line bg-surface text-ink-3 hover:border-primary-300 hover:text-primary-700",
            )}
        >
            {children}
        </button>
    );
}
