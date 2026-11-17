"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Briefcase, Building2, Crosshair, Layers, Loader2, MapPin, Plus, Sparkles, ThumbsDown, ThumbsUp, Trash2, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    JOB_TITLE_SUGGESTIONS, MAX_SEGMENTS, SECTORS, SIZES, newSegment,
    type Answers, type Segment,
} from "@/lib/client-onboarding/questionnaire";
import type { MarketResult } from "@/lib/client-onboarding/market";
import { CARD, Chip, FOCUS, GroupTitle, TextArea, TextInput, Token } from "./ui";

// ── France, as tiles ────────────────────────────────────────────────────────
// A tile map of the régions (rough geography, one tile per région): readable at
// any size and needs no map data. The list beside it carries the full names.

const TILES: { name: string; code: string; col: number; row: number; span?: number }[] = [
    { name: "Hauts-de-France", code: "HDF", col: 3, row: 1 },
    { name: "Normandie", code: "NOR", col: 2, row: 2 },
    { name: "Île-de-France", code: "IDF", col: 3, row: 2 },
    { name: "Grand Est", code: "GES", col: 4, row: 2 },
    { name: "Bretagne", code: "BRE", col: 1, row: 3 },
    { name: "Pays de la Loire", code: "PDL", col: 2, row: 3 },
    { name: "Centre-Val de Loire", code: "CVL", col: 3, row: 3 },
    { name: "Bourgogne-Franche-Comté", code: "BFC", col: 4, row: 3 },
    { name: "Nouvelle-Aquitaine", code: "NAQ", col: 2, row: 4 },
    { name: "Auvergne-Rhône-Alpes", code: "ARA", col: 3, row: 4, span: 2 },
    { name: "Occitanie", code: "OCC", col: 2, row: 5, span: 2 },
    { name: "Provence-Alpes-Côte d'Azur", code: "PACA", col: 4, row: 5 },
    { name: "Corse", code: "COR", col: 5, row: 5 },
];
const OVERSEAS = "Outre-mer";
const ALL_REGIONS = [...TILES.map((t) => t.name).sort((a, b) => a.localeCompare(b, "fr")), OVERSEAS];

function RegionPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
    const toggle = (name: string) => onChange(value.includes(name) ? value.filter((r) => r !== name) : [...value, name]);
    return (
        <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
            <div className="flex flex-col items-center gap-2">
                <div className="grid grid-cols-5 grid-rows-5 gap-1.5" role="group" aria-label="Carte des régions">
                    {TILES.map((t) => {
                        const on = value.includes(t.name);
                        return (
                            <button
                                key={t.name}
                                type="button"
                                aria-pressed={on}
                                aria-label={t.name}
                                title={t.name}
                                onClick={() => toggle(t.name)}
                                style={{ gridColumn: `${t.col} / span ${t.span ?? 1}`, gridRow: t.row }}
                                className={cn(
                                    "flex h-11 min-w-11 items-center justify-center rounded-xl text-[10px] font-extrabold tracking-wide transition-all duration-150",
                                    "motion-safe:active:scale-95",
                                    on
                                        ? "bg-primary text-primary-fg shadow-[0_6px_16px_-6px_color-mix(in_oklab,var(--brand-primary)_60%,transparent)]"
                                        : "bg-surface-3 text-ink-3 hover:bg-primary-100 hover:text-primary-800",
                                    FOCUS,
                                )}
                            >
                                {t.code}
                            </button>
                        );
                    })}
                </div>
                <button
                    type="button"
                    aria-pressed={value.includes(OVERSEAS)}
                    onClick={() => toggle(OVERSEAS)}
                    className={cn(
                        "rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors",
                        value.includes(OVERSEAS) ? "bg-primary text-primary-fg" : "bg-surface-3 text-ink-3 hover:bg-primary-100",
                        FOCUS,
                    )}
                >
                    + Outre-mer
                </button>
            </div>
            <div>
                <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                    {ALL_REGIONS.map((name) => (
                        <li key={name}>
                            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 text-sm text-ink-2 hover:bg-surface-2">
                                <input
                                    type="checkbox"
                                    checked={value.includes(name)}
                                    onChange={() => toggle(name)}
                                    className="size-4 rounded border-line-strong accent-[var(--brand-primary)]"
                                />
                                <span className={cn(value.includes(name) && "font-semibold text-ink")}>{name}</span>
                            </label>
                        </li>
                    ))}
                </ul>
                <p className="mt-2 px-1.5 text-xs text-ink-3">
                    {value.length === 0 ? "Aucune région cochée : toute la France." : (
                        <button type="button" onClick={() => onChange([])} className={cn("font-semibold text-link hover:underline", FOCUS)}>
                            Tout décocher (France entière)
                        </button>
                    )}
                </p>
            </div>
        </div>
    );
}

