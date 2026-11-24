"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Check, Minus, Search, X } from "lucide-react";
import { REGIONS } from "@/lib/sourcing/france";
import {
    ALL_CODES, departementName, departementsOf, normalizeCodes, regionCover, regionOf, searchPlaces, toggleDepartement, toggleRegion,
    type PlaceOption, type Territory,
} from "@/lib/onboarding/territory";
import type { CountsPayload, CountsStatus } from "./counts";
import { countLabel } from "./counts";
import { useLeaving } from "./motion";
import type { InsetBox, MapShape } from "./france-map-data";

type Geometry = typeof import("./france-map-data");

export interface TerritoryChange {
    codes: string[];
    added: boolean;
    /** Screen point the change came from (the clicked shape), for the flight to the counter. */
    origin?: { x: number; y: number };
}

interface Props {
    territory: Territory;
    counts: CountsPayload | null;
    status: CountsStatus;
    reduced: boolean;
    onChange: (update: (prev: Territory) => Territory, change: TerritoryChange) => void;
}

const DIRECTIONS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };

/** 0 = no data, 1…5 on a log scale against the busiest département. */
function densityLevels(counts: CountsPayload | null): Record<string, number> {
    if (!counts) return {};
    const values = Object.values(counts.departements).map((p) => p[0]);
    const max = Math.max(0, ...values);
    const levels: Record<string, number> = {};
    for (const [code, [n]] of Object.entries(counts.departements)) {
        levels[code] = n <= 0 || max <= 0 ? 0 : 1 + Math.min(4, Math.floor((4 * Math.log1p(n)) / Math.log1p(max) + 0.0001));
    }
    return levels;
}

