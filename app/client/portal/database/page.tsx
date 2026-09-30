"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui";
import {
    Building2, Search, Users, Globe2, Phone, Mail, X,
    ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Download,
    ArrowUpDown, ArrowUp, ArrowDown, MapPin, CheckCircle2,
    CalendarCheck, CalendarClock, Ban, History, Link2, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
    PortalCompany,
    PortalCompanyTimelineResponse,
    PortalContact,
    PortalDatabaseResponse,
    PortalExclusion,
    PortalTimelineEntry,
    PortalTreatment,
} from "@/lib/prospection-export/portal-types";

type SortKey = "name" | "industry" | "country" | "status" | "lastActionAt" | "contacts";
type SortDir = "asc" | "desc";
/** "all" | "treated" | "untreated" | "meeting" | `s:<status label>` */
type StatusFilter = string;

const PAGE_SIZE = 50;

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
});

function formatDate(iso: string | null): string {
    return iso ? dateFmt.format(new Date(iso)) : "";
}

function formatDateTime(iso: string | null): string {
    return iso ? dateTimeFmt.format(new Date(iso)) : "";
}

function contactName(ct: { firstName: string | null; lastName: string | null }): string {
    return [ct.firstName, ct.lastName].filter(Boolean).join(" ") || "Contact";
}

function cleanWebsite(url: string): string {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function websiteHref(url: string): string {
    return url.startsWith("http") ? url : `https://${url}`;
}

/* ── Status tones ── */
type Tone = "neutral" | "success" | "warn" | "info" | "danger";
const TONES: Record<Tone, { bg: string; fg: string }> = {
    neutral: { bg: "var(--cp-neutral-soft)", fg: "var(--cp-ink-3)" },
    success: { bg: "var(--cp-success-soft)", fg: "var(--cp-success)" },
    warn: { bg: "var(--cp-warn-soft)", fg: "var(--cp-warn)" },
    info: { bg: "var(--cp-info-soft)", fg: "var(--cp-info)" },
    danger: { bg: "var(--cp-danger-soft)", fg: "var(--cp-danger)" },
};

function toneOf(t: PortalTreatment, excluded: boolean): Tone {
    if (excluded) return "danger";
    if (!t.treated) return "neutral";
    if (t.meetingBooked) return "success";
    if (t.nextCallbackAt) return "warn";
    return "info";
}

function StatusBadge({ t, excluded = false }: { t: PortalTreatment; excluded?: boolean }) {
    const tone = TONES[toneOf(t, excluded)];
    return (
        <span className="cpds-chip max-w-[220px]" style={{ background: tone.bg, color: tone.fg }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "currentColor" }} />
            <span className="truncate">{excluded ? "Exclu" : t.lastResultLabel}</span>
        </span>
    );
}

