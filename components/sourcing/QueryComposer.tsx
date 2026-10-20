"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Briefcase, Check, Loader2, MapPin, Play, Plus, X } from "lucide-react";
import { Button, SegmentedControl, Switch } from "@/components/ui";
import { FOCUS_RING, EYEBROW } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";
import { ACTIVITIES, HEADCOUNT_BANDS, SOURCES, parseNaf } from "@/lib/sourcing/catalog";
import { LocationPicker } from "./LocationPicker";
import type { ActivityTerm, ProvidersStatus, SourceId, SourcingQuery } from "@/lib/sourcing/types";

// ============================================
// Query composer: WHAT (activities) × WHERE (locations) × WHICH SOURCES.
// One query fans out to every selected source; the footer says how many
// searches that is before anything is spent.
// ============================================

interface Props {
    query: SourcingQuery;
    sources: SourceId[];
    providers: ProvidersStatus | null;
    isRunning: boolean;
    onQueryChange: (patch: Partial<SourcingQuery>) => void;
    onSourcesChange: (sources: SourceId[]) => void;
    onRun: () => void;
}

export function QueryComposer({ query, sources, providers, isRunning, onQueryChange, onSourcesChange, onRun }: Props) {
    const searches = query.activities.length * query.locations.length;
    const usable = sources.filter((s) => providers?.[s]?.configured !== false);
    const canRun = searches > 0 && usable.length > 0 && !isRunning;
    // Serper bills one credit per page of 20 places.
    const serperCalls =
        usable.includes("gmaps") && providers?.gmaps?.engine === "serper" ? searches * Math.ceil(query.perSearch / 20) : 0;
    const heavy = searches > 150;

    const toggleSource = (id: SourceId) =>
        onSourcesChange(sources.includes(id) ? sources.filter((s) => s !== id) : [...sources, id]);

    return (
        <div className="flex flex-col rounded-card border border-line bg-surface shadow-card">
            <div className="space-y-6 p-5">
                <Block step={1} title="Quoi" hint="Métier ou secteur. Un code NAF (43.22A) marche aussi.">
                    <ActivityInput
                        value={query.activities}
                        onChange={(activities) => onQueryChange({ activities })}
                    />
                </Block>

                <Block step={2} title="Où" hint="Pays, région, département, ville ou code postal. Chaque zone = une recherche.">
                    <LocationPicker
                        value={query.locations}
                        onChange={(locations) => onQueryChange({ locations })}
                        mapsSelected={usable.includes("gmaps")}
                    />
                </Block>

                <Block step={3} title="Sources" hint="Cochez-en plusieurs : les résultats sont fusionnés.">
                    <div className="space-y-2">
                        {SOURCES.map((s) => {
                            const status = providers?.[s.id];
                            const disabled = status?.configured === false;
                            const checked = sources.includes(s.id) && !disabled;
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    role="checkbox"
                                    aria-checked={checked}
                                    disabled={disabled}
                                    onClick={() => toggleSource(s.id)}
                                    className={cn(
                                        "group flex w-full items-start gap-3 rounded-panel border p-3 text-left transition-[border-color,background-color,box-shadow] duration-150",
                                        FOCUS_RING,
                                        checked
                                            ? "border-primary-300 bg-primary-50/60 shadow-2xs"
                                            : "border-line bg-surface hover:border-line-strong",
                                        disabled && "cursor-not-allowed opacity-60 hover:border-line",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-[6px] border transition-colors",
                                            checked ? "border-primary bg-primary text-primary-fg" : "border-line-strong bg-surface",
                                        )}
                                    >
                                        {checked && <Check className="size-3" strokeWidth={3} />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-baseline justify-between gap-2">
                                            <span className="text-sm font-semibold text-ink">{s.label}</span>
                                            <span className="shrink-0 text-2xs font-medium text-ink-3">{status?.cost ?? s.cost}</span>
                                        </span>
                                        <span className="mt-0.5 block text-xs text-ink-3">
                                            {disabled ? status?.reason : s.tagline}
                                        </span>
                                        {!disabled && (
                                            <span className="mt-2 flex flex-wrap gap-1">
                                                {s.yields.map((y) => (
                                                    <span
                                                        key={y}
                                                        className="rounded-md bg-surface-3 px-1.5 py-0.5 text-2xs font-medium text-ink-2"
                                                    >
                                                        {y}
                                                    </span>
                                                ))}
                                                <span className="px-1 py-0.5 text-2xs text-ink-4">· {status?.speed ?? s.speed}</span>
                                                {s.franceOnly && <span className="py-0.5 text-2xs text-ink-4">· France</span>}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </Block>

                <Block step={4} title="Volume & filtres">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-ink-2">Résultats par recherche</span>
                            <SegmentedControl
                                size="sm"
                                ariaLabel="Résultats par recherche"
                                value={String(query.perSearch)}
                                onChange={(v) => onQueryChange({ perSearch: Number(v) })}
                                options={["25", "50", "100", "200"].map((v) => ({ value: v, label: v }))}
                            />
                        </div>
                        <Switch
                            size="sm"
                            checked={query.activeOnly}
                            onChange={(activeOnly) => onQueryChange({ activeOnly })}
                            label="Exclure les établissements fermés"
                        />
                        {sources.includes("annuaire") && (
                            <div>
                                <div className="mb-1.5 flex items-baseline justify-between">
                                    <span className="text-sm text-ink-2">Effectif salarié</span>
                                    <span className="text-2xs text-ink-4">Registre uniquement</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {HEADCOUNT_BANDS.map((b) => {
                                        const on = query.headcount?.includes(b.code) ?? false;
                                        return (
                                            <button
                                                key={b.code}
                                                type="button"
                                                aria-pressed={on}
                                                onClick={() => {
                                                    const cur = query.headcount ?? [];
                                                    onQueryChange({ headcount: on ? cur.filter((c) => c !== b.code) : [...cur, b.code] });
                                                }}
                                                className={cn(
                                                    "h-7 rounded-full border px-2.5 text-xs font-medium tabular-nums transition-colors",
                                                    FOCUS_RING,
                                                    on
                                                        ? "border-primary-300 bg-primary-50 text-primary-700"
                                                        : "border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink",
                                                )}
                                            >
                                                {b.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </Block>
            </div>

            <div className="mt-auto border-t border-line bg-surface-2 p-4 rounded-b-card">
                <p className="mb-3 text-xs text-ink-3">
                    {searches === 0 ? (
                        "Ajoutez au moins une activité et une localisation."
                    ) : (
                        <>
                            <span className="font-semibold text-ink tabular-nums">{searches}</span> recherche
                            {searches > 1 ? "s" : ""} × <span className="font-semibold text-ink tabular-nums">{usable.length}</span>{" "}
                            source{usable.length > 1 ? "s" : ""} · jusqu&apos;à{" "}
                            <span className="font-semibold text-ink tabular-nums">
                                {(searches * query.perSearch).toLocaleString("fr-FR")}
                            </span>{" "}
                            sociétés par source
                            {serperCalls > 0 && (
                                <span className="mt-1 block text-ink-4">
                                    Google Maps : jusqu&apos;à{" "}
                                    <span className="font-medium text-ink-3 tabular-nums">{serperCalls.toLocaleString("fr-FR")}</span>{" "}
                                    crédit{serperCalls > 1 ? "s" : ""} Serper
                                </span>
                            )}
                            {heavy && (
                                <span className="mt-1 block font-medium text-warning-ink">
                                    Recherche lourde : comptez plusieurs minutes. Réduisez les activités ou les zones si possible.
                                </span>
                            )}
                        </>
                    )}
                </p>
                <Button size="lg" className="w-full" disabled={!canRun} onClick={onRun}>
                    {isRunning ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    {isRunning ? "Recherche en cours…" : "Lancer le sourcing"}
                </Button>
            </div>
        </div>
    );
}

function Block({ step, title, hint, children }: { step: number; title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section>
            <div className="mb-2 flex items-baseline gap-2">
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-2xs font-bold text-primary-fg tabular-nums">
                    {step}
                </span>
                <h3 className={cn(EYEBROW, "text-ink-2")}>{title}</h3>
            </div>
            {children}
            {hint && <p className="mt-1.5 text-xs text-ink-4">{hint}</p>}
        </section>
    );
}

// ============================================
// Chip inputs
// ============================================

function ChipField({
    icon: Icon,
    chips,
    placeholder,
    inputValue,
    onInputChange,
    onKeyDown,
    onRemove,
    onFocus,
    onBlur,
    inputRef,
    listId,
    expanded,
}: {
    icon: typeof MapPin;
    chips: { key: string; label: string; meta?: string }[];
    placeholder: string;
    inputValue: string;
    onInputChange: (v: string) => void;
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
    onRemove: (key: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    inputRef: React.RefObject<HTMLInputElement | null>;
    listId?: string;
    expanded?: boolean;
}) {
    return (
        <div
            onClick={() => inputRef.current?.focus()}
            className="flex min-h-11 cursor-text flex-wrap items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1.5 shadow-2xs transition-[border-color,box-shadow] hover:border-line-strong focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-500/12"
        >
            <Icon className="size-4 shrink-0 text-ink-4" aria-hidden />
            {chips.map((c) => (
                <span
                    key={c.key}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 pl-2 pr-1 text-xs font-medium text-primary-800"
                >
                    {c.label}
                    {c.meta && <span className="font-mono text-2xs text-primary-500">{c.meta}</span>}
                    <button
                        type="button"
                        aria-label={`Retirer ${c.label}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove(c.key);
                        }}
                        className={cn("inline-flex size-5 items-center justify-center rounded-md text-primary-500 hover:bg-primary-100 hover:text-primary-800", FOCUS_RING)}
                    >
                        <X className="size-3" />
                    </button>
                </span>
            ))}
            <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={onFocus}
                onBlur={onBlur}
                placeholder={chips.length ? "" : placeholder}
                role={listId ? "combobox" : undefined}
                aria-controls={listId}
                aria-expanded={listId ? !!expanded : undefined}
                className="h-7 min-w-[5rem] flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-4"
            />
        </div>
    );
}

function ActivityInput({ value, onChange }: { value: ActivityTerm[]; onChange: (v: ActivityTerm[]) => void }) {
    const [text, setText] = useState("");
    const [open, setOpen] = useState(false);
    const [cursor, setCursor] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listId = useId();

    const suggestions = useMemo(() => {
        const q = text
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "");
        const taken = new Set(value.map((v) => v.label.toLowerCase()));
        const pool = ACTIVITIES.filter((a) => !taken.has(a.label.toLowerCase()));
        if (!q) return pool.slice(0, 8);
        return pool
            .filter((a) =>
                `${a.label} ${a.nafLabel} ${a.naf}`
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[̀-ͯ]/g, "")
                    .includes(q),
            )
            .slice(0, 8);
    }, [text, value]);

    const add = (term: ActivityTerm) => {
        if (!value.some((v) => v.label.toLowerCase() === term.label.toLowerCase())) onChange([...value, term]);
        setText("");
        setCursor(0);
    };

    const addFreeText = () => {
        const raw = text.trim().replace(/,$/, "");
        if (!raw) return;
        const naf = parseNaf(raw);
        const known = ACTIVITIES.find((a) => a.naf === naf || a.label.toLowerCase() === raw.toLowerCase());
        add(known ? { label: known.label, naf: known.naf } : naf ? { label: naf, naf } : { label: raw });
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setCursor((c) => Math.min(c + 1, suggestions.length));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
        } else if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            // Row 0 is "use what I typed"; suggestions start at 1.
            if (open && cursor > 0 && suggestions[cursor - 1]) {
                const s = suggestions[cursor - 1];
                add({ label: s.label, naf: s.naf });
            } else addFreeText();
        } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1));
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    };

    return (
        <div className="relative">
            <ChipField
                icon={Briefcase}
                chips={value.map((v) => ({ key: v.label, label: v.label, meta: v.naf }))}
                placeholder="Plombier, expert-comptable, EHPAD…"
                inputValue={text}
                onInputChange={(v) => {
                    setText(v);
                    setOpen(true);
                    setCursor(0);
                }}
                onKeyDown={onKeyDown}
                onRemove={(k) => onChange(value.filter((v) => v.label !== k))}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 120)}
                inputRef={inputRef}
                listId={listId}
                expanded={open}
            />
            {open && (suggestions.length > 0 || text.trim()) && (
                <ul
                    id={listId}
                    role="listbox"
                    className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-auto rounded-panel border border-line bg-surface p-1 shadow-overlay animate-ds-pop"
                >
                    {text.trim() && (
                        <Option active={cursor === 0} onPick={addFreeText}>
                            <Plus className="size-3.5 text-ink-4" />
                            <span className="text-ink">
                                Rechercher « <span className="font-semibold">{text.trim()}</span> »
                            </span>
                            <span className="ml-auto text-2xs text-ink-4">texte libre</span>
                        </Option>
                    )}
                    {suggestions.map((s, i) => (
                        <Option key={s.naf} active={cursor === i + 1} onPick={() => add({ label: s.label, naf: s.naf })}>
                            <span className="font-medium text-ink">{s.label}</span>
                            <span className="truncate text-xs text-ink-4">{s.nafLabel}</span>
                            <span className="ml-auto shrink-0 font-mono text-2xs text-ink-3">{s.naf}</span>
                        </Option>
                    ))}
                </ul>
            )}
        </div>
    );
}

function Option({ active, onPick, children }: { active: boolean; onPick: () => void; children: React.ReactNode }) {
    return (
        <li
            role="option"
            aria-selected={active}
            onMouseDown={(e) => {
                e.preventDefault();
                onPick();
            }}
            className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm",
                active ? "bg-primary-50" : "hover:bg-surface-2",
            )}
        >
            {children}
        </li>
    );
}