export function TerritoryMap({ territory, counts, status, reduced, onChange }: Props) {
    const [geo, setGeo] = useState<Geometry | null>(null);
    const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
    const [regionHover, setRegionHover] = useState<string | null>(null);
    const [focusCode, setFocusCode] = useState<string>("75");
    const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
    const [tapped, setTapped] = useState<string | null>(null);
    const wrap = useRef<HTMLDivElement>(null);
    const svg = useRef<SVGSVGElement>(null);
    const rippleId = useRef(0);
    const uid = useId().replace(/:/g, "");

    useEffect(() => {
        let alive = true;
        // Lazy chunk: the outlines only load when this section mounts.
        import("./france-map-data").then((module) => { if (alive) setGeo(module); }).catch(() => undefined);
        return () => { alive = false; };
    }, []);

    const selected = useMemo(() => new Set(territory.all ? ALL_CODES : territory.codes), [territory]);
    const levels = useMemo(() => densityLevels(counts), [counts]);
    const small = counts?.small ?? 20;
    const highlighted = useMemo(() => new Set(regionHover ? departementsOf(regionHover) : []), [regionHover]);

    const navShapes = useMemo(() => (geo ? [...geo.MAINLAND, ...geo.OVERSEAS] : []), [geo]);

    function describe(code: string) {
        const pair = counts?.departements[code] ?? [0, 0];
        const what = status === "error" || !counts ? "" : ` · ${countLabel(pair[0], small, ["entreprise", "entreprises"])}`;
        return `${departementName(code)} (${code})${what}`;
    }

    // Updates are functions of the previous selection: several clicks landing before a
    // re-render all count, in order.
    function emit(edit: (codes: string[]) => string[], change: TerritoryChange) {
        onChange((prev) => {
            const codes = edit(prev.all ? [...ALL_CODES] : prev.codes);
            const all = codes.length === ALL_CODES.length;
            return { ...prev, all, codes: all ? [] : normalizeCodes(codes) };
        }, change);
    }

    function toggleCode(code: string, shape?: MapShape) {
        let origin: { x: number; y: number } | undefined;
        if (shape && svg.current) {
            const ctm = svg.current.getScreenCTM();
            if (ctm) origin = { x: shape.cx * ctm.a + ctm.e, y: shape.cy * ctm.d + ctm.f };
            if (!reduced) {
                const id = ++rippleId.current;
                setRipples((list) => [...list, { id, x: shape.cx, y: shape.cy }]);
                window.setTimeout(() => setRipples((list) => list.filter((r) => r.id !== id)), 650);
            }
        }
        emit((codes) => toggleDepartement(codes, code), { codes: [code], added: !selected.has(code), origin });
    }

    function toggleRegionByName(name: string) {
        const codes = departementsOf(name);
        emit((current) => toggleRegion(current, name), { codes, added: !codes.every((c) => selected.has(c)) });
    }

    function pick(option: PlaceOption) {
        if (option.kind === "region") toggleRegionByName(option.id);
        else toggleCode(option.id);
    }

    function onPointerMove(event: PointerEvent<SVGSVGElement>) {
        if (event.pointerType === "touch") return;
        const code = (event.target as Element).closest?.("[data-code]")?.getAttribute("data-code");
        const box = wrap.current?.getBoundingClientRect();
        if (!code || !box) { setHover(null); return; }
        setHover({ code, x: event.clientX - box.left, y: event.clientY - box.top });
    }

    function onShapeClick(code: string, shape: MapShape, pointerType: string) {
        toggleCode(code, shape);
        setFocusCode(code);
        if (pointerType === "touch" || pointerType === "pen") setTapped(code);
    }

    function onKeyDown(event: KeyboardEvent<SVGPathElement>, shape: MapShape) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleCode(shape.code, shape);
            return;
        }
        const dir = DIRECTIONS[event.key];
        if (!dir) return;
        event.preventDefault();
        let best: MapShape | null = null;
        let bestScore = Infinity;
        for (const other of navShapes) {
            if (other.code === shape.code) continue;
            const dx = other.cx - shape.cx, dy = other.cy - shape.cy;
            const along = dx * dir[0] + dy * dir[1];
            const across = Math.abs(dx * dir[1] - dy * dir[0]);
            // Stay within a ~55° cone, so « up » never lands on a neighbour that is mostly to the side.
            if (along <= 0 || across > along * 1.4) continue;
            const score = along + across * 2.2;
            if (score < bestScore) { bestScore = score; best = other; }
        }
        if (best) {
            setFocusCode(best.code);
            svg.current?.querySelector<SVGPathElement>(`[data-nav="${best.code}"]`)?.focus();
        }
    }

    const shapeProps = (shape: MapShape, focusable: boolean) => ({
        "data-code": shape.code,
        "data-level": levels[shape.code] ?? 0,
        "data-hl": highlighted.has(shape.code) || undefined,
        d: shape.d,
        onClick: (event: React.MouseEvent<SVGPathElement>) =>
            onShapeClick(shape.code, shape, (event.nativeEvent as globalThis.PointerEvent).pointerType ?? "mouse"),
        ...(focusable
            ? {
                id: `${uid}-${shape.code}`,
                "data-nav": shape.code,
                role: "button",
                tabIndex: focusCode === shape.code ? 0 : -1,
                "aria-pressed": selected.has(shape.code),
                "aria-label": describe(shape.code),
                onKeyDown: (event: KeyboardEvent<SVGPathElement>) => onKeyDown(event, shape),
                onFocus: () => setFocusCode(shape.code),
            }
            : { "aria-hidden": true as const }),
    });

    const layer = (shapes: MapShape[], focusable: boolean) => <>
        <g className="ms-map-base">{shapes.map((s) => <path key={s.code} {...shapeProps(s, focusable)} />)}</g>
        <g className="ms-map-sel" aria-hidden>{shapes.map((s) => <path key={s.code} d={s.d} data-on={selected.has(s.code) || undefined} data-level={levels[s.code] ?? 0} />)}</g>
    </>;

    const inset = (box: InsetBox, label: string) => <g className="ms-inset" aria-hidden>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={14} />
        <text x={box.x + 12} y={box.y + 19}>{label}</text>
    </g>;

    const regionStates = REGIONS.map((r) => ({ name: r.name, ...regionCover(territory.all ? ALL_CODES : territory.codes, r.name) }));
    const hovered = hover?.code;

    return <div className="ms-territory">
        <div className="ms-regions" role="group" aria-label="Sélection rapide par région">
            <button type="button" className="ms-chip ms-chip--strong" aria-pressed={territory.all}
                onClick={() => emit((codes) => (codes.length === ALL_CODES.length ? [] : [...ALL_CODES]), { codes: [...ALL_CODES], added: !territory.all })}>
                <span className="ms-chip-check" aria-hidden><Check size={13} /></span>Toute la France
            </button>
            {regionStates.map((r) => <button key={r.name} type="button" className="ms-chip" data-state={r.state}
                aria-pressed={r.state === "full" ? true : r.state === "partial" ? "mixed" : false}
                onClick={() => toggleRegionByName(r.name)} onPointerEnter={() => setRegionHover(r.name)} onPointerLeave={() => setRegionHover(null)}
                onFocus={() => setRegionHover(r.name)} onBlur={() => setRegionHover(null)}>
                <span className="ms-chip-check" aria-hidden><Check size={13} /></span>{r.name}
                {r.state === "partial" && <span className="ms-chip-count">{r.picked}/{r.total}</span>}
            </button>)}
        </div>

        <PlaceSearch territory={territory} counts={counts} small={small} onPick={pick} />

        <div className="ms-map" ref={wrap} data-ready={Boolean(geo) || undefined}>
            {!geo ? <div className="ms-map-skeleton" role="status"><span>Chargement de la carte…</span></div>
            : <svg ref={svg} viewBox={`0 0 ${geo.MAP_VIEWBOX.w} ${geo.MAP_VIEWBOX.h}`} className="ms-map-svg" role="group"
                aria-label="Carte des départements. Flèches pour se déplacer, Entrée pour sélectionner."
                onPointerMove={onPointerMove} onPointerLeave={() => setHover(null)}>
                {layer(geo.MAINLAND, true)}
                {inset(geo.PARIS_INSET.box, "Paris et petite couronne")}
                {layer(geo.PARIS_INSET.shapes, false)}
                {geo.OVERSEAS.map((s) => <g key={s.code}>{inset(s.box, s.name)}{layer([s], true)}</g>)}
                {hovered && [...geo.MAINLAND, ...geo.PARIS_INSET.shapes, ...geo.OVERSEAS].filter((s) => s.code === hovered)
                    .map((s, i) => <path key={i} d={s.d} className="ms-map-outline" aria-hidden />)}
                {ripples.map((r) => <circle key={r.id} className="ms-ripple" cx={r.x} cy={r.y} r={26} aria-hidden />)}
            </svg>}
            {hover && geo && <div className="ms-tip" style={{ transform: `translate3d(${hover.x}px, ${hover.y}px, 0)` }} aria-hidden>
                <strong>{departementName(hover.code)} <span>{hover.code}</span></strong>
                <span>{regionOf(hover.code)}</span>
                {counts && status !== "error" && <span className="ms-tip-count">{countLabel(counts.departements[hover.code]?.[0] ?? 0, small, ["entreprise", "entreprises"])} · {countLabel(counts.departements[hover.code]?.[1] ?? 0, small, ["décideur", "décideurs"])}</span>}
                <em>{selected.has(hover.code) ? "Cliquez pour retirer" : "Cliquez pour ajouter"}</em>
            </div>}
        </div>
        <p className="ms-map-live" aria-live="polite">{tapped ? `${describe(tapped)} — ${selected.has(tapped) ? "ajouté" : "retiré"}` : ""}</p>

        <div className="ms-legend" aria-hidden={status === "error"}>
            {status === "error" ? <span>Densité indisponible pour le moment. Vous pouvez quand même choisir votre zone.</span> : <>
                <span>Entreprises dans notre base</span>
                <span>peu</span>
                <span className="ms-legend-ramp">{[1, 2, 3, 4, 5].map((l) => <i key={l} data-level={l} />)}</span>
                <span>beaucoup</span>
                <span className="ms-legend-sel"><i />votre zone</span>
            </>}
        </div>

        <SelectionTokens territory={territory} reduced={reduced}
            onRemove={(gone) => emit((codes) => codes.filter((c) => !gone.includes(c)), { codes: gone, added: false })}
            onClear={() => emit(() => [], { codes: [], added: false })} />
    </div>;
}