// ── Live market size ────────────────────────────────────────────────────────

function useMarket(token: string, seg: Segment | undefined) {
    const [state, setState] = useState<{ key: string; data: MarketResult | null; loading: boolean }>({ key: "", data: null, loading: false });
    const key = seg ? JSON.stringify([seg.sectors, seg.sizes, seg.regions]) : "";
    useEffect(() => {
        if (!seg) return;
        let cancelled = false;
        setState((s) => ({ ...s, loading: true }));
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/public/onboarding/${token}/market`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sectors: seg.sectors, sizes: seg.sizes, regions: seg.regions }),
                });
                const json = await res.json();
                if (!cancelled) setState({ key, data: json.success ? json.data : { total: null, capped: false, samples: [] }, loading: false });
            } catch {
                if (!cancelled) setState({ key, data: { total: null, capped: false, samples: [] }, loading: false });
            }
        }, 450);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures the filters
    }, [token, key]);
    return state;
}

/** Counts from the number on screen to the new one. */
function useTween(target: number | null): number | null {
    const [shown, setShown] = useState(target);
    const from = useRef(target ?? 0);
    useEffect(() => {
        if (target === null) return;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const start = from.current;
        const t0 = performance.now();
        const duration = reduce || start === target ? 0 : 500;
        let raf = 0;
        const step = (now: number) => {
            const p = duration === 0 ? 1 : Math.min(1, (now - t0) / duration);
            const v = Math.round(start + (target - start) * (1 - Math.pow(1 - p, 3)));
            setShown(v);
            from.current = v;
            if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [target]);
    return target === null ? null : shown;
}

function MarketCounter({ data, loading }: { data: MarketResult | null; loading: boolean }) {
    const value = useTween(data?.total ?? null);
    const unavailable = !loading && data !== null && data.total === null;
    return (
        <div className="rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100/60 p-4 ring-1 ring-primary-100" aria-live="polite">
            {unavailable ? (
                <p className="text-sm font-semibold text-primary-900">Estimation indisponible pour le moment</p>
            ) : (
                <p className="font-display text-[2.1rem] font-extrabold leading-none tracking-tight text-primary-800 tabular-nums">
                    {value === null ? <span className="inline-block h-8 w-24 rounded-lg bg-primary-200/60 motion-safe:animate-pulse" /> : (
                        <>{value.toLocaleString("fr-FR")}{data?.capped && "+"}</>
                    )}
                </p>
            )}
            <p className="mt-1.5 text-sm font-medium text-primary-900/80">entreprises correspondent</p>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-primary-700">
                {loading ? <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden /> : <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />}
                {loading ? "Mise à jour…" : "Registre officiel des entreprises · en direct"}
            </p>
        </div>
    );
}

// ── Samples ─────────────────────────────────────────────────────────────────

const TILE_TONES = ["bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700", "bg-emerald-100 text-emerald-700", "bg-rose-100 text-rose-700", "bg-teal-100 text-teal-700"];

function SamplesPanel({ data, loading, answers, onVerdict }: {
    data: MarketResult | null;
    loading: boolean;
    answers: Answers;
    onVerdict: (s: { siren: string; name: string }, v: "yes" | "no" | null) => void;
}) {
    const verdictOf = (siren: string) => answers.samples.find((s) => s.siren === siren)?.verdict ?? null;
    const samples = data?.samples ?? [];
    return (
        <section className={cn(CARD, "flex flex-col p-6")}>
            <h2 className="font-display text-xl font-bold text-ink">Exemples d&apos;entreprises ciblées</h2>
            <p className="mt-1 text-sm text-ink-3">Un aperçu d&apos;entreprises réelles qui correspondent à cette cible.</p>
            <ul className={cn("mt-4 flex-1 divide-y divide-line-subtle transition-opacity", loading && samples.length > 0 && "opacity-60")}>
                {samples.length === 0 && (loading || !data) && [0, 1, 2, 3, 4].map((i) => (
                    <li key={i} className="flex items-center gap-3 py-3">
                        <span className="size-11 rounded-xl bg-surface-3 motion-safe:animate-pulse" />
                        <span className="h-4 flex-1 rounded bg-surface-3 motion-safe:animate-pulse" />
                    </li>
                ))}
                {samples.length === 0 && !loading && data && (
                    <li className="py-8 text-center text-sm text-ink-3">Aucun exemple pour ces critères. Élargissez un peu la cible.</li>
                )}
                {samples.map((s, i) => {
                    const v = verdictOf(s.siren);
                    return (
                        <li key={s.siren} className={cn("flex flex-wrap items-center gap-3 py-3 transition-opacity", v === "no" && "opacity-55")}>
                            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl font-display text-lg font-extrabold", TILE_TONES[i % TILE_TONES.length])} aria-hidden>
                                {s.name.charAt(0)}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-bold text-ink">{s.name}</p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
                                    {s.city && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{s.city}</span>}
                                    {s.headcount && <span className="inline-flex items-center gap-1"><Users className="size-3" aria-hidden />{s.headcount}</span>}
                                </p>
                            </div>
                            <div className="flex gap-1.5" role="group" aria-label={`Votre avis sur ${s.name}`}>
                                <button
                                    type="button"
                                    aria-pressed={v === "yes"}
                                    onClick={() => onVerdict(s, v === "yes" ? null : "yes")}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors",
                                        v === "yes" ? "border-primary bg-primary text-primary-fg" : "border-line text-ink-2 hover:border-primary hover:text-primary-700",
                                        FOCUS,
                                    )}
                                >
                                    <ThumbsUp className="size-3.5" aria-hidden /> Pertinent
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={v === "no"}
                                    onClick={() => onVerdict(s, v === "no" ? null : "no")}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors",
                                        v === "no" ? "border-ink-3 bg-ink-3 text-white" : "border-line text-ink-2 hover:border-ink-3",
                                        FOCUS,
                                    )}
                                >
                                    <ThumbsDown className="size-3.5" aria-hidden /> Pas pour nous
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ul>
            <p className="mt-4 flex items-center gap-2 border-t border-line-subtle pt-4 text-sm italic text-ink-3">
                <Crosshair className="size-4 shrink-0 not-italic" aria-hidden />
                Vos choix nous aident à affiner le ciblage.
            </p>
        </section>
    );
}

// ── Screen ──────────────────────────────────────────────────────────────────

const VISIBLE_SECTORS = 8;

export function TargetsScreen({ token, answers, update }: {
    token: string;
    answers: Answers;
    update: (fn: (a: Answers) => void) => void;
}) {
    const segments = answers.segments.length ? answers.segments : [newSegment("s1", 0)];
    const [activeId, setActiveId] = useState(segments[0].id);
    const seg = segments.find((s) => s.id === activeId) ?? segments[0];
    const index = segments.indexOf(seg);
    const [showAllSectors, setShowAllSectors] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const market = useMarket(token, seg);

    // Make sure answers hold at least the segment on screen.
    useEffect(() => {
        if (answers.segments.length === 0) update((a) => { a.segments = [newSegment("s1", 0)]; });
    }, [answers.segments.length, update]);

    const edit = (fn: (s: Segment) => void) => update((a) => {
        const target = a.segments.find((s) => s.id === seg.id);
        if (target) fn(target);
    });
    const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

    const addSegment = () => {
        const id = `s${Date.now().toString(36)}`;
        update((a) => { a.segments.push(newSegment(id, a.segments.length)); });
        setActiveId(id);
    };
    const removeSegment = () => {
        const next = segments[index === 0 ? 1 : index - 1];
        update((a) => { a.segments = a.segments.filter((s) => s.id !== seg.id); });
        if (next) setActiveId(next.id);
    };

    const addTitle = (t: string) => {
        const v = t.trim();
        if (!v || seg.jobTitles.some((x) => x.toLowerCase() === v.toLowerCase()) || seg.jobTitles.length >= 20) return;
        edit((s) => { s.jobTitles.push(v.slice(0, 120)); });
    };

    const sectorList = useMemo(() => {
        const head = SECTORS.slice(0, VISIBLE_SECTORS);
        if (showAllSectors) return SECTORS;
        const picked = SECTORS.slice(VISIBLE_SECTORS).filter((s) => seg.sectors.includes(s.key));
        return [...head, ...picked];
    }, [showAllSectors, seg.sectors]);

    return (
        <div>
            <header className="mb-6 flex items-start gap-4">
                <span className="hidden size-14 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 sm:flex" aria-hidden>
                    <Crosshair className="size-7" />
                </span>
                <div>
                    <h1 className="font-display text-[clamp(1.75rem,3.2vw,2.5rem)] font-extrabold leading-[1.1] tracking-tight text-ink">Vos cibles</h1>
                    <p className="mt-2 max-w-3xl text-base leading-relaxed text-ink-3">
                        Décrivez les entreprises que vous voulez rencontrer. Vous pouvez créer plusieurs cibles : une par marché, par offre ou par type d&apos;interlocuteur.
                    </p>
                </div>
            </header>

            {/* Segment tabs */}
            <div className="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Vos cibles">
                {segments.map((s, i) => (
                    <button
                        key={s.id}
                        type="button"
                        role="tab"
                        aria-selected={s.id === seg.id}
                        onClick={() => setActiveId(s.id)}
                        className={cn(
                            "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors",
                            s.id === seg.id ? "bg-ink text-white" : "bg-surface text-ink-2 ring-1 ring-line hover:ring-line-strong",
                            FOCUS,
                        )}
                    >
                        <span className={cn("flex size-5 items-center justify-center rounded-md text-[11px]", s.id === seg.id ? "bg-white/15" : "bg-surface-3")}>{i + 1}</span>
                        {s.name || `Cible ${i + 1}`}
                    </button>
                ))}
                {segments.length < MAX_SEGMENTS && (
                    <button
                        type="button"
                        onClick={addSegment}
                        className={cn("inline-flex items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3.5 py-2 text-sm font-bold text-ink-2 hover:border-primary hover:text-primary-700", FOCUS)}
                    >
                        <Plus className="size-4" aria-hidden /> Ajouter une cible
                    </button>
                )}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <section className={cn(CARD, "p-6")} role="tabpanel" aria-label={seg.name || `Cible ${index + 1}`}>
                    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
                        <div>
                            <label htmlFor="segment-name" className="text-xs font-bold uppercase tracking-[0.12em] text-ink-4">Nom de la cible</label>
                            <div className="mt-1 flex items-center gap-2">
                                <input
                                    id="segment-name"
                                    value={seg.name}
                                    maxLength={80}
                                    placeholder={`Cible ${index + 1}`}
                                    onChange={(e) => edit((s) => { s.name = e.target.value; })}
                                    className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 font-display text-2xl font-extrabold text-ink placeholder:text-ink-4 hover:border-line focus:border-primary focus:outline-none"
                                />
                                {segments.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={removeSegment}
                                        aria-label="Supprimer cette cible"
                                        title="Supprimer cette cible"
                                        className={cn("rounded-lg p-2 text-ink-4 hover:bg-rose-50 hover:text-rose-600", FOCUS)}
                                    >
                                        <Trash2 className="size-4" aria-hidden />
                                    </button>
                                )}
                            </div>
                            <p className="mt-1 px-1 text-sm text-ink-3">Qui voulez-vous rencontrer ?</p>
                        </div>
                        <MarketCounter data={market.data} loading={market.loading} />
                    </div>

                    <div className="mt-6 space-y-6 divide-y divide-line-subtle [&>*:not(:first-child)]:pt-6">
                        <div>
                            <GroupTitle icon={Layers}>Secteurs</GroupTitle>
                            <div className="flex flex-wrap gap-2">
                                {sectorList.map((s) => (
                                    <Chip key={s.key} selected={seg.sectors.includes(s.key)} onClick={() => edit((x) => { x.sectors = toggleIn(x.sectors, s.key); })}>
                                        {s.label}
                                    </Chip>
                                ))}
                                {!showAllSectors && (
                                    <button type="button" onClick={() => setShowAllSectors(true)} className={cn("inline-flex items-center gap-1 rounded-xl border border-dashed border-line-strong px-3.5 py-2 text-sm font-semibold text-ink-3 hover:text-ink", FOCUS)}>
                                        <Plus className="size-4" aria-hidden /> Plus de secteurs
                                    </button>
                                )}
                            </div>
                        </div>

                        <div>
                            <GroupTitle icon={Users}>Taille (salariés)</GroupTitle>
                            <div className="flex flex-wrap gap-2">
                                {SIZES.map((s) => (
                                    <Chip key={s.key} selected={seg.sizes.includes(s.key)} onClick={() => edit((x) => { x.sizes = toggleIn(x.sizes, s.key); })}>
                                        {s.label}
                                    </Chip>
                                ))}
                            </div>
                        </div>

                        <div>
                            <GroupTitle icon={MapPin}>Régions</GroupTitle>
                            <RegionPicker value={seg.regions} onChange={(v) => edit((x) => { x.regions = v; })} />
                        </div>

                        <div>
                            <GroupTitle icon={Briefcase}>Fonctions à rencontrer</GroupTitle>
                            {seg.jobTitles.length > 0 && (
                                <div className="mb-3 flex flex-wrap gap-2">
                                    {seg.jobTitles.map((t) => (
                                        <Token key={t} label={`Retirer ${t}`} onRemove={() => edit((x) => { x.jobTitles = x.jobTitles.filter((j) => j !== t); })}>{t}</Token>
                                    ))}
                                </div>
                            )}
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    addTitle(titleDraft);
                                    setTitleDraft("");
                                }}
                                className="flex gap-2"
                            >
                                <TextInput
                                    aria-label="Ajouter une fonction"
                                    placeholder="Ex. Directeur des achats, puis Entrée"
                                    value={titleDraft}
                                    onChange={(e) => setTitleDraft(e.target.value)}
                                    icon={Building2}
                                />
                                <button type="submit" className={cn("shrink-0 rounded-xl bg-surface-2 px-4 text-sm font-bold text-ink-2 ring-1 ring-line hover:bg-surface-3", FOCUS)}>
                                    Ajouter
                                </button>
                            </form>
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                                {JOB_TITLE_SUGGESTIONS.filter((t) => !seg.jobTitles.includes(t)).slice(0, 8).map((t) => (
                                    <button key={t} type="button" onClick={() => addTitle(t)} className={cn("rounded-lg px-2 py-1 text-xs font-semibold text-ink-3 hover:bg-primary-50 hover:text-primary-700", FOCUS)}>
                                        + {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <GroupTitle icon={Sparkles}>Précisions sur cette cible <span className="text-xs font-medium text-ink-4">· facultatif</span></GroupTitle>
                            <TextArea
                                aria-label="Précisions sur cette cible"
                                value={seg.notes}
                                maxLength={1500}
                                placeholder="Ex. entreprises avec une flotte de plus de 20 véhicules, en croissance, sans prestataire actuel…"
                                onChange={(e) => edit((x) => { x.notes = e.target.value; })}
                            />
                        </div>
                    </div>
                </section>

                <div className="xl:sticky xl:top-24 xl:self-start">
                    <SamplesPanel
                        data={market.data}
                        loading={market.loading}
                        answers={answers}
                        onVerdict={(s, v) => update((a) => {
                            a.samples = a.samples.filter((x) => x.siren !== s.siren);
                            if (v) a.samples.push({ siren: s.siren, name: s.name, verdict: v });
                            a.samples = a.samples.slice(-40);
                        })}
                    />
                </div>
            </div>
        </div>
    );
}