/* ── CSV export (Excel FR: séparateur ; + BOM) — one line per contact, like the client's file ── */
function exportCsv(companies: PortalCompany[]) {
    const header = [
        "Entreprise", "Secteur", "Taille", "Pays", "Téléphone entreprise", "Site web", "Mission", "Liste",
        "Contact", "Fonction", "Email", "Téléphone contact",
        "Traité", "Statut", "Tentatives", "Appels", "Dernier contact", "Prochain rappel", "RDV prévu", "Exclu",
    ];
    const line = (c: PortalCompany, ct: PortalContact | null, t: PortalTreatment) => [
        c.name, c.industry ?? "", c.size ?? "", c.country ?? "", c.phone ?? "", c.website ?? "", c.missionName, c.listName,
        ct ? contactName(ct) : "", ct?.title ?? "", ct?.email ?? "", ct?.phone ?? "",
        t.treated ? "Oui" : "Non", t.lastResultLabel, String(t.actionCount), String(t.callCount),
        formatDateTime(t.lastActionAt), formatDateTime(t.nextCallbackAt), formatDateTime(t.meetingAt),
        c.excludedAt || ct?.excludedAt ? "Oui" : "",
    ];
    const rows: string[][] = [];
    for (const c of companies) {
        if (c.contacts.length === 0) rows.push(line(c, null, c.treatment));
        else for (const ct of c.contacts) rows.push(line(c, ct, ct.treatment));
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

/* ═══════════════════════════════════════════════════════════════
   DRAWER — one instance, its content follows the selected row
═══════════════════════════════════════════════════════════════ */

const CHANNEL_META: Record<PortalTimelineEntry["channel"], { label: string; icon: typeof Phone }> = {
    CALL: { label: "Appel", icon: Phone },
    EMAIL: { label: "Email", icon: Mail },
    LINKEDIN: { label: "LinkedIn", icon: Link2 },
};

type TimelineState = { status: "loading" } | { status: "error" } | { status: "ready"; data: PortalCompanyTimelineResponse };
type LoadedTimeline = PortalCompanyTimelineResponse | "error";

function SectionTitle({ icon: Icon, children }: { icon?: typeof Building2; children: ReactNode }) {
    return (
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--cp-ink-3)" }}>
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {children}
        </h3>
    );
}

function MiniStat({ label, value, tone }: { label: string; value: ReactNode; tone?: Tone }) {
    return (
        <div className="rounded-[10px] px-3 py-2.5" style={{ background: "var(--cp-sunken)" }}>
            <p className="text-[11px] font-medium" style={{ color: "var(--cp-ink-3)" }}>{label}</p>
            <p className="text-[14px] font-semibold mt-0.5 tabular-nums truncate" style={{ color: tone ? TONES[tone].fg : "var(--cp-ink)" }}>
                {value || <span style={{ color: "var(--cp-ink-3)", opacity: 0.5 }}>—</span>}
            </p>
        </div>
    );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-1.5 text-[13px]" style={{ borderBottom: "1px solid var(--cp-border)" }}>
            <span className="shrink-0" style={{ color: "var(--cp-ink-3)" }}>{label}</span>
            <span className="min-w-0 truncate text-right" style={{ color: "var(--cp-ink)" }}>
                {children || <span style={{ color: "var(--cp-ink-3)", opacity: 0.5 }}>—</span>}
            </span>
        </div>
    );
}

