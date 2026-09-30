"use client";

import {
    useCallback, useDeferredValue, useEffect, useMemo, useRef, useState,
    type CSSProperties, type ReactNode, type UIEvent,
} from "react";
import { useToast } from "@/components/ui";
import {
    Search, X, Download, ChevronUp, ChevronDown, Phone, Mail, Link2, Copy, Check,
    Ban, CalendarCheck, CalendarClock, RotateCw, Globe2,
} from "lucide-react";
import {
    PORTAL_STAGE_LABELS,
    PORTAL_STAGE_ORDER,
    STAGE_RANK,
    type PortalCompany,
    type PortalCompanyTimelineResponse,
    type PortalContact,
    type PortalDatabaseResponse,
    type PortalExclusion,
    type PortalStage,
    type PortalTreatment,
} from "@/lib/prospection-export/portal-types";
import s from "./database.module.css";

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS & HELPERS
═══════════════════════════════════════════════════════════════ */

const ROW_H = 64;
const OVERSCAN = 8;
const TRACE_SLOTS = 6;
const ZONE = "Europe/Paris";

const STAGE_COLOR: Record<PortalStage, string> = {
    meeting: "#1f9d55",
    opportunity: "#0f8f86",
    callback: "#d4870a",
    in_progress: "#3b6fe0",
    closed: "#a39e98",
    untreated: "#cfd2cc",
};

const TRACK: PortalStage[] = ["untreated", "in_progress", "callback", "opportunity", "meeting"];
const TRACK_LABELS = ["À traiter", "En cours", "À rappeler", "Intérêt", "RDV"];

type SortKey = "recent" | "stage" | "name" | "effort";
const SORT_LABELS: Record<SortKey, string> = {
    recent: "Plus récents",
    stage: "Meilleur statut",
    effort: "Plus de tentatives",
    name: "A → Z",
};

type LoadedTimeline = PortalCompanyTimelineResponse | "error";

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");
const cssVar = (color: string) => ({ "--c": color }) as CSSProperties;

const dayMonth = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: ZONE });
const fullDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONE });
const dateTime = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: ZONE,
});
const timeOnly = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: ZONE });
const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

function relative(iso: string, nowMs: number): string {
    const diff = new Date(iso).getTime() - nowMs;
    const abs = Math.abs(diff);
    const minute = 60_000, hour = 60 * minute, day = 24 * hour;
    if (abs < hour) return rtf.format(Math.round(diff / minute), "minute");
    if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
    if (abs < 30 * day) return rtf.format(Math.round(diff / day), "day");
    if (abs < 365 * day) return rtf.format(Math.round(diff / (30 * day)), "month");
    return rtf.format(Math.round(diff / (365 * day)), "year");
}

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function highlight(text: string, query: string): ReactNode {
    if (!query) return text;
    const folded = fold(text);
    const i = folded.indexOf(query);
    // Accent folding can change the length of unusual strings; only highlight when it maps 1:1.
    if (i < 0 || folded.length !== text.length) return text;
    return (
        <>
            {text.slice(0, i)}
            <mark className={s.hl}>{text.slice(i, i + query.length)}</mark>
            {text.slice(i + query.length)}
        </>
    );
}

function contactName(ct: { firstName: string | null; lastName: string | null }): string {
    return [ct.firstName, ct.lastName].filter(Boolean).join(" ") || "Contact";
}

function initials(ct: { firstName: string | null; lastName: string | null }): string {
    return ([ct.firstName?.[0], ct.lastName?.[0]].filter(Boolean).join("") || "?").toUpperCase();
}