function SelectionTokens({ territory, reduced, onRemove, onClear }: { territory: Territory; reduced: boolean; onRemove: (codes: string[]) => void; onClear: () => void }) {
    const tokens = useMemo(() => {
        if (territory.all) return [{ id: "all", label: "Toute la France", codes: [...ALL_CODES] }];
        const out: { id: string; label: string; codes: string[] }[] = [];
        const set = new Set(territory.codes);
        for (const r of REGIONS) {
            const inside = r.departements.filter((d) => set.has(d.code));
            if (!inside.length) continue;
            if (inside.length === r.departements.length && r.departements.length > 1) out.push({ id: r.name, label: r.name, codes: inside.map((d) => d.code) });
            else out.push(...inside.map((d) => ({ id: d.code, label: `${d.name} · ${d.code}`, codes: [d.code] })));
        }
        return out;
    }, [territory.all, territory.codes]);
    const shown = useLeaving(tokens, (t) => t.id, reduced);
    if (!shown.length) return <p className="ms-hint">Cliquez sur la carte, une région ou cherchez un département. Sans sélection, toute la France est comptée.</p>;
    return <div className="ms-tokens" aria-label="Zone sélectionnée">
        {shown.map(({ item, leaving }) => <span key={item.id} className="ms-token" data-leaving={leaving || undefined}>
            {item.label}
            {!leaving && <button type="button" aria-label={`Retirer ${item.label}`} onClick={() => onRemove(item.codes)}><X size={12} /></button>}
        </span>)}
        {tokens.length > 1 && <button type="button" className="ms-link" onClick={onClear}>Tout effacer</button>}
    </div>;
}

