"use client";

import { Fragment, useMemo, useState } from "react";
import {
    ChevronDown,
    ExternalLink,
    Globe,
    Phone,
    Search,
    Star,
    UserRound,
    Users,
    X,
} from "lucide-react";
import { Checkbox, SegmentedControl, Select } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";
import { SOURCE_BY_ID } from "@/lib/sourcing/catalog";
import { DEPT_NAME, deptFromPostcode } from "@/lib/sourcing/france";
import type { CrmMatch, SourcedLead, SourceId } from "@/lib/sourcing/types";

// ============================================
// Merged results: facets that answer "what is worth importing", a dense
// table, and an inline detail row. Selection is lifted to the page.
// ============================================

type CrmFilter = "all" | "new" | "known";
type Sort = "relevance" | "name" | "rating";
type Facet = "phone" | "website" | "contact" | "multi";

const PAGE = 100;

export const SOURCE_DOT: Record<SourceId, string> = {
    gmaps: "bg-success",
    annuaire: "bg-primary-600",
    apollo: "bg-accent",
};

function relevance(l: SourcedLead) {
    return l.sources.length * 3 + (l.phone ? 2 : 0) + (l.contacts.length ? 1 : 0) + (l.website ? 1 : 0);
}

function formatPhone(p?: string) {
    if (!p) return "";
    const m = p.match(/^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/);
    return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}` : p;
}

export function ResultsTable({
    leads,
    matches,
    selected,
    onSelectedChange,
}: {
    leads: SourcedLead[];
    matches: Record<string, CrmMatch>;
    selected: Set<string>;
    onSelectedChange: (next: Set<string>) => void;
}) {
    const [crm, setCrm] = useState<CrmFilter>("all");
    const [facets, setFacets] = useState<Set<Facet>>(new Set());
    const [hideClosed, setHideClosed] = useState(true);
    const [text, setText] = useState("");
    const [sort, setSort] = useState<Sort>("relevance");
    const [expanded, setExpanded] = useState<string | null>(null);
    const [limit, setLimit] = useState(PAGE);
    const [dept, setDept] = useState("");
    const [minRating, setMinRating] = useState(0);

    // Département facet: only worth showing when results span several.
    const depts = useMemo(() => {
        const byCode = new Map<string, number>();
        for (const l of leads) {
            const code = deptFromPostcode(l.postalCode);
            if (code) byCode.set(code, (byCode.get(code) ?? 0) + 1);
        }
        return Array.from(byCode, ([code, n]) => ({ code, n })).sort((a, b) => a.code.localeCompare(b.code));
    }, [leads]);
    const hasRatings = useMemo(() => leads.some((l) => l.rating != null), [leads]);

    const counts = useMemo(
        () => ({
            known: leads.filter((l) => matches[l.id]).length,
            phone: leads.filter((l) => l.phone).length,
            website: leads.filter((l) => l.website).length,
            contact: leads.filter((l) => l.contacts.length).length,
            multi: leads.filter((l) => l.sources.length > 1).length,
            closed: leads.filter((l) => l.closed).length,
        }),
        [leads, matches],
    );

    const rows = useMemo(() => {
        const q = text.trim().toLowerCase();
        const out = leads.filter((l) => {
            if (crm === "new" && matches[l.id]) return false;
            if (crm === "known" && !matches[l.id]) return false;
            if (hideClosed && l.closed) return false;
            if (facets.has("phone") && !l.phone) return false;
            if (facets.has("website") && !l.website) return false;
            if (facets.has("contact") && !l.contacts.length) return false;
            if (facets.has("multi") && l.sources.length < 2) return false;
            if (dept && deptFromPostcode(l.postalCode) !== dept) return false;
            if (minRating && (l.rating ?? 0) < minRating) return false;
            if (q && !`${l.name} ${l.city ?? ""} ${l.industry ?? ""} ${l.postalCode ?? ""}`.toLowerCase().includes(q)) return false;
            return true;
        });
        out.sort((a, b) =>
            sort === "name"
                ? a.name.localeCompare(b.name, "fr")
                : sort === "rating"
                  ? (b.rating ?? 0) - (a.rating ?? 0) || (b.reviews ?? 0) - (a.reviews ?? 0)
                  : relevance(b) - relevance(a),
        );
        return out;
    }, [leads, matches, crm, facets, hideClosed, text, sort, dept, minRating]);

    const visible = rows.slice(0, limit);
    const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
    const someChecked = !allChecked && rows.some((r) => selected.has(r.id));

    const toggleAll = () => {
        const next = new Set(selected);
        if (allChecked) rows.forEach((r) => next.delete(r.id));
        else rows.forEach((r) => next.add(r.id));
        onSelectedChange(next);
    };
    const toggle = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelectedChange(next);
    };
    const toggleFacet = (f: Facet) => {
        const next = new Set(facets);
        if (next.has(f)) next.delete(f);
        else next.add(f);
        setFacets(next);
        setLimit(PAGE);
    };

    const filtersActive = crm !== "all" || facets.size > 0 || !!text || !!dept || minRating > 0;

    return (
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            {/* Toolbar */}
            <div className="space-y-3 border-b border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <SegmentedControl<CrmFilter>
                        ariaLabel="Statut CRM"
                        size="sm"
                        value={crm}
                        onChange={(v) => {
                            setCrm(v);
                            setLimit(PAGE);
                        }}
                        options={[
                            { value: "all", label: "Toutes", count: leads.length },
                            { value: "new", label: "Nouvelles", count: leads.length - counts.known },
                            { value: "known", label: "Déjà au CRM", count: counts.known },
                        ]}
                    />
                    <div className="relative ml-auto w-full sm:w-64">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
                        <input
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Filtrer par nom, ville…"
                            className="h-8 w-full rounded-control border border-line bg-surface pl-9 pr-8 text-[13px] text-ink shadow-2xs outline-none placeholder:text-ink-4 focus:border-primary-400 focus:ring-4 focus:ring-primary-500/12"
                        />
                        {text && (
                            <button
                                type="button"
                                aria-label="Effacer"
                                onClick={() => setText("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-4 hover:text-ink"
                            >
                                <X className="size-3.5" />
                            </button>
                        )}
                    </div>
                    {depts.length > 1 && (
                        <div className="w-48">
                            <Select
                                searchable={depts.length > 8}
                                maxHeight={320}
                                value={dept}
                                onChange={(v) => {
                                    setDept(v);
                                    setLimit(PAGE);
                                }}
                                options={[
                                    { value: "", label: `Tous départements (${depts.length})` },
                                    ...depts.map((d) => ({
                                        value: d.code,
                                        label: `${d.code} · ${DEPT_NAME[d.code] ?? "?"} (${d.n})`,
                                    })),
                                ]}
                            />
                        </div>
                    )}
                    {hasRatings && (
                        <div className="w-36">
                            <Select
                                value={String(minRating)}
                                onChange={(v) => {
                                    setMinRating(Number(v));
                                    setLimit(PAGE);
                                }}
                                options={[
                                    { value: "0", label: "Toutes notes" },
                                    { value: "3.5", label: "Note ≥ 3,5" },
                                    { value: "4", label: "Note ≥ 4" },
                                    { value: "4.5", label: "Note ≥ 4,5" },
                                ]}
                            />
                        </div>
                    )}
                    <div className="w-40">
                        <Select
                            value={sort}
                            onChange={(v) => setSort(v as Sort)}
                            options={[
                                { value: "relevance", label: "Plus complètes" },
                                { value: "rating", label: "Mieux notées" },
                                { value: "name", label: "Nom A→Z" },
                            ]}
                        />
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <FacetChip on={facets.has("phone")} onClick={() => toggleFacet("phone")} icon={Phone} label="Téléphone" count={counts.phone} />
                    <FacetChip on={facets.has("website")} onClick={() => toggleFacet("website")} icon={Globe} label="Site web" count={counts.website} />
                    <FacetChip on={facets.has("contact")} onClick={() => toggleFacet("contact")} icon={UserRound} label="Dirigeant / contact" count={counts.contact} />
                    <FacetChip on={facets.has("multi")} onClick={() => toggleFacet("multi")} icon={Users} label="Plusieurs sources" count={counts.multi} />
                    {counts.closed > 0 && (
                        <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-3">
                            <Checkbox checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} />
                            Masquer les {counts.closed} fermées
                        </label>
                    )}
                    <span className="ml-auto hidden items-center gap-3 text-2xs text-ink-4 lg:flex">
                        {(["gmaps", "annuaire", "apollo"] as SourceId[]).map((s) => (
                            <span key={s} className="inline-flex items-center gap-1">
                                <span className={cn("size-1.5 rounded-full", SOURCE_DOT[s])} />
                                {SOURCE_BY_ID[s].short}
                            </span>
                        ))}
                    </span>
                    {filtersActive && (
                        <button
                            type="button"
                            onClick={() => {
                                setCrm("all");
                                setFacets(new Set());
                                setText("");
                                setDept("");
                                setMinRating(0);
                            }}
                            className="text-xs font-medium text-ink-3 hover:text-ink"
                        >
                            Réinitialiser
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] table-fixed border-collapse text-left">
                    <thead>
                        <tr className="border-b border-line bg-surface-2 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-3">
                            <th className="w-11 py-2.5 pl-4">
                                <Checkbox
                                    aria-label="Tout sélectionner"
                                    checked={allChecked}
                                    indeterminate={someChecked}
                                    onChange={toggleAll}
                                />
                            </th>
                            <th className="py-2.5 pr-3">
                                Société <span className="font-normal normal-case tracking-normal text-ink-4">· {rows.length.toLocaleString("fr-FR")}</span>
                            </th>
                            <th className="w-36 py-2.5 pr-3">Téléphone</th>
                            <th className="w-36 py-2.5 pr-3">Site web</th>
                            <th className="w-52 py-2.5 pr-3">Signaux</th>
                            <th className="w-36 py-2.5 pr-4">CRM</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((l) => {
                            const match = matches[l.id];
                            const isOpen = expanded === l.id;
                            const isSel = selected.has(l.id);
                            return (
                                <Fragment key={l.id}>
                                    <tr
                                        onClick={() => setExpanded(isOpen ? null : l.id)}
                                        className={cn(
                                            "group cursor-pointer border-b border-line-subtle align-middle transition-colors",
                                            isSel ? "bg-primary-50/50" : "hover:bg-surface-2",
                                            l.closed && "opacity-55",
                                        )}
                                    >
                                        <td className="py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
                                            <Checkbox aria-label={`Sélectionner ${l.name}`} checked={isSel} onChange={() => toggle(l.id)} />
                                        </td>
                                        <td className="max-w-0 py-2.5 pr-3">
                                            <div className="flex items-center gap-1.5">
                                                <span className="truncate text-sm font-semibold text-ink">{l.name}</span>
                                                <SourcePips sources={l.sources} />
                                                {l.closed && (
                                                    <span className="shrink-0 rounded bg-danger-soft px-1 text-2xs font-semibold text-danger-ink">Fermé</span>
                                                )}
                                                <ChevronDown
                                                    className={cn("size-3.5 shrink-0 text-ink-4 opacity-0 transition group-hover:opacity-100", isOpen && "rotate-180 opacity-100")}
                                                />
                                            </div>
                                            <div className="truncate text-xs text-ink-3">
                                                {[l.industry, [l.postalCode, l.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "—"}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap py-2.5 pr-3 text-[13px] tabular-nums">
                                            {l.phone ? <span className="text-ink">{formatPhone(l.phone)}</span> : <Dash />}
                                        </td>
                                        <td className="max-w-0 py-2.5 pr-3 text-[13px]">
                                            {l.website ? (
                                                <a
                                                    href={`https://${l.website}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="block truncate text-link hover:underline"
                                                >
                                                    {l.website}
                                                </a>
                                            ) : (
                                                <Dash />
                                            )}
                                        </td>
                                        <td className="py-2.5 pr-3">
                                            <Signals lead={l} />
                                        </td>
                                        <td className="max-w-0 py-2.5 pr-4">
                                            {match ? (
                                                <span
                                                    className="block truncate text-xs font-medium text-warning-ink"
                                                    title={`Trouvée par ${match.by === "phone" ? "téléphone" : match.by === "domain" ? "site web" : "nom"} : ${match.companyName}`}
                                                >
                                                    {match.listName}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-ink">
                                                    <span className="size-1.5 rounded-full bg-success" />
                                                    Nouvelle
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                    {isOpen && (
                                        <tr className="border-b border-line bg-surface-2/70">
                                            <td />
                                            <td colSpan={5} className="py-4 pr-4">
                                                <LeadDetail lead={l} match={match} />
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
                {rows.length === 0 && (
                    <div className="px-6 py-14 text-center text-sm text-ink-3">Aucune société ne correspond à ces filtres.</div>
                )}
            </div>
            {rows.length > limit && (
                <div className="border-t border-line p-3 text-center">
                    <button
                        type="button"
                        onClick={() => setLimit((n) => n + PAGE)}
                        className={cn("rounded-control px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-50", FOCUS_RING)}
                    >
                        Afficher {Math.min(PAGE, rows.length - limit)} de plus · {rows.length - limit} restantes
                    </button>
                </div>
            )}
        </div>
    );
}

function Dash() {
    return <span className="text-ink-4">—</span>;
}

function FacetChip({
    on,
    onClick,
    icon: Icon,
    label,
    count,
}: {
    on: boolean;
    onClick: () => void;
    icon: typeof Phone;
    label: string;
    count: number;
}) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            disabled={count === 0}
            className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors disabled:opacity-40",
                FOCUS_RING,
                on ? "border-primary-300 bg-primary-50 text-primary-700" : "border-line bg-surface text-ink-2 hover:border-line-strong",
            )}
        >
            <Icon className="size-3.5" />
            {label}
            <span className={cn("tabular-nums", on ? "text-primary-500" : "text-ink-4")}>{count}</span>
        </button>
    );
}

