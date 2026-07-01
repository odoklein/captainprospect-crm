"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui";
import {
    Building2, Loader2, Search, Users, Globe2, Phone, Mail, X,
    ChevronDown, ChevronLeft, ChevronRight, Download, ArrowUpDown,
    ArrowUp, ArrowDown, Briefcase, MapPin, LayoutGrid, Rows3, User,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Contact {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
}

interface Company {
    id: string;
    name: string;
    country?: string | null;
    industry?: string | null;
    size?: string | null;
    phone?: string | null;
    website?: string | null;
    contacts: Contact[];
}

interface DatabaseResponse {
    companies: Company[];
}

type SortKey = "name" | "industry" | "country" | "contacts";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

function contactName(ct: Contact): string {
    return [ct.firstName, ct.lastName].filter(Boolean).join(" ") || "Contact";
}

function cleanWebsite(url: string): string {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/* ── CSV export (Excel FR: séparateur ; + BOM) ── */
function exportCsv(companies: Company[]) {
    const header = ["Entreprise", "Secteur", "Taille", "Pays", "Téléphone entreprise", "Site web", "Contact", "Fonction", "Email", "Téléphone contact"];
    const rows: string[][] = [];
    for (const c of companies) {
        const base = [c.name, c.industry ?? "", c.size ?? "", c.country ?? "", c.phone ?? "", c.website ?? ""];
        if (c.contacts.length === 0) {
            rows.push([...base, "", "", "", ""]);
        } else {
            for (const ct of c.contacts) {
                rows.push([...base, contactName(ct), ct.title ?? "", ct.email ?? "", ct.phone ?? ""]);
            }
        }
    }
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `base-de-donnees-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

/* ── KPI card ── */
function StatCard({ icon: Icon, label, value, hint }: {
    icon: typeof Building2; label: string; value: string | number; hint?: string;
}) {
    return (
        <div className="cpds-card flex items-center gap-3.5 px-4 py-3.5">
            <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
                style={{ background: "var(--cp-green-soft)", color: "var(--cp-green)" }}>
                <Icon className="w-[18px] h-[18px]" />
            </div>
            <div className="min-w-0">
                <p className="text-[22px] font-semibold leading-none tabular-nums" style={{ color: "var(--cp-ink)" }}>{value}</p>
                <p className="text-[11px] font-medium mt-1 truncate" style={{ color: "var(--cp-ink-3)" }}>
                    {label}{hint ? <span className="opacity-70"> · {hint}</span> : null}
                </p>
            </div>
        </div>
    );
}

/* ── Contact line (used in expanded row + cards) ── */
function ContactRow({ ct }: { ct: Contact }) {
    return (
        <div className="flex flex-col gap-1 rounded-[10px] px-3 py-2.5"
            style={{ background: "var(--cp-raised)", border: "1px solid var(--cp-border)" }}>
            <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "var(--cp-sunken)", color: "var(--cp-ink-3)" }}>
                    <User className="w-3 h-3" />
                </div>
                <span className="text-[13px] font-semibold truncate" style={{ color: "var(--cp-ink)" }}>{contactName(ct)}</span>
                {ct.title && (
                    <span className="text-[11px] truncate" style={{ color: "var(--cp-ink-3)" }}>· {ct.title}</span>
                )}
            </div>
            {(ct.email || ct.phone) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-8">
                    {ct.email && (
                        <a href={`mailto:${ct.email}`}
                            className="inline-flex items-center gap-1.5 text-[12px] transition-colors hover:underline"
                            style={{ color: "var(--cp-green)" }}>
                            <Mail className="w-3 h-3" />{ct.email}
                        </a>
                    )}
                    {ct.phone && (
                        <a href={`tel:${ct.phone}`}
                            className="inline-flex items-center gap-1.5 text-[12px] tabular-nums transition-colors hover:underline"
                            style={{ color: "var(--cp-ink-2)" }}>
                            <Phone className="w-3 h-3" />{ct.phone}
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}

export default function ClientPortalDatabasePage() {
    const { error: showError } = useToast();
    const [data, setData] = useState<DatabaseResponse>({ companies: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [viewMode, setViewMode] = useState<"cards" | "table">("table");
    const [industryFilter, setIndustryFilter] = useState("");
    const [countryFilter, setCountryFilter] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("name");
    const [sortDir, setSortDir] = useState<SortDir>("asc");
    const [page, setPage] = useState(1);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        (async () => {
            setIsLoading(true);
            try {
                const res = await fetch("/api/client/database");
                const json = await res.json();
                if (json.success) {
                    setData(json.data);
                } else {
                    showError("Erreur", json.error || "Impossible de charger la base de données");
                }
            } catch {
                showError("Erreur", "Impossible de charger la base de données");
            } finally {
                setIsLoading(false);
            }
        })();
    }, [showError]);

    /* Facets for filter dropdowns */
    const industries = useMemo(
        () => [...new Set(data.companies.map((c) => c.industry).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, "fr")),
        [data.companies]
    );
    const countries = useMemo(
        () => [...new Set(data.companies.map((c) => c.country).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, "fr")),
        [data.companies]
    );

    /* Search + filters + sort */
    const filteredCompanies = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = data.companies.filter((c) => {
            if (industryFilter && c.industry !== industryFilter) return false;
            if (countryFilter && c.country !== countryFilter) return false;
            if (!q) return true;
            const haystack = [
                c.name, c.industry, c.country, c.size,
                ...c.contacts.map((ct) => [ct.firstName, ct.lastName, ct.title, ct.email, ct.phone].filter(Boolean).join(" ")),
            ].filter(Boolean).join(" ").toLowerCase();
            return haystack.includes(q);
        });
        const dir = sortDir === "asc" ? 1 : -1;
        return [...filtered].sort((a, b) => {
            if (sortKey === "contacts") return (a.contacts.length - b.contacts.length) * dir;
            const av = (a[sortKey] ?? "").toString();
            const bv = (b[sortKey] ?? "").toString();
            return av.localeCompare(bv, "fr", { sensitivity: "base" }) * dir;
        });
    }, [data.companies, search, industryFilter, countryFilter, sortKey, sortDir]);

    /* Pagination (table view) */
    const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pagedCompanies = viewMode === "table"
        ? filteredCompanies.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
        : filteredCompanies;

    /* Reset page whenever the visible set changes */
    useEffect(() => { setPage(1); }, [search, industryFilter, countryFilter, sortKey, sortDir, viewMode]);

    const totalContacts = useMemo(() => data.companies.reduce((n, c) => n + c.contacts.length, 0), [data.companies]);
    const reachableCount = useMemo(
        () => data.companies.filter((c) => c.phone || c.contacts.some((ct) => ct.email || ct.phone)).length,
        [data.companies]
    );
    const hasActiveFilters = !!(search.trim() || industryFilter || countryFilter);

    const toggleExpanded = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir(key === "contacts" ? "desc" : "asc");
        }
    };

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortKey !== column) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
        return sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
    };

    const thClass = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider select-none";

    return (
        <div className="cpds-page min-h-full p-4 md:p-6 space-y-5">
            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 cpds-enter">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                        style={{ background: "var(--cp-green)", color: "var(--cp-on-inverse)" }}>
                        <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-[22px] font-semibold tracking-tight leading-tight" style={{ color: "var(--cp-ink)" }}>
                            Base de données
                        </h1>
                        <p className="text-[12px] mt-0.5" style={{ color: "var(--cp-ink-3)" }}>
                            Entreprises et contacts travaillés dans vos campagnes
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto">
                    {/* Export */}
                    <button
                        type="button"
                        onClick={() => exportCsv(filteredCompanies)}
                        disabled={isLoading || filteredCompanies.length === 0}
                        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-[10px] text-[12px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98]"
                        style={{ background: "var(--cp-green)", color: "var(--cp-on-inverse)" }}
                        title="Exporter la vue filtrée en CSV"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Exporter
                    </button>

                    {/* View toggle */}
                    <div className="flex items-center p-0.5 rounded-[10px]"
                        style={{ background: "var(--cp-sunken)", border: "1px solid var(--cp-border)" }}>
                        {([["table", Rows3, "Tableau"], ["cards", LayoutGrid, "Cartes"]] as const).map(([mode, Icon, label]) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => setViewMode(mode)}
                                className={cn(
                                    "inline-flex items-center gap-1.5 px-3 h-8 rounded-[8px] text-[12px] font-semibold transition-all",
                                    viewMode === mode ? "shadow-sm" : "hover:opacity-80"
                                )}
                                style={viewMode === mode
                                    ? { background: "var(--cp-raised)", color: "var(--cp-ink)" }
                                    : { color: "var(--cp-ink-3)" }}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── KPI strip ── */}
            {!isLoading && data.companies.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 cpds-enter" style={{ animationDelay: "40ms" }}>
                    <StatCard icon={Building2} label="Entreprises" value={data.companies.length} />
                    <StatCard icon={Users} label="Contacts" value={totalContacts} />
                    <StatCard icon={Briefcase} label="Secteurs" value={industries.length} />
                    <StatCard
                        icon={Phone}
                        label="Joignables"
                        value={data.companies.length > 0 ? `${Math.round((reachableCount / data.companies.length) * 100)}%` : "—"}
                        hint="tél. ou email"
                    />
                </div>
            )}

            {/* ── Toolbar: search + filters ── */}
            <div className="flex flex-wrap items-center gap-2 cpds-enter" style={{ animationDelay: "70ms" }}>
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--cp-ink-3)" }} />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Rechercher (entreprise, secteur, contact...)"
                        className="w-full h-9 pl-9 pr-8 rounded-[10px] text-[13px] focus:outline-none transition-shadow"
                        style={{
                            background: "var(--cp-raised)",
                            border: "1px solid var(--cp-border)",
                            color: "var(--cp-ink)",
                        }}
                        onFocus={(e) => { e.currentTarget.style.boxShadow = "var(--cp-focus-ring)"; }}
                        onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 hover:opacity-70"
                            style={{ color: "var(--cp-ink-3)" }}
                            aria-label="Effacer la recherche"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                <select
                    value={industryFilter}
                    onChange={(e) => setIndustryFilter(e.target.value)}
                    className="h-9 px-3 pr-8 rounded-[10px] text-[12px] font-medium focus:outline-none cursor-pointer"
                    style={{ background: "var(--cp-raised)", border: "1px solid var(--cp-border)", color: industryFilter ? "var(--cp-ink)" : "var(--cp-ink-3)" }}
                >
                    <option value="">Tous les secteurs</option>
                    {industries.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>

                <select
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value)}
                    className="h-9 px-3 pr-8 rounded-[10px] text-[12px] font-medium focus:outline-none cursor-pointer"
                    style={{ background: "var(--cp-raised)", border: "1px solid var(--cp-border)", color: countryFilter ? "var(--cp-ink)" : "var(--cp-ink-3)" }}
                >
                    <option value="">Tous les pays</option>
                    {countries.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>

                {hasActiveFilters && (
                    <button
                        type="button"
                        onClick={() => { setSearch(""); setIndustryFilter(""); setCountryFilter(""); }}
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[12px] font-semibold transition-colors hover:opacity-80"
                        style={{ color: "var(--cp-danger)", background: "var(--cp-danger-soft)" }}
                    >
                        <X className="w-3 h-3" />
                        Réinitialiser
                    </button>
                )}

                <span className="ml-auto text-[12px] font-medium tabular-nums" style={{ color: "var(--cp-ink-3)" }}>
                    {filteredCompanies.length} entreprise{filteredCompanies.length > 1 ? "s" : ""}
                    {hasActiveFilters && ` sur ${data.companies.length}`}
                </span>
            </div>

            {/* ── Content ── */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-7 h-7 animate-spin" style={{ color: "var(--cp-green)" }} />
                        <span className="text-sm" style={{ color: "var(--cp-ink-3)" }}>Chargement de la base de données…</span>
                    </div>
                </div>
            ) : filteredCompanies.length === 0 ? (
                <div className="cpds-enter rounded-[16px] py-16 px-6 text-center"
                    style={{ background: "var(--cp-raised)", border: "2px dashed var(--cp-border-strong)" }}>
                    <div className="mx-auto mb-4 w-14 h-14 rounded-[14px] flex items-center justify-center"
                        style={{ background: "var(--cp-sunken)" }}>
                        <Building2 className="w-6 h-6" style={{ color: "var(--cp-ink-3)" }} />
                    </div>
                    <p className="text-sm font-semibold" style={{ color: "var(--cp-ink)" }}>
                        {hasActiveFilters ? "Aucune entreprise ne correspond aux filtres" : "Aucune entreprise pour le moment"}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--cp-ink-3)" }}>
                        {hasActiveFilters ? "Ajustez la recherche ou réinitialisez les filtres." : "Les entreprises travaillées par l'équipe apparaîtront ici."}
                    </p>
                </div>
            ) : viewMode === "table" ? (
                <div className="cpds-card cpds-enter overflow-hidden" style={{ animationDelay: "100ms" }}>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead style={{ background: "var(--cp-sunken)", borderBottom: "1px solid var(--cp-border)" }}>
                                <tr style={{ color: "var(--cp-ink-3)" }}>
                                    <th className={thClass}>
                                        <button type="button" onClick={() => handleSort("name")} className="inline-flex items-center gap-1.5 uppercase tracking-wider hover:opacity-70 transition-opacity">
                                            Entreprise <SortIcon column="name" />
                                        </button>
                                    </th>
                                    <th className={thClass}>
                                        <button type="button" onClick={() => handleSort("industry")} className="inline-flex items-center gap-1.5 uppercase tracking-wider hover:opacity-70 transition-opacity">
                                            Secteur <SortIcon column="industry" />
                                        </button>
                                    </th>
                                    <th className={thClass}>
                                        <button type="button" onClick={() => handleSort("country")} className="inline-flex items-center gap-1.5 uppercase tracking-wider hover:opacity-70 transition-opacity">
                                            Pays <SortIcon column="country" />
                                        </button>
                                    </th>
                                    <th className={thClass}>Téléphone</th>
                                    <th className={thClass}>Site web</th>
                                    <th className={thClass}>
                                        <button type="button" onClick={() => handleSort("contacts")} className="inline-flex items-center gap-1.5 uppercase tracking-wider hover:opacity-70 transition-opacity">
                                            Contacts <SortIcon column="contacts" />
                                        </button>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedCompanies.map((company) => {
                                    const isExpanded = expandedIds.has(company.id);
                                    const canExpand = company.contacts.length > 0;
                                    return (
                                        <Fragment key={company.id}>
                                            <tr
                                                onClick={() => canExpand && toggleExpanded(company.id)}
                                                className={cn("transition-colors", canExpand && "cursor-pointer")}
                                                style={{
                                                    borderBottom: isExpanded ? "none" : "1px solid var(--cp-border)",
                                                    background: isExpanded ? "var(--cp-green-soft)" : undefined,
                                                }}
                                                onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = "var(--cp-sunken)"; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = isExpanded ? "var(--cp-green-soft)" : ""; }}
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5 max-w-xs">
                                                        <div className="h-8 w-8 rounded-[8px] flex items-center justify-center shrink-0"
                                                            style={{ background: "var(--cp-green-soft)", color: "var(--cp-green)", border: "1px solid var(--cp-border)" }}>
                                                            <Building2 className="w-4 h-4" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-semibold truncate" style={{ color: "var(--cp-ink)" }}>{company.name}</p>
                                                            {company.size && (
                                                                <p className="text-[11px] truncate" style={{ color: "var(--cp-ink-3)" }}>{company.size}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-[13px]" style={{ color: "var(--cp-ink-2)" }}>
                                                    {company.industry || <span style={{ color: "var(--cp-ink-3)", opacity: 0.5 }}>—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-[13px]" style={{ color: "var(--cp-ink-2)" }}>
                                                    {company.country ? (
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <MapPin className="w-3 h-3" style={{ color: "var(--cp-ink-3)" }} />
                                                            {company.country}
                                                        </span>
                                                    ) : <span style={{ color: "var(--cp-ink-3)", opacity: 0.5 }}>—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-[13px]">
                                                    {company.phone ? (
                                                        <a href={`tel:${company.phone}`}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="inline-flex items-center gap-1.5 tabular-nums hover:underline"
                                                            style={{ color: "var(--cp-ink-2)" }}>
                                                            <Phone className="w-3 h-3" style={{ color: "var(--cp-green)" }} />
                                                            {company.phone}
                                                        </a>
                                                    ) : <span style={{ color: "var(--cp-ink-3)", opacity: 0.5 }}>—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-[13px]">
                                                    {company.website ? (
                                                        <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                                                            target="_blank" rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="inline-flex items-center gap-1.5 hover:underline"
                                                            style={{ color: "var(--cp-green)" }}>
                                                            <Globe2 className="w-3 h-3" />
                                                            <span className="truncate max-w-[160px]">{cleanWebsite(company.website)}</span>
                                                        </a>
                                                    ) : <span style={{ color: "var(--cp-ink-3)", opacity: 0.5 }}>—</span>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {canExpand ? (
                                                        <span className="cpds-chip"
                                                            style={{
                                                                background: isExpanded ? "var(--cp-green)" : "var(--cp-green-soft)",
                                                                color: isExpanded ? "var(--cp-on-inverse)" : "var(--cp-green)",
                                                            }}>
                                                            <Users className="w-3 h-3" />
                                                            {company.contacts.length}
                                                            <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", isExpanded && "rotate-180")} />
                                                        </span>
                                                    ) : (
                                                        <span className="cpds-chip" style={{ background: "var(--cp-neutral-soft)", color: "var(--cp-ink-3)" }}>
                                                            0
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr style={{ borderBottom: "1px solid var(--cp-border)" }}>
                                                    <td colSpan={6} className="px-4 pb-4 pt-1" style={{ background: "var(--cp-green-soft)" }}>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                                            {company.contacts.map((ct) => <ContactRow key={ct.id} ct={ct} />)}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3"
                            style={{ borderTop: "1px solid var(--cp-border)", background: "var(--cp-sunken)" }}>
                            <span className="text-[12px] tabular-nums" style={{ color: "var(--cp-ink-3)" }}>
                                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredCompanies.length)} sur {filteredCompanies.length}
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={safePage <= 1}
                                    className="w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-70"
                                    style={{ background: "var(--cp-raised)", border: "1px solid var(--cp-border)", color: "var(--cp-ink-2)" }}
                                    aria-label="Page précédente"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="text-[12px] font-semibold px-2 tabular-nums" style={{ color: "var(--cp-ink-2)" }}>
                                    {safePage} / {totalPages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={safePage >= totalPages}
                                    className="w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-70"
                                    style={{ background: "var(--cp-raised)", border: "1px solid var(--cp-border)", color: "var(--cp-ink-2)" }}
                                    aria-label="Page suivante"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 cpds-enter" style={{ animationDelay: "100ms" }}>
                    {filteredCompanies.map((company) => (
                        <div key={company.id} className="cpds-card p-4 flex flex-col gap-3">
                            <div className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded-[10px] flex items-center justify-center shrink-0"
                                    style={{ background: "var(--cp-green-soft)", color: "var(--cp-green)" }}>
                                    <Building2 className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold truncate" style={{ color: "var(--cp-ink)" }}>{company.name}</p>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" style={{ color: "var(--cp-ink-3)" }}>
                                        {company.industry && <span>{company.industry}</span>}
                                        {company.size && <span>· {company.size}</span>}
                                        {company.country && (
                                            <span className="inline-flex items-center gap-1">
                                                · <MapPin className="w-3 h-3" />{company.country}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <span className="cpds-chip shrink-0" style={{ background: "var(--cp-green-soft)", color: "var(--cp-green)" }}>
                                    <Users className="w-3 h-3" />
                                    {company.contacts.length}
                                </span>
                            </div>

                            {(company.phone || company.website) && (
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--cp-ink-2)" }}>
                                    {company.phone && (
                                        <a href={`tel:${company.phone}`} className="inline-flex items-center gap-1.5 tabular-nums hover:underline">
                                            <Phone className="w-3 h-3" style={{ color: "var(--cp-green)" }} />
                                            {company.phone}
                                        </a>
                                    )}
                                    {company.website && (
                                        <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 hover:underline"
                                            style={{ color: "var(--cp-green)" }}>
                                            <Globe2 className="w-3 h-3" />
                                            {cleanWebsite(company.website)}
                                        </a>
                                    )}
                                </div>
                            )}

                            {company.contacts.length > 0 && (
                                <div className="space-y-2 max-h-52 overflow-auto pr-1 rounded-[10px] p-2"
                                    style={{ background: "var(--cp-sunken)" }}>
                                    {company.contacts.map((ct) => <ContactRow key={ct.id} ct={ct} />)}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