function PlaceSearch({ territory, counts, small, onPick }: { territory: Territory; counts: CountsPayload | null; small: number; onPick: (o: PlaceOption) => void }) {
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [open, setOpen] = useState(false);
    const listId = useId();
    const options = useMemo(() => searchPlaces(query, 20), [query]);
    const selected = new Set(territory.all ? ALL_CODES : territory.codes);
    const state = (o: PlaceOption) => o.kind === "departement"
        ? (selected.has(o.id) ? "full" : "none")
        : regionCover([...selected], o.id).state;
    const countOf = (o: PlaceOption) => {
        if (!counts) return "";
        const codes = o.kind === "departement" ? [o.id] : departementsOf(o.id);
        const n = codes.reduce((sum, c) => sum + (counts.departements[c]?.[0] ?? 0), 0);
        return countLabel(n, small, ["entreprise", "entreprises"]);
    };
    function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((i) => Math.min(options.length - 1, i + 1)); }
        else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
        else if (event.key === "Enter" && options[active]) { event.preventDefault(); onPick(options[active]); }
        else if (event.key === "Escape") { setQuery(""); setOpen(false); }
    }
    return <div className="ms-search" data-open={open || query.length > 0 || undefined}>
        <label className="ms-search-field">
            <Search size={16} aria-hidden />
            <span className="ms-sr">Rechercher un département ou une région</span>
            <input role="combobox" aria-expanded={open || query.length > 0} aria-controls={listId} aria-autocomplete="list"
                aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
                placeholder="Département, numéro ou région…" value={query}
                onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
                onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} onKeyDown={onKeyDown} />
        </label>
        <ul id={listId} role="listbox" aria-multiselectable="true" aria-label="Départements et régions" className="ms-places">
            {options.length === 0 && <li className="ms-places-empty" role="presentation">Aucun résultat pour « {query} ».</li>}
            {options.map((o, i) => {
                const s = state(o);
                return <li key={`${o.kind}-${o.id}`} id={`${listId}-${i}`} role="option" aria-selected={s === "full"} data-active={i === active || undefined} data-state={s}
                    onPointerDown={(event) => event.preventDefault()} onClick={() => { setActive(i); onPick(o); }}>
                    <span className="ms-place-box" aria-hidden>{s === "full" ? <Check size={12} /> : s === "partial" ? <Minus size={12} /> : null}</span>
                    <span className="ms-place-label">{o.label}<small>{o.kind === "region" ? `Région · ${o.hint}` : o.hint}</small></span>
                    <span className="ms-place-count">{countOf(o)}</span>
                </li>;
            })}
        </ul>
    </div>;
}