/** One dot per source next to the company name; legend sits in the toolbar. */
function SourcePips({ sources }: { sources: SourceId[] }) {
    return (
        <span className="flex shrink-0 items-center gap-0.5" title={sources.map((s) => SOURCE_BY_ID[s].label).join(" + ")}>
            {sources.map((s) => (
                <span key={s} className={cn("size-1.5 rounded-full", SOURCE_DOT[s])} />
            ))}
        </span>
    );
}

function Signals({ lead: l }: { lead: SourcedLead }) {
    const items: React.ReactNode[] = [];
    if (l.rating)
        items.push(
            <span key="r" className="inline-flex items-center gap-0.5">
                <Star className="size-3 fill-warning text-warning" />
                <span className="font-medium text-ink">{l.rating.toFixed(1)}</span>
                {l.reviews ? <span className="text-ink-4">({l.reviews})</span> : null}
            </span>,
        );
    if (l.headcount) items.push(<span key="h">{l.headcount} sal.</span>);
    if (l.contacts.length)
        items.push(
            <span key="c" className="inline-flex items-center gap-0.5">
                <UserRound className="size-3" />
                {l.contacts.length}
            </span>,
        );
    if (items.length === 0) return <Dash />;
    return <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-ink-3 tabular-nums">{items}</div>;
}