function cleanWebsite(url: string): string {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function nextStepShort(t: PortalTreatment): string | null {
    if (t.meetingAt) return `RDV · ${dayMonth.format(new Date(t.meetingAt))}`;
    if (t.nextCallbackAt) return `Rappel · ${dayMonth.format(new Date(t.nextCallbackAt))}`;
    return null;
}

function statusLabel(company: PortalCompany): string {
    return company.excludedAt ? "Exclu" : company.treatment.lastResultLabel;
}

/* ── CSV export (Excel FR: séparateur ; + BOM) — one line per contact, like the client's file ── */
function exportCsv(companies: PortalCompany[]) {
    const header = [
        "Entreprise", "Secteur", "Taille", "Pays", "Téléphone entreprise", "Site web", "Mission", "Liste",
        "Contact", "Fonction", "Email", "Téléphone contact",
        "Étape", "Statut", "Tentatives", "Appels", "Dernier contact", "Prochain rappel", "RDV prévu", "Exclu",
    ];
    const fmt = (iso: string | null) => (iso ? `${fullDate.format(new Date(iso))} ${timeOnly.format(new Date(iso))}` : "");
    const line = (c: PortalCompany, ct: PortalContact | null, t: PortalTreatment) => [
        c.name, c.industry ?? "", c.size ?? "", c.country ?? "", c.phone ?? "", c.website ?? "", c.missionName, c.listName,
        ct ? contactName(ct) : "", ct?.title ?? "", ct?.email ?? "", ct?.phone ?? "",
        PORTAL_STAGE_LABELS[t.stage], t.lastResultLabel, String(t.actionCount), String(t.callCount),
        fmt(t.lastActionAt), fmt(t.nextCallbackAt), fmt(t.meetingAt),
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

/* ── Animated count-up for the hero figure ── */
function useCountUp(target: number, duration = 900): number {
    const [value, setValue] = useState(0);
    useEffect(() => {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const start = performance.now();
        let raf = requestAnimationFrame(function tick(now) {
            const p = reduced ? 1 : Math.min(1, (now - start) / duration);
            setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
            if (p < 1) raf = requestAnimationFrame(tick);
        });
        return () => cancelAnimationFrame(raf);
    }, [target, duration]);
    return value;
}

/* ═══════════════════════════════════════════════════════════════
   HERO — how far the database has been worked, and how fast
═══════════════════════════════════════════════════════════════ */

function ProgressPanel({ stageCounts, total, activeStage, onStage, grown }: {
    stageCounts: Record<PortalStage, number>;
    total: number;
    activeStage: PortalStage | null;
    onStage: (stage: PortalStage | null) => void;
    grown: boolean;
}) {
    const treated = total - stageCounts.untreated;
    const pct = total > 0 ? Math.round((treated / total) * 100) : 0;
    const shown = useCountUp(pct);

    return (
        <section className={s.panel} aria-label="Avancement de la base">
            <div className={s.panelHead}>
                <div>
                    <div className={cx(s.bigNumber, s.num)}>{shown}<span className={s.bigUnit}>%</span></div>
                    <div className={s.bigLabel}>de votre base déjà travaillée</div>
                </div>
                <div className={s.bigSide}>
                    <div><strong className={s.num}>{treated.toLocaleString("fr-FR")}</strong> entreprises traitées</div>
                    <div><strong className={s.num}>{stageCounts.untreated.toLocaleString("fr-FR")}</strong> restent à traiter</div>
                </div>
            </div>

            <div className={s.stageBar} data-dim={activeStage ? "true" : "false"} role="group" aria-label="Répartition par étape">
                {PORTAL_STAGE_ORDER.map((stage) => stageCounts[stage] > 0 && (
                    <button
                        key={stage}
                        type="button"
                        className={s.stageSeg}
                        data-active={activeStage === stage}
                        style={{ ...cssVar(STAGE_COLOR[stage]), width: grown ? `${(stageCounts[stage] / total) * 100}%` : "0%" }}
                        title={`${PORTAL_STAGE_LABELS[stage]} : ${stageCounts[stage]}`}
                        aria-label={`Filtrer : ${PORTAL_STAGE_LABELS[stage]}`}
                        onClick={() => onStage(activeStage === stage ? null : stage)}
                    />
                ))}
            </div>
        </section>
    );
}

function ActivityPanel({ activity, grown }: { activity: PortalDatabaseResponse["activity"]; grown: boolean }) {
    const max = Math.max(1, ...activity.map((w) => w.actions));
    const current = activity[activity.length - 1];
    const last = activity[activity.length - 2];
    const before = activity[activity.length - 3];
    const meetings = activity.reduce((n, w) => n + w.meetings, 0);
    const delta = last && before && before.actions > 0 ? Math.round(((last.actions - before.actions) / before.actions) * 100) : null;

    return (
        <section className={s.panel} aria-label="Activité hebdomadaire">
            <div className={s.panelHead}>
                <span className={s.panelTitle}>Nos actions sur votre base</span>
                <span className={s.panelHint}>{activity.length} dernières semaines</span>
            </div>
            <div className={s.chartWrap}>
                <div className={s.chart}>
                    {activity.map((w, i) => {
                        const isCurrent = i === activity.length - 1;
                        const label = `Semaine du ${dayMonth.format(new Date(`${w.week}T12:00:00Z`))} : ${w.actions} action${w.actions > 1 ? "s" : ""}${w.meetings ? `, ${w.meetings} RDV` : ""}${isCurrent ? " (en cours)" : ""}`;
                        return (
                            <div key={w.week} className={s.chartCol} title={label} aria-label={label}>
                                {w.meetings > 0 && <span className={s.chartMeeting}>{w.meetings}</span>}
                                <div className={cx(s.chartBar, isCurrent && s.chartBarCurrent)}
                                    style={{ height: grown ? `${Math.max(3, (w.actions / max) * 100)}%` : "3px" }} />
                            </div>
                        );
                    })}
                </div>
                <div className={s.chartAxis}>
                    <span>{activity[0] ? dayMonth.format(new Date(`${activity[0].week}T12:00:00Z`)) : ""}</span>
                    <span>Cette semaine</span>
                </div>
            </div>
            <div className={s.activityStats}>
                <div className={s.miniKpi}>
                    <span className={cx(s.miniKpiValue, s.num)}>{current?.actions ?? 0}</span>
                    <span className={s.miniKpiLabel}>cette semaine (en cours)</span>
                </div>
                <div className={s.miniKpi}>
                    <span className={cx(s.miniKpiValue, s.num)}>
                        {last?.actions ?? 0}
                        {delta !== null && delta !== 0 && (
                            <span className={cx(s.delta, delta > 0 ? s.deltaUp : s.deltaDown)}>{delta > 0 ? "+" : ""}{delta}%</span>
                        )}
                    </span>
                    <span className={s.miniKpiLabel}>semaine dernière</span>
                </div>
                <div className={s.miniKpi}>
                    <span className={cx(s.miniKpiValue, s.num)} style={{ color: STAGE_COLOR.meeting }}>{meetings}</span>
                    <span className={s.miniKpiLabel}>RDV obtenus sur la période</span>
                </div>
            </div>
        </section>
    );
}

/* ═══════════════════════════════════════════════════════════════
   LIST ROW
═══════════════════════════════════════════════════════════════ */

function Trace({ count, calls }: { count: number; calls: number }) {
    return (
        <div className={s.trace} title={count ? `${count} tentative${count > 1 ? "s" : ""}, dont ${calls} appel${calls > 1 ? "s" : ""}` : "Aucune tentative"}>
            {Array.from({ length: TRACE_SLOTS }, (_, i) => (
                <span key={i} className={cx(s.traceDot, i < count && s.traceDotOn)} />
            ))}
            {count > TRACE_SLOTS && <span className={cx(s.traceMore, s.num)}>+{count - TRACE_SLOTS}</span>}
        </div>
    );
}

function Row({ company, index, query, active, open, multiMission, nowMs, onOpen, onHover, onLeave }: {
    company: PortalCompany;
    index: number;
    query: string;
    active: boolean;
    open: boolean;
    multiMission: boolean;
    nowMs: number;
    onOpen: (id: string) => void;
    onHover: (id: string) => void;
    onLeave: () => void;
}) {
    const t = company.treatment;
    const excluded = Boolean(company.excludedAt);
    const next = nextStepShort(t);
    const meta = [
        company.industry,
        company.country,
        `${company.contacts.length} contact${company.contacts.length > 1 ? "s" : ""}`,
        multiMission ? company.missionName : null,
    ].filter(Boolean).join(" · ");

    return (
        <div
            id={`db-row-${company.id}`}
            role="option"
            aria-selected={open}
            className={cx(s.row, active && s.rowActive, open && s.rowOpen)}
            style={{ ...cssVar(STAGE_COLOR[t.stage]), transform: `translateY(${index * ROW_H}px)` }}
            onClick={() => onOpen(company.id)}
            onMouseEnter={() => onHover(company.id)}
            onMouseLeave={onLeave}
        >
            <span className={s.dot} />
            <div className={s.rowMain}>
                <div className={cx(s.rowName, excluded && s.rowNameExcluded)}>{highlight(company.name, query)}</div>
                <div className={s.rowMeta}>{meta}</div>
            </div>
            <Trace count={t.actionCount} calls={t.callCount} />
            <span className={cx(s.pill, excluded && s.pillDanger)}>{statusLabel(company)}</span>
            <div className={s.rowWhen}>
                <div className={s.rowWhenMain} title={t.lastActionAt ? dateTime.format(new Date(t.lastActionAt)) : undefined}>
                    {t.lastActionAt ? relative(t.lastActionAt, nowMs) : <span className={s.muted}>Pas encore contactée</span>}
                </div>
                {next && <div className={s.rowWhenNext}>{next}</div>}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   INSPECTOR — one drawer, its content follows the active row
═══════════════════════════════════════════════════════════════ */

const CHANNEL_META = {
    CALL: { label: "Appel", icon: Phone },
    EMAIL: { label: "Email", icon: Mail },
    LINKEDIN: { label: "LinkedIn", icon: Link2 },
} as const;

function CopyChip({ value, href, icon: Icon }: { value: string; href: string; icon: typeof Phone }) {
    const [copied, setCopied] = useState(false);
    return (
        <span style={{ display: "inline-flex", gap: 4 }}>
            <a className={s.chipBtn} href={href} title={value}>
                <Icon size={13} />{value}
            </a>
            <button type="button" className={cx(s.chipBtn, copied && s.chipBtnDone)} aria-label={`Copier ${value}`} title="Copier"
                onClick={() => {
                    navigator.clipboard?.writeText(value).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1400);
                    });
                }}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
        </span>
    );
}

function StageTrack({ t }: { t: PortalTreatment }) {
    const reached = t.stage === "closed" ? 1 : TRACK.indexOf(t.stage);
    return (
        <>
            <div className={s.track}>
                <div className={s.trackLine}>
                    <div className={s.trackFill} style={{ width: `${(reached / (TRACK.length - 1)) * 100}%` }} />
                </div>
                {TRACK.map((stage, i) => (
                    <div key={stage} className={s.trackStep}>
                        <span className={cx(s.trackNode, i <= reached && s.trackNodeOn, i === reached && s.trackNodeCurrent)}>
                            {i < reached && <Check size={11} strokeWidth={3} />}
                        </span>
                        <span className={cx(s.trackLabel, i <= reached && s.trackLabelOn)}>{TRACK_LABELS[i]}</span>
                    </div>
                ))}
            </div>
            {t.stage === "closed" && (
                <div className={s.closedNote}><Ban size={13} /> Sans suite — {t.lastResultLabel}</div>
            )}
        </>
    );
}

function Inspector({ company, exclusion, commercialNames, timeline, position, total, nowMs, onPrev, onNext, onClose, ensureTimeline }: {
    company: PortalCompany;
    exclusion: PortalExclusion | undefined;
    commercialNames: string[];
    timeline: LoadedTimeline | undefined;
    position: number;
    total: number;
    nowMs: number;
    onPrev: () => void;
    onNext: () => void;
    onClose: () => void;
    ensureTimeline: (id: string) => void;
}) {
    // Short delay so holding ↓ through the list doesn't fire a request per row.
    useEffect(() => {
        const id = setTimeout(() => ensureTimeline(company.id), 90);
        return () => clearTimeout(id);
    }, [company.id, ensureTimeline]);

    const t = company.treatment;
    const excluded = Boolean(company.excludedAt);
    const contacts = useMemo(
        () => [...company.contacts].sort((a, b) =>
            STAGE_RANK[b.treatment.stage] - STAGE_RANK[a.treatment.stage] ||
            (b.treatment.lastActionAt ?? "").localeCompare(a.treatment.lastActionAt ?? "")),
        [company.contacts]
    );
    const workedContacts = contacts.filter((c) => c.treatment.treated).length;
    const nextStep = t.meetingAt
        ? { value: dayMonth.format(new Date(t.meetingAt)), sub: `RDV à ${timeOnly.format(new Date(t.meetingAt))}`, color: STAGE_COLOR.meeting }
        : t.meetingBooked
            ? { value: "RDV obtenu", sub: "date à confirmer", color: STAGE_COLOR.meeting }
            : t.nextCallbackAt
                ? { value: dayMonth.format(new Date(t.nextCallbackAt)), sub: "rappel prévu", color: STAGE_COLOR.callback }
                : null;
    const meta = [company.industry, company.size, company.country].filter(Boolean).join(" · ");

    return (
        <aside className={s.drawer} style={cssVar(excluded ? "#c2362b" : STAGE_COLOR[t.stage])} role="dialog" aria-label={company.name}>
            <div className={s.drawerAccent} />
            <header className={s.drawerHeader}>
                <div className={s.drawerTop}>
                    <span className={cx(s.drawerPos, s.num)}>{position > 0 ? `${position} sur ${total}` : "Hors filtre"}</span>
                    <div className={s.drawerNav}>
                        <button type="button" className={s.iconBtn} onClick={onPrev} disabled={position <= 1} aria-label="Précédente" title="Précédente (↑)">
                            <ChevronUp size={16} />
                        </button>
                        <button type="button" className={s.iconBtn} onClick={onNext} disabled={position === 0 || position >= total} aria-label="Suivante" title="Suivante (↓)">
                            <ChevronDown size={16} />
                        </button>
                        <button type="button" className={s.iconBtn} onClick={onClose} aria-label="Fermer" title="Fermer (Échap)">
                            <X size={16} />
                        </button>
                    </div>
                </div>
                <h2 className={s.drawerTitle}>{company.name}</h2>
                {meta && <div className={s.drawerMeta}>{meta}</div>}
                <div style={{ marginTop: 12 }}>
                    <span className={cx(s.pill, excluded && s.pillDanger)}>{statusLabel(company)}</span>
                </div>
            </header>

            <div className={s.drawerBody}>
                {excluded && (
                    <div className={s.banner}>
                        <Ban size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>
                            Vous avez demandé de ne plus contacter cette entreprise
                            {exclusion?.reason ? ` — « ${exclusion.reason} »` : ""}
                            {exclusion?.expiresAt ? `, jusqu'au ${fullDate.format(new Date(exclusion.expiresAt))}` : ""}.
                        </span>
                    </div>
                )}

                <section>
                    <div className={s.sectionTitle}>Parcours</div>
                    <StageTrack t={t} />
                </section>

                <section>
                    <div className={s.sectionTitle}>En chiffres</div>
                    <div className={s.stats}>
                        <div className={s.stat}>
                            <div className={s.statLabel}>Tentatives</div>
                            <div className={cx(s.statValue, s.num)}>{t.actionCount}</div>
                            <div className={s.statSub}>{t.callCount} appel{t.callCount > 1 ? "s" : ""}</div>
                        </div>
                        <div className={s.stat}>
                            <div className={s.statLabel}>Dernier contact</div>
                            <div className={s.statValue}>{t.lastActionAt ? relative(t.lastActionAt, nowMs) : "—"}</div>
                            <div className={s.statSub}>{t.lastActionAt ? fullDate.format(new Date(t.lastActionAt)) : "jamais"}</div>
                        </div>
                        <div className={s.stat}>
                            <div className={s.statLabel}>Prochaine étape</div>
                            <div className={s.statValue} style={nextStep ? { color: nextStep.color } : undefined}>{nextStep?.value ?? "—"}</div>
                            <div className={s.statSub}>{nextStep?.sub ?? "aucune planifiée"}</div>
                        </div>
                        <div className={s.stat}>
                            <div className={s.statLabel}>Contacts</div>
                            <div className={cx(s.statValue, s.num)}>{contacts.length}</div>
                            <div className={s.statSub}>{workedContacts} travaillé{workedContacts > 1 ? "s" : ""}</div>
                        </div>
                    </div>
                </section>

                <section>
                    <div className={s.sectionTitle}>Contacts <span className={s.num}>{contacts.length}</span></div>
                    {contacts.length === 0 ? (
                        <p className={s.contactWhen}>Aucun contact nominatif : l&apos;entreprise est travaillée via son standard.</p>
                    ) : (
                        <div className={s.contacts}>
                            {contacts.map((ct) => {
                                const ctExcluded = Boolean(ct.excludedAt);
                                return (
                                    <div key={ct.id} className={s.contact} style={cssVar(ctExcluded ? "#c2362b" : STAGE_COLOR[ct.treatment.stage])}>
                                        <div className={s.contactHead}>
                                            <span className={s.avatar}>{initials(ct)}</span>
                                            <div className={s.contactMain}>
                                                <div className={s.contactName}>{contactName(ct)}</div>
                                                {ct.title && <div className={s.contactTitle}>{ct.title}</div>}
                                            </div>
                                            <span className={cx(s.pill, ctExcluded && s.pillDanger)}>{ctExcluded ? "Exclu" : ct.treatment.lastResultLabel}</span>
                                        </div>
                                        <div className={s.contactFoot}>
                                            <span className={s.contactWhen}>
                                                {ct.treatment.lastActionAt
                                                    ? `${ct.treatment.actionCount} tentative${ct.treatment.actionCount > 1 ? "s" : ""} · ${relative(ct.treatment.lastActionAt, nowMs)}`
                                                    : "Pas encore contacté"}
                                            </span>
                                            <div className={s.contactLinks}>
                                                {ct.email && <CopyChip value={ct.email} href={`mailto:${ct.email}`} icon={Mail} />}
                                                {ct.phone && <CopyChip value={ct.phone} href={`tel:${ct.phone}`} icon={Phone} />}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section>
                    <div className={s.sectionTitle}>
                        Historique
                        {timeline && timeline !== "error" && <span className={s.num}>{timeline.timeline.length}{timeline.truncated ? "+" : ""}</span>}
                    </div>
                    {timeline === undefined ? (
                        <div style={{ display: "grid", gap: 10 }}>
                            {[70, 55, 62].map((w) => <div key={w} className={s.shimmer} style={{ height: 38, width: `${w}%` }} />)}
                        </div>
                    ) : timeline === "error" ? (
                        <p className={s.contactWhen} style={{ color: "#c2362b" }}>Impossible de charger l&apos;historique pour le moment.</p>
                    ) : timeline.timeline.length === 0 ? (
                        <p className={s.contactWhen}>Aucune action pour l&apos;instant : cette entreprise est dans la file de traitement.</p>
                    ) : (
                        <ol className={s.timeline}>
                            {timeline.timeline.map((e) => {
                                const channel = CHANNEL_META[e.channel];
                                const ChannelIcon = channel.icon;
                                const isMeeting = e.stage === "meeting";
                                return (
                                    <li key={e.id} className={s.tlItem} style={cssVar(STAGE_COLOR[e.stage])}>
                                        <span className={s.tlDot} />
                                        <div className={s.tlTop}>
                                            <span className={s.tlLabel}>{e.label}</span>
                                            <time className={s.tlTime} dateTime={e.at} title={dateTime.format(new Date(e.at))}>{relative(e.at, nowMs)}</time>
                                        </div>
                                        <div className={s.tlSub}>
                                            <ChannelIcon size={12} />{channel.label}{e.contactName ? ` · ${e.contactName}` : ""}
                                        </div>
                                        {e.scheduledAt && (
                                            <span className={s.tlScheduled}>
                                                {isMeeting ? <CalendarCheck size={12} /> : <CalendarClock size={12} />}
                                                {isMeeting ? "RDV prévu le" : "Rappel prévu le"} {dateTime.format(new Date(e.scheduledAt))}
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                            {timeline.truncated && <li className={s.tlItem}><span className={s.contactWhen}>Seules les 200 dernières actions sont affichées.</span></li>}
                        </ol>
                    )}
                </section>

                <section>
                    <div className={s.sectionTitle}>Fiche</div>
                    <div className={s.infoGrid}>
                        <span className={s.infoKey}>Téléphone</span>
                        <span className={s.infoVal}>{company.phone ? <a className={s.link} href={`tel:${company.phone}`}>{company.phone}</a> : <span className={s.muted}>—</span>}</span>
                        <span className={s.infoKey}>Site web</span>
                        <span className={s.infoVal}>
                            {company.website
                                ? <a className={s.link} href={company.website.startsWith("http") ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer"><Globe2 size={12} style={{ verticalAlign: -1, marginRight: 4 }} />{cleanWebsite(company.website)}</a>
                                : <span className={s.muted}>—</span>}
                        </span>
                        <span className={s.infoKey}>Commercial</span>
                        <span className={s.infoVal} title={commercialNames.join(", ")}>
                            {commercialNames.length > 0 ? commercialNames.join(", ") : <span className={s.muted}>Non attribué</span>}
                        </span>
                        <span className={s.infoKey}>Mission</span>
                        <span className={s.infoVal}>{company.missionName}</span>
                        <span className={s.infoKey}>Liste</span>
                        <span className={s.infoVal}>{company.listName || <span className={s.muted}>—</span>}</span>
                    </div>
                </section>
            </div>

            <footer className={s.drawerFoot}>↑ ↓ entreprise précédente / suivante · Échap pour fermer</footer>
        </aside>
    );
}

/* ═══════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════ */

const EMPTY_COUNTS = (): Record<PortalStage, number> =>
    ({ meeting: 0, opportunity: 0, callback: 0, in_progress: 0, closed: 0, untreated: 0 });

export default function ClientPortalDatabasePage() {
    const { error: showError } = useToast();
    const [data, setData] = useState<PortalDatabaseResponse | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    const [search, setSearch] = useState("");
    const deferredSearch = useDeferredValue(search);
    const [stage, setStage] = useState<PortalStage | null>(null);
    const [industry, setIndustry] = useState("");
    const [country, setCountry] = useState("");
    const [mission, setMission] = useState("");
    const [listId, setListId] = useState("");
    /** "" = all, "none" = no commercial, else an interlocuteur id */
    const [commercial, setCommercial] = useState("");
    const [sort, setSort] = useState<SortKey>("recent");

    const [activeId, setActiveId] = useState<string | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [timelines, setTimelines] = useState<Record<string, LoadedTimeline>>({});
    const [grown, setGrown] = useState(false);

    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewport, setViewport] = useState(640);
    const scrollRaf = useRef(0);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadedTimelines = useRef(new Set<string>());
    const inflight = useRef(new Set<string>());

    /* ── Data ── */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/client/database", { cache: "no-store" });
                const json = await res.json();
                if (cancelled) return;
                if (json.success) setData(json.data);
                else showError("Erreur", json.error || "Impossible de charger la base de données");
            } catch {
                if (!cancelled) showError("Erreur", "Impossible de charger la base de données");
            } finally {
                if (!cancelled) setRefreshing(false);
            }
        })();
        return () => { cancelled = true; };
    }, [showError, reloadKey]);

    useEffect(() => {
        if (!data) return;
        const id = requestAnimationFrame(() => setGrown(true));
        return () => cancelAnimationFrame(id);
    }, [data]);

    const refresh = () => {
        setRefreshing(true);
        setTimelines({});
        loadedTimelines.current.clear();
        setReloadKey((k) => k + 1);
    };

    const ensureTimeline = useCallback((id: string) => {
        if (loadedTimelines.current.has(id) || inflight.current.has(id)) return;
        inflight.current.add(id);
        fetch(`/api/client/database/${encodeURIComponent(id)}`)
            .then((res) => res.json())
            .then((json) => {
                if (!json.success) throw new Error(json.error);
                loadedTimelines.current.add(id);
                setTimelines((prev) => ({ ...prev, [id]: json.data }));
            })
            .catch(() => setTimelines((prev) => ({ ...prev, [id]: "error" })))
            .finally(() => inflight.current.delete(id));
    }, []);

    const companies = useMemo(() => data?.companies ?? [], [data]);
    const nowMs = data ? new Date(data.generatedAt).getTime() : 0;

    /* ── Facets & search index (computed once per load) ── */
    const facets = useMemo(() => {
        const industries = new Set<string>();
        const countries = new Set<string>();
        const missions = new Set<string>();
        const stageCounts = EMPTY_COUNTS();
        for (const c of companies) {
            if (c.industry) industries.add(c.industry);
            if (c.country) countries.add(c.country);
            missions.add(c.missionName);
            stageCounts[c.treatment.stage]++;
        }
        const byFr = (a: string, b: string) => a.localeCompare(b, "fr");
        return {
            industries: [...industries].sort(byFr),
            countries: [...countries].sort(byFr),
            missions: [...missions].sort(byFr),
            stageCounts,
        };
    }, [companies]);
    const multiMission = facets.missions.length > 1;

    const commercialNameById = useMemo(() => new Map((data?.commercials ?? []).map((c) => [c.id, c.name])), [data]);
    const hasUnassigned = useMemo(() => companies.some((c) => c.commercialIds.length === 0), [companies]);
    const listOptions = useMemo(
        () => (data?.lists ?? []).filter((l) => !mission || l.missionName === mission),
        [data, mission]
    );

    const haystacks = useMemo(
        () => new Map(companies.map((c) => [
            c.id,
            fold([
                c.name, c.industry, c.country, c.size, c.missionName, c.listName, c.treatment.lastResultLabel,
                ...c.commercialIds.map((id) => commercialNameById.get(id)),
                ...c.contacts.flatMap((ct) => [ct.firstName, ct.lastName, ct.title, ct.email, ct.phone]),
            ].filter(Boolean).join(" ")),
        ])),
        [companies, commercialNameById]
    );

    const exclusionById = useMemo(() => new Map((data?.exclusions ?? []).map((e) => [e.id, e])), [data]);

    /* ── Filtering: everything except the stage, so the tabs can show live counts ── */
    const query = fold(deferredSearch.trim());
    const base = useMemo(() => companies.filter((c) =>
        (!industry || c.industry === industry) &&
        (!country || c.country === country) &&
        (!mission || c.missionName === mission) &&
        (!listId || c.listId === listId) &&
        (!commercial || (commercial === "none" ? c.commercialIds.length === 0 : c.commercialIds.includes(commercial))) &&
        (!query || (haystacks.get(c.id) ?? "").includes(query))
    ), [companies, industry, country, mission, listId, commercial, query, haystacks]);

    const tabCounts = useMemo(() => {
        const counts = EMPTY_COUNTS();
        for (const c of base) counts[c.treatment.stage]++;
        return counts;
    }, [base]);

    const filtered = useMemo(() => {
        const list = stage ? base.filter((c) => c.treatment.stage === stage) : base.slice();
        const recent = (a: PortalCompany, b: PortalCompany) =>
            (b.treatment.lastActionAt ?? "").localeCompare(a.treatment.lastActionAt ?? "");
        const byName = (a: PortalCompany, b: PortalCompany) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
        const compare: Record<SortKey, (a: PortalCompany, b: PortalCompany) => number> = {
            recent: (a, b) => recent(a, b) || byName(a, b),
            stage: (a, b) => STAGE_RANK[b.treatment.stage] - STAGE_RANK[a.treatment.stage] || recent(a, b),
            effort: (a, b) => b.treatment.actionCount - a.treatment.actionCount || recent(a, b),
            name: byName,
        };
        return list.sort(compare[sort]);
    }, [base, stage, sort]);

    const activeIndex = useMemo(() => (activeId ? filtered.findIndex((c) => c.id === activeId) : -1), [filtered, activeId]);
    const activeCompany = useMemo(() => (activeId ? companies.find((c) => c.id === activeId) ?? null : null), [companies, activeId]);

    /* ── Virtual list ── */
    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => setViewport(entry.contentRect.height));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = 0;
    }, [query, stage, industry, country, mission, listId, commercial, sort]);

    const onScroll = (e: UIEvent<HTMLDivElement>) => {
        const top = e.currentTarget.scrollTop;
        cancelAnimationFrame(scrollRaf.current);
        scrollRaf.current = requestAnimationFrame(() => setScrollTop(top));
    };

    const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
    const last = Math.min(filtered.length, Math.ceil((scrollTop + viewport) / ROW_H) + OVERSCAN);

    const scrollIntoView = useCallback((index: number) => {
        const el = listRef.current;
        if (!el) return;
        const top = index * ROW_H;
        if (top < el.scrollTop) el.scrollTop = top;
        else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
    }, []);

    const move = useCallback((delta: number) => {
        if (filtered.length === 0) return;
        const next = activeIndex < 0
            ? (delta > 0 ? 0 : filtered.length - 1)
            : Math.min(filtered.length - 1, Math.max(0, activeIndex + delta));
        setActiveId(filtered[next].id);
        scrollIntoView(next);
    }, [filtered, activeIndex, scrollIntoView]);

    const openRow = useCallback((id: string) => {
        if (drawerOpen && activeId === id) {
            setDrawerOpen(false);
            return;
        }
        setActiveId(id);
        setDrawerOpen(true);
    }, [drawerOpen, activeId]);

    const hoverRow = useCallback((id: string) => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => ensureTimeline(id), 140);
    }, [ensureTimeline]);

    const leaveRow = useCallback(() => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
    }, []);

    /* ── Keyboard: / or ⌘K search, ↑↓ / j k move, Enter open, Esc close ── */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null;
            const typing = !!el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA" || el.isContentEditable);

            if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
                e.preventDefault();
                searchRef.current?.focus();
                searchRef.current?.select();
                return;
            }
            if (typing) {
                if (el !== searchRef.current) return;
                if (e.key === "Escape") {
                    if (search) setSearch("");
                    else searchRef.current?.blur();
                } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    searchRef.current?.blur();
                    move(1);
                } else if (e.key === "Enter" && filtered[0]) {
                    e.preventDefault();
                    searchRef.current?.blur();
                    setActiveId(filtered[0].id);
                    setDrawerOpen(true);
                    scrollIntoView(0);
                }
                return;
            }
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            // Let Enter/Space activate a focused button or link (drawer controls, copy chips…).
            if ((e.key === "Enter" || e.key === " ") && el?.closest("button, a")) return;
            if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); move(1); }
            else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); move(-1); }
            else if ((e.key === "Enter" || e.key === "ArrowRight") && activeId) { e.preventDefault(); setDrawerOpen(true); }
            else if ((e.key === "Escape" || e.key === "ArrowLeft") && drawerOpen) { e.preventDefault(); setDrawerOpen(false); }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [move, scrollIntoView, filtered, activeId, drawerOpen, search]);

    const hasFilters = !!(search || stage || industry || country || mission || listId || commercial);
    const resetFilters = () => {
        setSearch(""); setStage(null); setIndustry(""); setCountry(""); setMission(""); setListId(""); setCommercial("");
    };
    const total = companies.length;
    const isLoading = data === null;

    return (
        <div className={s.root} data-drawer={drawerOpen && activeCompany ? "open" : "closed"}>
            {/* ── Header ── */}
            <header className={s.header}>
                <div>
                    <div className={s.eyebrow}>Base de données</div>
                    <h1 className={s.title}>Avancement de votre base</h1>
                    <div className={s.subtitle}>
                        {data ? (
                            <>
                                <span className={s.liveDot} />
                                À jour à {timeOnly.format(new Date(data.generatedAt))}
                                {multiMission ? ` · ${facets.missions.length} missions` : data.companies[0] ? ` · ${data.companies[0].missionName}` : ""}
                                <button type="button" className={s.refreshBtn} onClick={refresh} disabled={refreshing}
                                    aria-label="Actualiser" title="Actualiser">
                                    <RotateCw size={13} className={refreshing ? s.spinning : undefined} />
                                </button>
                            </>
                        ) : "Chargement…"}
                    </div>
                </div>
                <div className={s.headerActions}>
                    <div className={s.search}>
                        <Search className={s.searchIcon} />
                        <input
                            ref={searchRef}
                            type="search"
                            className={s.searchInput}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Entreprise, contact, statut…"
                            aria-label="Rechercher dans la base"
                        />
                        {search
                            ? <button type="button" className={s.clearBtn} onClick={() => setSearch("")} aria-label="Effacer"><X size={14} /></button>
                            : <kbd className={s.kbd}>/</kbd>}
                    </div>
                    <button type="button" className={s.btnPrimary} onClick={() => exportCsv(filtered)} disabled={filtered.length === 0}
                        title="Exporter la vue filtrée (une ligne par contact)">
                        <Download size={15} />
                        Exporter{filtered.length > 0 ? <span className={s.num}>&nbsp;{filtered.length.toLocaleString("fr-FR")}</span> : null}
                    </button>
                </div>
            </header>

            {/* ── Hero ── */}
            {isLoading ? (
                <div className={s.hero}>
                    <div className={s.panel}><div className={s.shimmer} style={{ height: 180 }} /></div>
                    <div className={s.panel}><div className={s.shimmer} style={{ height: 180 }} /></div>
                </div>
            ) : total > 0 && (
                <div className={s.hero}>
                    <ProgressPanel stageCounts={facets.stageCounts} total={total} activeStage={stage} onStage={setStage} grown={grown} />
                    <ActivityPanel activity={data.activity} grown={grown} />
                </div>
            )}

            {/* ── Toolbar ── */}
            {total > 0 && (
                <div className={s.toolbar}>
                    <div className={s.tabs} role="group" aria-label="Filtrer par étape">
                        <button type="button" aria-pressed={!stage} className={cx(s.tab, !stage && s.tabActive)} onClick={() => setStage(null)}>
                            Tout <span className={cx(s.tabCount, s.num)}>{base.length.toLocaleString("fr-FR")}</span>
                        </button>
                        {PORTAL_STAGE_ORDER.map((st) => (
                            <button key={st} type="button" aria-pressed={stage === st}
                                className={cx(s.tab, stage === st && s.tabActive)} style={cssVar(STAGE_COLOR[st])}
                                onClick={() => setStage(stage === st ? null : st)}>
                                <span className={s.tabDot} />
                                {PORTAL_STAGE_LABELS[st]}
                                <span className={cx(s.tabCount, s.num)}>{tabCounts[st].toLocaleString("fr-FR")}</span>
                            </button>
                        ))}
                    </div>
                    <div className={s.toolbarRight}>
                        {multiMission && (
                            <select className={s.pillSelect} data-active={!!mission} value={mission} aria-label="Mission"
                                onChange={(e) => { setMission(e.target.value); setListId(""); }}>
                                <option value="">Toutes les missions</option>
                                {facets.missions.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                        )}
                        {(data?.lists.length ?? 0) > 1 && (
                            <select className={s.pillSelect} data-active={!!listId} value={listId} onChange={(e) => setListId(e.target.value)} aria-label="Liste">
                                <option value="">Toutes les listes</option>
                                {multiMission && !mission
                                    ? facets.missions.map((m) => (
                                        <optgroup key={m} label={m}>
                                            {listOptions.filter((l) => l.missionName === m).map((l) => (
                                                <option key={l.id} value={l.id}>{l.name}{l.isArchived ? " (archivée)" : ""} · {l.companyCount}</option>
                                            ))}
                                        </optgroup>
                                    ))
                                    : listOptions.map((l) => (
                                        <option key={l.id} value={l.id}>{l.name}{l.isArchived ? " (archivée)" : ""} · {l.companyCount}</option>
                                    ))}
                            </select>
                        )}
                        {(data?.commercials.length ?? 0) > 0 && (
                            <select className={s.pillSelect} data-active={!!commercial} value={commercial} onChange={(e) => setCommercial(e.target.value)} aria-label="Commercial">
                                <option value="">Tous les commerciaux</option>
                                {data?.commercials.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                {hasUnassigned && <option value="none">Sans commercial</option>}
                            </select>
                        )}
                        {facets.industries.length > 1 && (
                            <select className={s.pillSelect} data-active={!!industry} value={industry} onChange={(e) => setIndustry(e.target.value)} aria-label="Secteur">
                                <option value="">Tous secteurs</option>
                                {facets.industries.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                        )}
                        {facets.countries.length > 1 && (
                            <select className={s.pillSelect} data-active={!!country} value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Pays">
                                <option value="">Tous pays</option>
                                {facets.countries.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                        )}
                        <select className={s.pillSelect} data-active="true" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Trier">
                            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => <option key={k} value={k}>Trier : {SORT_LABELS[k]}</option>)}
                        </select>
                        {hasFilters && (
                            <button type="button" className={s.resetBtn} onClick={resetFilters}><X size={13} /> Réinitialiser</button>
                        )}
                    </div>
                </div>
            )}

            {/* ── List (always mounted so the virtualizer can measure it) ── */}
            <div className={s.list} style={!isLoading && total === 0 ? { display: "none" } : undefined}>
                <div className={s.listHead} aria-hidden="true">
                    <span>Entreprise</span>
                    <span>Tentatives</span>
                    <span>Statut</span>
                    <span style={{ textAlign: "right" }}>Dernier contact</span>
                </div>
                <div
                    ref={listRef}
                    className={s.listScroll}
                    onScroll={onScroll}
                    role="listbox"
                    tabIndex={0}
                    aria-label="Entreprises"
                    aria-activedescendant={activeId && activeIndex >= 0 ? `db-row-${activeId}` : undefined}
                >
                    {isLoading ? (
                        <div style={{ padding: "8px 20px" }}>
                            {Array.from({ length: 9 }, (_, i) => (
                                <div key={i} style={{ height: ROW_H, display: "flex", alignItems: "center", gap: 16 }}>
                                    <div className={s.shimmer} style={{ width: 10, height: 10, borderRadius: 99 }} />
                                    <div className={s.shimmer} style={{ height: 14, width: `${38 + ((i * 13) % 30)}%` }} />
                                </div>
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className={s.empty}>
                            <div className={s.emptyTitle}>Aucune entreprise ne correspond</div>
                            <div className={s.emptyText}>Essayez un autre terme ou retirez un filtre.</div>
                            {hasFilters && <button type="button" className={s.resetBtn} style={{ marginTop: 12 }} onClick={resetFilters}><X size={13} /> Réinitialiser les filtres</button>}
                        </div>
                    ) : (
                        <div className={s.listInner} style={{ height: filtered.length * ROW_H }}>
                            {filtered.slice(first, last).map((c, i) => (
                                <Row
                                    key={c.id}
                                    company={c}
                                    index={first + i}
                                    query={query}
                                    active={c.id === activeId}
                                    open={drawerOpen && c.id === activeId}
                                    multiMission={multiMission}
                                    nowMs={nowMs}
                                    onOpen={openRow}
                                    onHover={hoverRow}
                                    onLeave={leaveRow}
                                />
                            ))}
                        </div>
                    )}
                </div>
                <div className={s.listFoot}>
                    <span className={s.num}>
                        {filtered.length.toLocaleString("fr-FR")} entreprise{filtered.length > 1 ? "s" : ""}
                        {filtered.length !== total && ` sur ${total.toLocaleString("fr-FR")}`}
                    </span>
                    <span className={s.keys}>
                        <span><kbd>/</kbd>rechercher</span>
                        <span><kbd>↑</kbd><kbd>↓</kbd>naviguer</span>
                        <span><kbd>↵</kbd>ouvrir</span>
                        <span><kbd>Échap</kbd>fermer</span>
                    </span>
                </div>
            </div>

            {!isLoading && total === 0 && (
                <div className={cx(s.panel, s.empty)}>
                    <div className={s.emptyTitle}>Votre base arrive</div>
                    <div className={s.emptyText}>Dès que vos listes seront importées, vous suivrez ici l&apos;avancement de chaque entreprise.</div>
                </div>
            )}

            {drawerOpen && activeCompany && (
                <Inspector
                    company={activeCompany}
                    exclusion={activeCompany.exclusionId ? exclusionById.get(activeCompany.exclusionId) : undefined}
                    commercialNames={activeCompany.commercialIds.map((id) => commercialNameById.get(id)).filter((n): n is string => !!n)}
                    timeline={timelines[activeCompany.id]}
                    position={activeIndex + 1}
                    total={filtered.length}
                    nowMs={nowMs}
                    onPrev={() => move(-1)}
                    onNext={() => move(1)}
                    onClose={() => setDrawerOpen(false)}
                    ensureTimeline={ensureTimeline}
                />
            )}
        </div>
    );
}