function CompanyDrawer({ company, exclusion, position, total, onPrev, onNext, onClose, loaded, onLoaded }: {
    company: PortalCompany;
    exclusion: PortalExclusion | undefined;
    position: number;
    total: number;
    onPrev: () => void;
    onNext: () => void;
    onClose: () => void;
    /** Cached history for this company; undefined = not fetched yet. */
    loaded: LoadedTimeline | undefined;
    onLoaded: (companyId: string, result: LoadedTimeline) => void;
}) {
    const isCached = loaded !== undefined;
    useEffect(() => {
        if (isCached) return;
        const ctrl = new AbortController();
        fetch(`/api/client/database/${encodeURIComponent(company.id)}`, { signal: ctrl.signal })
            .then((res) => res.json())
            .then((json) => {
                if (!json.success) throw new Error(json.error);
                onLoaded(company.id, json.data);
            })
            .catch((err) => {
                if ((err as Error)?.name !== "AbortError") onLoaded(company.id, "error");
            });
        return () => ctrl.abort();
    }, [company.id, isCached, onLoaded]);

    const timeline: TimelineState = loaded === undefined
        ? { status: "loading" }
        : loaded === "error" ? { status: "error" } : { status: "ready", data: loaded };

    const t = company.treatment;
    const excluded = Boolean(company.excludedAt);
    const contacts = useMemo(
        () => [...company.contacts].sort((a, b) => (b.treatment.lastActionAt ?? "").localeCompare(a.treatment.lastActionAt ?? "")),
        [company.contacts]
    );
    const nextStep = t.meetingAt
        ? { label: `RDV le ${formatDate(t.meetingAt)}`, tone: "success" as Tone }
        : t.meetingBooked
            ? { label: "RDV obtenu", tone: "success" as Tone }
            : t.nextCallbackAt
                ? { label: `Rappel le ${formatDate(t.nextCallbackAt)}`, tone: "warn" as Tone }
                : null;
    const subtitle = [company.industry, company.size, company.country].filter(Boolean).join(" · ");

    return (
        <aside
            role="dialog"
            aria-label={company.name}
            className="fixed inset-y-0 right-0 z-[70] w-full sm:w-[460px] flex flex-col shadow-2xl animate-slide-in-right"
            style={{ background: "var(--cp-raised)", borderLeft: "1px solid var(--cp-border)" }}
        >
            {/* Header */}
            <div className="flex items-start gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--cp-border)" }}>
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
                    style={{ background: "var(--cp-green-soft)", color: "var(--cp-green)" }}>
                    <Building2 className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-[16px] font-semibold leading-tight truncate" style={{ color: "var(--cp-ink)" }}>{company.name}</h2>
                    {subtitle && <p className="text-[12px] mt-0.5 truncate" style={{ color: "var(--cp-ink-3)" }}>{subtitle}</p>}
                    <div className="mt-2"><StatusBadge t={t} excluded={excluded} /></div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <span className="hidden sm:inline text-[11px] tabular-nums mr-1" style={{ color: "var(--cp-ink-3)" }}>
                        {position > 0 ? `${position} / ${total}` : ""}
                    </span>
                    {([[onPrev, ChevronUp, "Entreprise précédente", position <= 1], [onNext, ChevronDown, "Entreprise suivante", position === 0 || position >= total]] as const).map(
                        ([handler, Icon, label, disabled]) => (
                            <button key={label} type="button" onClick={handler} disabled={disabled} aria-label={label} title={label}
                                className="w-8 h-8 rounded-[8px] flex items-center justify-center transition-opacity hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
                                style={{ background: "var(--cp-sunken)", color: "var(--cp-ink-2)" }}>
                                <Icon className="w-4 h-4" />
                            </button>
                        )
                    )}
                    <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer (Échap)"
                        className="w-8 h-8 rounded-[8px] flex items-center justify-center transition-opacity hover:opacity-70"
                        style={{ color: "var(--cp-ink-2)" }}>
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
                {excluded && (
                    <div className="flex items-start gap-2 rounded-[10px] px-3 py-2.5 text-[12px]"
                        style={{ background: "var(--cp-danger-soft)", color: "var(--cp-danger)" }}>
                        <Ban className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>
                            Ne plus contacter{exclusion?.reason ? ` — ${exclusion.reason}` : ""}
                            {exclusion?.expiresAt ? ` (jusqu'au ${formatDate(exclusion.expiresAt)})` : ""}
                        </span>
                    </div>
                )}

                <section>
                    <SectionTitle>Avancement</SectionTitle>
                    <div className="grid grid-cols-2 gap-2">
                        <MiniStat label="Tentatives" value={t.actionCount} />
                        <MiniStat label="Appels" value={t.callCount} />
                        <MiniStat label="Dernier contact" value={formatDate(t.lastActionAt)} />
                        <MiniStat label="Prochaine étape" value={nextStep?.label} tone={nextStep?.tone} />
                    </div>
                </section>

                <section>
                    <SectionTitle>Informations</SectionTitle>
                    <InfoRow label="Téléphone">
                        {company.phone && <a href={`tel:${company.phone}`} className="tabular-nums hover:underline">{company.phone}</a>}
                    </InfoRow>
                    <InfoRow label="Site web">
                        {company.website && (
                            <a href={websiteHref(company.website)} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:underline" style={{ color: "var(--cp-green)" }}>
                                <Globe2 className="w-3 h-3" />{cleanWebsite(company.website)}
                            </a>
                        )}
                    </InfoRow>
                    <InfoRow label="Mission">{company.missionName}</InfoRow>
                    <InfoRow label="Liste">{company.listName}</InfoRow>
                </section>

                <section>
                    <SectionTitle icon={Users}>Contacts ({contacts.length})</SectionTitle>
                    {contacts.length === 0 ? (
                        <p className="text-[12px]" style={{ color: "var(--cp-ink-3)" }}>Aucun contact : l&apos;entreprise est travaillée via son standard.</p>
                    ) : (
                        <ul className="space-y-2">
                            {contacts.map((ct) => (
                                <li key={ct.id} className="rounded-[10px] px-3 py-2.5" style={{ background: "var(--cp-sunken)" }}>
                                    <div className="flex items-center gap-2 min-w-0">
                                        <User className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--cp-ink-3)" }} />
                                        <span className="text-[13px] font-semibold truncate" style={{ color: "var(--cp-ink)" }}>{contactName(ct)}</span>
                                        <span className="ml-auto shrink-0"><StatusBadge t={ct.treatment} excluded={Boolean(ct.excludedAt)} /></span>
                                    </div>
                                    {(ct.title || ct.treatment.lastActionAt) && (
                                        <p className="text-[11px] mt-1 truncate" style={{ color: "var(--cp-ink-3)", paddingLeft: 22 }}>
                                            {[
                                                ct.title,
                                                ct.treatment.lastActionAt
                                                    ? `${ct.treatment.actionCount} tentative${ct.treatment.actionCount > 1 ? "s" : ""} · dernier contact le ${formatDate(ct.treatment.lastActionAt)}`
                                                    : null,
                                            ].filter(Boolean).join(" · ")}
                                        </p>
                                    )}
                                    {(ct.email || ct.phone) && (
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[12px]" style={{ paddingLeft: 22 }}>
                                            {ct.email && (
                                                <a href={`mailto:${ct.email}`} className="inline-flex items-center gap-1.5 hover:underline min-w-0" style={{ color: "var(--cp-green)" }}>
                                                    <Mail className="w-3 h-3 shrink-0" /><span className="truncate">{ct.email}</span>
                                                </a>
                                            )}
                                            {ct.phone && (
                                                <a href={`tel:${ct.phone}`} className="inline-flex items-center gap-1.5 tabular-nums hover:underline" style={{ color: "var(--cp-ink-2)" }}>
                                                    <Phone className="w-3 h-3" />{ct.phone}
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section>
                    <SectionTitle icon={History}>Historique</SectionTitle>
                    {timeline.status === "loading" ? (
                        <div className="space-y-2">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="h-11 rounded-[10px] animate-pulse" style={{ background: "var(--cp-sunken)" }} />
                            ))}
                        </div>
                    ) : timeline.status === "error" ? (
                        <p className="text-[12px]" style={{ color: "var(--cp-danger)" }}>Impossible de charger l&apos;historique.</p>
                    ) : timeline.data.timeline.length === 0 ? (
                        <p className="text-[12px]" style={{ color: "var(--cp-ink-3)" }}>Pas encore d&apos;action sur cette entreprise.</p>
                    ) : (
                        <ol className="relative space-y-3 pl-1">
                            {timeline.data.timeline.map((e) => {
                                const meta = CHANNEL_META[e.channel];
                                const Icon = meta.icon;
                                return (
                                    <li key={e.id} className="flex gap-3">
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                                            style={{ background: "var(--cp-sunken)", color: "var(--cp-ink-2)" }}>
                                            <Icon className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-baseline justify-between gap-2">
                                                <span className="text-[13px] font-semibold truncate" style={{ color: "var(--cp-ink)" }}>{e.label}</span>
                                                <time dateTime={e.at} className="text-[11px] tabular-nums shrink-0" style={{ color: "var(--cp-ink-3)" }}>
                                                    {formatDateTime(e.at)}
                                                </time>
                                            </div>
                                            <p className="text-[12px] truncate" style={{ color: "var(--cp-ink-3)" }}>
                                                {meta.label}{e.contactName ? ` · ${e.contactName}` : ""}
                                            </p>
                                            {e.scheduledAt && (
                                                <p className="inline-flex items-center gap-1 text-[12px] mt-0.5"
                                                    style={{ color: e.kind === "meeting" ? "var(--cp-success)" : "var(--cp-warn)" }}>
                                                    {e.kind === "meeting" ? <CalendarCheck className="w-3 h-3" /> : <CalendarClock className="w-3 h-3" />}
                                                    {e.kind === "meeting" ? "RDV prévu le" : "Rappel prévu le"} {formatDateTime(e.scheduledAt)}
                                                </p>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                            {timeline.data.truncated && (
                                <li className="text-[11px] pl-10" style={{ color: "var(--cp-ink-3)" }}>Seules les 200 dernières actions sont affichées.</li>
                            )}
                        </ol>
                    )}
                </section>
            </div>

            <div className="hidden sm:block px-5 py-2.5 text-[11px]" style={{ borderTop: "1px solid var(--cp-border)", color: "var(--cp-ink-3)" }}>
                ↑ ↓ pour passer d&apos;une entreprise à l&apos;autre · Échap pour fermer
            </div>
        </aside>
    );
}

function SortHeader({ column, sortKey, sortDir, onSort, children, className }: {
    column: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (key: SortKey) => void; children: ReactNode; className?: string;
}) {
    const active = sortKey === column;
    return (
        <th scope="col" className={cn("px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider select-none", className)}
            aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
            <button type="button" onClick={() => onSort(column)}
                className="inline-flex items-center gap-1.5 uppercase tracking-wider hover:opacity-70 transition-opacity">
                {children}
                {!active
                    ? <ArrowUpDown className="w-3 h-3 opacity-40" />
                    : sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            </button>
        </th>
    );
}

/* ═══════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════ */
export default function ClientPortalDatabasePage() {
    const { error: showError } = useToast();
    const [data, setData] = useState<PortalDatabaseResponse>({ companies: [], exclusions: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const deferredSearch = useDeferredValue(search);
    const [industryFilter, setIndustryFilter] = useState("");
    const [countryFilter, setCountryFilter] = useState("");
    const [missionFilter, setMissionFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [sortKey, setSortKey] = useState<SortKey>("lastActionAt");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const [page, setPage] = useState(1);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [timelines, setTimelines] = useState<Record<string, LoadedTimeline>>({});
    const onTimelineLoaded = useCallback((companyId: string, result: LoadedTimeline) => {
        setTimelines((prev) => ({ ...prev, [companyId]: result }));
    }, []);

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

    /* Facets */
    const facets = useMemo(() => {
        const industries = new Set<string>();
        const countries = new Set<string>();
        const missions = new Set<string>();
        const statusCounts = new Map<string, number>();
        let treated = 0;
        let meetings = 0;
        let reachable = 0;
        let contacts = 0;
        for (const c of data.companies) {
            if (c.industry) industries.add(c.industry);
            if (c.country) countries.add(c.country);
            missions.add(c.missionName);
            contacts += c.contacts.length;
            if (c.phone || c.contacts.some((ct) => ct.email || ct.phone)) reachable++;
            if (c.treatment.treated) {
                treated++;
                statusCounts.set(c.treatment.lastResultLabel, (statusCounts.get(c.treatment.lastResultLabel) ?? 0) + 1);
            }
            if (c.treatment.meetingBooked) meetings++;
        }
        const byFr = (a: string, b: string) => a.localeCompare(b, "fr");
        return {
            industries: [...industries].sort(byFr),
            countries: [...countries].sort(byFr),
            missions: [...missions].sort(byFr),
            statuses: [...statusCounts.entries()].sort((a, b) => b[1] - a[1]),
            treated, meetings, reachable, contacts,
        };
    }, [data.companies]);
    const multiMission = facets.missions.length > 1;

    /* Search text computed once per load, not on every keystroke */
    const haystacks = useMemo(
        () => new Map(data.companies.map((c) => [
            c.id,
            [
                c.name, c.industry, c.country, c.size, c.missionName, c.listName, c.treatment.lastResultLabel,
                ...c.contacts.flatMap((ct) => [ct.firstName, ct.lastName, ct.title, ct.email, ct.phone]),
            ].filter(Boolean).join(" ").toLowerCase(),
        ])),
        [data.companies]
    );

    const exclusionById = useMemo(() => new Map(data.exclusions.map((e) => [e.id, e])), [data.exclusions]);

    /* Search + filters + sort */
    const filteredCompanies = useMemo(() => {
        const q = deferredSearch.trim().toLowerCase();
        const filtered = data.companies.filter((c) => {
            if (industryFilter && c.industry !== industryFilter) return false;
            if (countryFilter && c.country !== countryFilter) return false;
            if (missionFilter && c.missionName !== missionFilter) return false;
            if (statusFilter === "treated" && !c.treatment.treated) return false;
            if (statusFilter === "untreated" && c.treatment.treated) return false;
            if (statusFilter === "meeting" && !c.treatment.meetingBooked) return false;
            if (statusFilter.startsWith("s:") && (!c.treatment.treated || c.treatment.lastResultLabel !== statusFilter.slice(2))) return false;
            return !q || (haystacks.get(c.id) ?? "").includes(q);
        });
        const dir = sortDir === "asc" ? 1 : -1;
        return filtered.sort((a, b) => {
            if (sortKey === "contacts") return (a.contacts.length - b.contacts.length) * dir;
            if (sortKey === "lastActionAt") return (a.treatment.lastActionAt ?? "").localeCompare(b.treatment.lastActionAt ?? "") * dir;
            if (sortKey === "status") return a.treatment.lastResultLabel.localeCompare(b.treatment.lastResultLabel, "fr") * dir;
            return (a[sortKey] ?? "").localeCompare(b[sortKey] ?? "", "fr", { sensitivity: "base" }) * dir;
        });
    }, [data.companies, haystacks, deferredSearch, industryFilter, countryFilter, missionFilter, statusFilter, sortKey, sortDir]);

    /* Pagination */
    const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pagedCompanies = filteredCompanies.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    useEffect(() => { setPage(1); }, [deferredSearch, industryFilter, countryFilter, missionFilter, statusFilter, sortKey, sortDir]);

    /* Drawer selection */
    const selectedCompany = selectedId ? data.companies.find((c) => c.id === selectedId) ?? null : null;
    const selectedIndex = selectedId ? filteredCompanies.findIndex((c) => c.id === selectedId) : -1;

    const step = useCallback((delta: number) => {
        const target = selectedIndex + delta;
        if (selectedIndex < 0 || target < 0 || target >= filteredCompanies.length) return;
        setSelectedId(filteredCompanies[target].id);
        setPage(Math.floor(target / PAGE_SIZE) + 1);
    }, [selectedIndex, filteredCompanies]);

    useEffect(() => {
        if (!selectedId) return;
        const onKey = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null;
            if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
            if (e.key === "Escape") setSelectedId(null);
            else if (e.key === "ArrowDown") { e.preventDefault(); step(1); }
            else if (e.key === "ArrowUp") { e.preventDefault(); step(-1); }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [selectedId, step]);

    useEffect(() => {
        if (!selectedId) return;
        document.querySelector(`[data-row-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest" });
    }, [selectedId, safePage]);

    const hasActiveFilters = !!(search.trim() || industryFilter || countryFilter || missionFilter || statusFilter !== "all");
    const resetFilters = () => {
        setSearch(""); setIndustryFilter(""); setCountryFilter(""); setMissionFilter(""); setStatusFilter("all");
    };

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir(key === "contacts" || key === "lastActionAt" ? "desc" : "asc");
        }
    };

    const total = data.companies.length;
    const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "—");
    const selectClass = "h-9 px-3 pr-8 rounded-[10px] text-[12px] font-medium focus:outline-none cursor-pointer";
    const selectStyle = (active: boolean) => ({
        background: "var(--cp-raised)", border: "1px solid var(--cp-border)", color: active ? "var(--cp-ink)" : "var(--cp-ink-3)",
    });

    const sortProps = { sortKey, sortDir, onSort: handleSort };
    const dash = <span style={{ color: "var(--cp-ink-3)", opacity: 0.5 }}>—</span>;

    return (
        <div className={cn("cpds-page min-h-full p-4 md:p-6 space-y-5 transition-[padding] duration-200", selectedCompany && "lg:pr-[484px]")}>
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
                            Vos entreprises et contacts, avec l&apos;avancement de nos actions sur chacun
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => exportCsv(filteredCompanies)}
                    disabled={isLoading || filteredCompanies.length === 0}
                    className="self-start md:self-auto inline-flex items-center gap-2 h-9 px-3.5 rounded-[10px] text-[12px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98]"
                    style={{ background: "var(--cp-green)", color: "var(--cp-on-inverse)" }}
                    title="Exporter la vue filtrée en CSV (une ligne par contact)"
                >
                    <Download className="w-3.5 h-3.5" />
                    Exporter{!isLoading && filteredCompanies.length > 0 ? ` (${filteredCompanies.length})` : ""}
                </button>
            </div>

            {/* ── KPI strip ── */}
            {!isLoading && total > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 cpds-enter" style={{ animationDelay: "40ms" }}>
                    <StatCard icon={Building2} label="Entreprises" value={total} hint={`${facets.contacts} contacts`} />
                    <StatCard icon={CheckCircle2} label="Traitées" value={pct(facets.treated)} hint={`${facets.treated}/${total}`} />
                    <StatCard icon={CalendarCheck} label="RDV obtenus" value={facets.meetings} />
                    <StatCard icon={Phone} label="Joignables" value={pct(facets.reachable)} hint="tél. ou email" />
                </div>
            )}

            {/* ── Toolbar ── */}
            <div className="flex flex-wrap items-center gap-2 cpds-enter" style={{ animationDelay: "70ms" }}>
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--cp-ink-3)" }} />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Rechercher (entreprise, contact, statut...)"
                        className="w-full h-9 pl-9 pr-8 rounded-[10px] text-[13px] focus:outline-none transition-shadow focus:shadow-[var(--cp-focus-ring)]"
                        style={{ background: "var(--cp-raised)", border: "1px solid var(--cp-border)", color: "var(--cp-ink)" }}
                    />
                    {search && (
                        <button type="button" onClick={() => setSearch("")} aria-label="Effacer la recherche"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 hover:opacity-70" style={{ color: "var(--cp-ink-3)" }}>
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                    className={selectClass} style={selectStyle(statusFilter !== "all")} aria-label="Filtrer par statut">
                    <option value="all">Tous les statuts</option>
                    <option value="treated">Traitées ({facets.treated})</option>
                    <option value="untreated">Non traitées ({total - facets.treated})</option>
                    <option value="meeting">RDV obtenus ({facets.meetings})</option>
                    {facets.statuses.length > 0 && (
                        <optgroup label="Par statut">
                            {facets.statuses.map(([label, n]) => <option key={label} value={`s:${label}`}>{label} ({n})</option>)}
                        </optgroup>
                    )}
                </select>

                {multiMission && (
                    <select value={missionFilter} onChange={(e) => setMissionFilter(e.target.value)}
                        className={selectClass} style={selectStyle(!!missionFilter)} aria-label="Filtrer par mission">
                        <option value="">Toutes les missions</option>
                        {facets.missions.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                )}

                <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)}
                    className={selectClass} style={selectStyle(!!industryFilter)} aria-label="Filtrer par secteur">
                    <option value="">Tous les secteurs</option>
                    {facets.industries.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>

                <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}
                    className={selectClass} style={selectStyle(!!countryFilter)} aria-label="Filtrer par pays">
                    <option value="">Tous les pays</option>
                    {facets.countries.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>

                {hasActiveFilters && (
                    <button type="button" onClick={resetFilters}
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[12px] font-semibold transition-colors hover:opacity-80"
                        style={{ color: "var(--cp-danger)", background: "var(--cp-danger-soft)" }}>
                        <X className="w-3 h-3" />
                        Réinitialiser
                    </button>
                )}

                <span className="ml-auto text-[12px] font-medium tabular-nums" style={{ color: "var(--cp-ink-3)" }}>
                    {filteredCompanies.length} entreprise{filteredCompanies.length > 1 ? "s" : ""}
                    {hasActiveFilters && ` sur ${total}`}
                </span>
            </div>

            {/* ── Table ── */}
            {!isLoading && filteredCompanies.length === 0 ? (
                <div className="cpds-enter rounded-[16px] py-16 px-6 text-center"
                    style={{ background: "var(--cp-raised)", border: "2px dashed var(--cp-border-strong)" }}>
                    <div className="mx-auto mb-4 w-14 h-14 rounded-[14px] flex items-center justify-center" style={{ background: "var(--cp-sunken)" }}>
                        <Building2 className="w-6 h-6" style={{ color: "var(--cp-ink-3)" }} />
                    </div>
                    <p className="text-sm font-semibold" style={{ color: "var(--cp-ink)" }}>
                        {hasActiveFilters ? "Aucune entreprise ne correspond aux filtres" : "Aucune entreprise pour le moment"}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--cp-ink-3)" }}>
                        {hasActiveFilters ? "Ajustez la recherche ou réinitialisez les filtres." : "Les entreprises travaillées par l'équipe apparaîtront ici."}
                    </p>
                </div>
            ) : (
                <div className="cpds-card cpds-enter overflow-hidden" style={{ animationDelay: "100ms" }}>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead style={{ background: "var(--cp-sunken)", borderBottom: "1px solid var(--cp-border)" }}>
                                <tr style={{ color: "var(--cp-ink-3)" }}>
                                    <SortHeader column="name" {...sortProps}>Entreprise</SortHeader>
                                    <SortHeader column="status" {...sortProps}>Statut</SortHeader>
                                    <SortHeader column="lastActionAt" {...sortProps}>Dernier contact</SortHeader>
                                    <SortHeader column="industry" className="hidden md:table-cell" {...sortProps}>Secteur</SortHeader>
                                    <SortHeader column="country" className="hidden lg:table-cell" {...sortProps}>Pays</SortHeader>
                                    <SortHeader column="contacts" className="text-right" {...sortProps}>Contacts</SortHeader>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading
                                    ? Array.from({ length: 8 }, (_, i) => (
                                        <tr key={i} style={{ borderBottom: "1px solid var(--cp-border)" }}>
                                            <td colSpan={6} className="px-4 py-3">
                                                <div className="h-5 rounded-[6px] animate-pulse" style={{ background: "var(--cp-sunken)", width: `${60 + ((i * 17) % 35)}%` }} />
                                            </td>
                                        </tr>
                                    ))
                                    : pagedCompanies.map((company) => {
                                        const selected = company.id === selectedId;
                                        const excluded = Boolean(company.excludedAt);
                                        const sub = [company.size, multiMission ? company.missionName : null].filter(Boolean).join(" · ");
                                        return (
                                            <tr
                                                key={company.id}
                                                data-row-id={company.id}
                                                tabIndex={0}
                                                aria-selected={selected}
                                                onClick={() => setSelectedId(company.id)}
                                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(company.id); } }}
                                                className="cursor-pointer transition-colors outline-none hover:bg-[var(--cp-sunken)] focus-visible:bg-[var(--cp-sunken)]"
                                                style={{
                                                    borderBottom: "1px solid var(--cp-border)",
                                                    background: selected ? "var(--cp-green-soft)" : undefined,
                                                    boxShadow: selected ? "inset 3px 0 0 var(--cp-green)" : undefined,
                                                }}
                                            >
                                                <td className="px-4 py-2.5 max-w-[280px]">
                                                    <p className={cn("font-semibold truncate", excluded && "line-through opacity-60")} style={{ color: "var(--cp-ink)" }}>
                                                        {company.name}
                                                    </p>
                                                    {sub && <p className="text-[11px] truncate" style={{ color: "var(--cp-ink-3)" }}>{sub}</p>}
                                                </td>
                                                <td className="px-4 py-2.5"><StatusBadge t={company.treatment} excluded={excluded} /></td>
                                                <td className="px-4 py-2.5 text-[13px] tabular-nums whitespace-nowrap" style={{ color: "var(--cp-ink-2)" }}>
                                                    {company.treatment.lastActionAt ? formatDate(company.treatment.lastActionAt) : dash}
                                                </td>
                                                <td className="hidden md:table-cell px-4 py-2.5 text-[13px] max-w-[200px] truncate" style={{ color: "var(--cp-ink-2)" }}>
                                                    {company.industry || dash}
                                                </td>
                                                <td className="hidden lg:table-cell px-4 py-2.5 text-[13px] whitespace-nowrap" style={{ color: "var(--cp-ink-2)" }}>
                                                    {company.country ? (
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <MapPin className="w-3 h-3" style={{ color: "var(--cp-ink-3)" }} />{company.country}
                                                        </span>
                                                    ) : dash}
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-[13px] font-semibold tabular-nums" style={{ color: "var(--cp-ink-2)" }}>
                                                    {company.contacts.length}
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>

                    {!isLoading && totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3"
                            style={{ borderTop: "1px solid var(--cp-border)", background: "var(--cp-sunken)" }}>
                            <span className="text-[12px] tabular-nums" style={{ color: "var(--cp-ink-3)" }}>
                                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredCompanies.length)} sur {filteredCompanies.length}
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Page précédente"
                                    className="w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-70"
                                    style={{ background: "var(--cp-raised)", border: "1px solid var(--cp-border)", color: "var(--cp-ink-2)" }}>
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="text-[12px] font-semibold px-2 tabular-nums" style={{ color: "var(--cp-ink-2)" }}>
                                    {safePage} / {totalPages}
                                </span>
                                <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} aria-label="Page suivante"
                                    className="w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-70"
                                    style={{ background: "var(--cp-raised)", border: "1px solid var(--cp-border)", color: "var(--cp-ink-2)" }}>
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {selectedCompany && (
                <CompanyDrawer
                    company={selectedCompany}
                    exclusion={selectedCompany.exclusionId ? exclusionById.get(selectedCompany.exclusionId) : undefined}
                    position={selectedIndex + 1}
                    total={filteredCompanies.length}
                    onPrev={() => step(-1)}
                    onNext={() => step(1)}
                    onClose={() => setSelectedId(null)}
                    loaded={timelines[selectedCompany.id]}
                    onLoaded={onTimelineLoaded}
                />
            )}
        </div>
    );
}