function LeadDetail({ lead: l, match }: { lead: SourcedLead; match?: CrmMatch }) {
    const fields: [string, React.ReactNode][] = [
        ["Adresse", [l.address, [l.postalCode, l.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")],
        ["Activité", [l.industry, l.naf && <span key="n" className="font-mono text-xs text-ink-3">{l.naf}</span>]],
        ["SIREN", l.siren && (
            <a
                href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${l.siren}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-link hover:underline"
            >
                {l.siren.replace(/(\d{3})(?=\d)/g, "$1 ")}
                <ExternalLink className="size-3" />
            </a>
        )],
        ["Effectif", l.headcount && `${l.headcount} salariés`],
        ["Google Maps", l.mapsUrl && (
            <a href={l.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
                Voir la fiche
                {l.reviews ? ` · ${l.reviews} avis` : ""}
                <ExternalLink className="size-3" />
            </a>
        )],
        ["LinkedIn", l.linkedin && (
            <a href={l.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
                Page entreprise <ExternalLink className="size-3" />
            </a>
        )],
    ];

    return (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
                {fields
                    .filter(([, v]) => (Array.isArray(v) ? v.some(Boolean) : !!v))
                    .map(([k, v]) => (
                        <Fragment key={k}>
                            <dt className="text-ink-3">{k}</dt>
                            <dd className="flex min-w-0 flex-wrap items-center gap-1.5 text-ink">{v}</dd>
                        </Fragment>
                    ))}
                {match && (
                    <>
                        <dt className="text-ink-3">Déjà au CRM</dt>
                        <dd className="text-warning-ink">
                            « {match.companyName} » dans{" "}
                            <a href={`/manager/lists/${match.listId}`} className="font-medium underline" onClick={(e) => e.stopPropagation()}>
                                {match.listName}
                            </a>
                        </dd>
                    </>
                )}
            </dl>
            <div>
                <div className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-3">
                    Contacts {l.contacts.length > 0 && `· ${l.contacts.length}`}
                </div>
                {l.contacts.length === 0 ? (
                    <p className="text-[13px] text-ink-4">
                        Aucun contact nominatif. {l.sources.includes("annuaire") ? "" : "Ajoutez le Registre pour obtenir les dirigeants."}
                    </p>
                ) : (
                    <ul className="space-y-1.5">
                        {l.contacts.map((c, i) => (
                            <li key={i} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px]">
                                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-2xs font-semibold text-primary-700">
                                    {(c.firstName?.[0] ?? "") + (c.lastName?.[0] ?? "")}
                                </span>
                                <span className="min-w-0 flex-1 truncate">
                                    <span className="font-medium text-ink">{[c.firstName, c.lastName].filter(Boolean).join(" ")}</span>
                                    {c.title && <span className="text-ink-3"> · {c.title}</span>}
                                </span>
                                {c.email && <span className="truncate text-xs text-ink-3">{c.email}</span>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
