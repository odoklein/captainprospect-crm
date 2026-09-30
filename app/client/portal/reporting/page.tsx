"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { DateTime } from "luxon";
import { useToast } from "@/components/ui";
import {
    BarChart3, Check, ChevronDown, Copy, Download, Eye, FileText, Link2, Loader2, Mic, Printer,
    Sparkles, Target, TrendingDown, TrendingUp, Trophy, Users,
} from "lucide-react";
import type { ReportData, ReportingOverview } from "@/lib/reporting/types";
import s from "./reporting.module.css";

/* ═══════════════════════════════════════════════════════════════
   TYPES & HELPERS
═══════════════════════════════════════════════════════════════ */

type SessionType = "Kick-Off" | "Onboarding" | "Validation" | "Reporting" | "Suivi" | "Autre";
interface SessionTask {
    id: string;
    label: string;
    assignee?: string;
    doneAt?: string | null;
}
interface ClientSession {
    id: string;
    type: SessionType;
    date: string;
    recordingUrl?: string;
    crMarkdown?: string;
    summaryEmail?: string;
    tasks: SessionTask[];
}

const SESSION_COLORS: Record<SessionType, string> = {
    "Kick-Off": "#3b6fe0",
    Onboarding: "#1f9d55",
    Validation: "#c2367a",
    Reporting: "#d4870a",
    Suivi: "#737b85",
    Autre: "#7c5cc4",
};

type Preset = "this_month" | "last_month" | "last_3" | "since_launch" | "custom";
const PRESET_LABELS: Record<Exclude<Preset, "custom">, string> = {
    this_month: "Ce mois-ci",
    last_month: "Mois dernier",
    last_3: "3 derniers mois",
    since_launch: "Depuis le lancement",
};

interface Range { from: string; to: string }

const ZONE = "Europe/Paris";
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const sessionDateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: ZONE });

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const iso = (d: DateTime) => d.toISODate() as string;

function presetRange(preset: Exclude<Preset, "custom">, today: DateTime, launch: string | null): Range {
    switch (preset) {
        case "this_month":
            return { from: iso(today.startOf("month")), to: iso(today) };
        case "last_month": {
            const m = today.minus({ months: 1 });
            return { from: iso(m.startOf("month")), to: iso(m.endOf("month")) };
        }
        case "last_3":
            return { from: iso(today.minus({ months: 2 }).startOf("month")), to: iso(today) };
        case "since_launch":
            return { from: launch && launch <= iso(today) ? launch : iso(today.startOf("month")), to: iso(today) };
    }
}

function monthRange(key: string, today: DateTime): Range {
    const start = DateTime.fromISO(`${key}-01`, { zone: ZONE });
    const end = start.endOf("month");
    return { from: iso(start), to: iso(end < today ? end : today) };
}

function monthLabel(key: string): string {
    return monthFmt.format(new Date(`${key}-01T12:00:00Z`));
}

function reportQuery(range: Range, missionId: string, compare: boolean): URLSearchParams {
    const q = new URLSearchParams({ dateFrom: range.from, dateTo: range.to, comparePrevious: String(compare) });
    if (missionId) q.set("missionId", missionId);
    return q;
}

function formatDelta(value: number | null | undefined, unit: "%" | "pts" = "%") {
    if (value === null || value === undefined) return null;
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    return `${sign}${Math.abs(value)}${unit === "%" ? " %" : " pt" + (Math.abs(value) > 1 ? "s" : "")}`;
}

function summaryText(d: ReportData, compare: boolean): string {
    const delta = (v: number | null | undefined, unit: "%" | "pts" = "%") => {
        const f = compare ? formatDelta(v, unit) : null;
        return f ? ` (${f} vs période précédente)` : "";
    };
    const [contacts, qualified, meetings, conversion] = d.deltas ?? [null, null, null, null];
    return [
        `Rapport Captain Prospect — ${d.missionLabel}`,
        `Période : ${d.periodLabel}`,
        "",
        `• RDV obtenus : ${d.meetingsBooked}${delta(meetings)}`,
        `• Contacts touchés : ${d.contactsReached}${delta(contacts)}`,
        `• Leads qualifiés : ${d.qualifiedLeads}${delta(qualified)}`,
        `• Taux de conversion : ${String(d.conversionRate).replace(".", ",")} %${delta(conversion, "pts")}`,
        `• Opportunités : ${d.opportunities}`,
    ].join("\n");
}

async function downloadPdf(range: Range, missionId: string, compare: boolean) {
    const res = await fetch(`/api/client/reporting/pdf?${reportQuery(range, missionId, compare)}`);
    if (!res.ok) throw new Error("pdf");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-${range.from}_${range.to}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

async function createShareLink(range: Range, missionId: string): Promise<string> {
    const res = await fetch("/api/client/reporting/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            missionId: missionId || null,
            dateFrom: DateTime.fromISO(range.from, { zone: ZONE }).startOf("day").toISO(),
            dateTo: DateTime.fromISO(range.to, { zone: ZONE }).endOf("day").toISO(),
        }),
    });
    const json = await res.json();
    if (!json.success || !json.data?.url) throw new Error(json.error || "share");
    return json.data.url as string;
}

/* ═══════════════════════════════════════════════════════════════
   PREVIEW PIECES
═══════════════════════════════════════════════════════════════ */

function Delta({ value, unit = "%" }: { value: number | null | undefined; unit?: "%" | "pts" }) {
    const label = formatDelta(value, unit);
    if (!label) return null;
    const Icon = value! > 0 ? TrendingUp : TrendingDown;
    return (
        <span className={cx(s.delta, value! > 0 ? s.deltaUp : value! < 0 ? s.deltaDown : s.deltaFlat)}>
            {value !== 0 && <Icon size={11} />}{label}
        </span>
    );
}

function HeroPill({ value, unit = "%" }: { value: number; unit?: "%" | "pts" }) {
    const Icon = value >= 0 ? TrendingUp : TrendingDown;
    return (
        <span className={cx(s.heroPill, value < 0 && s.heroPillDown)}>
            <Icon size={13} /> {formatDelta(value, unit)} vs période précédente
        </span>
    );
}

function Kpi({ label, value, delta, icon: Icon, color, footnote, compare }: {
    label: string; value: string | number; delta?: number | null; icon: typeof Users; color: string; footnote: string; compare: boolean;
}) {
    return (
        <div className={s.kpiCard} style={{ "--k": color } as CSSProperties}>
            <div className={s.kpiTop}>
                <span className={s.kpiLabel}>{label}</span>
                <span className={s.kpiIcon}><Icon size={15} /></span>
            </div>
            <div className={cx(s.kpiValue, s.num)}>{value}</div>
            <div className={s.kpiFoot}>
                {compare && delta !== undefined && delta !== null ? <><Delta value={delta} /> vs période précédente</> : footnote}
            </div>
        </div>
    );
}

function MeetingsChart({ points }: { points: ReportData["meetingsByPeriod"] }) {
    const max = Math.max(1, ...points.map((p) => p.count));
    const total = points.reduce((n, p) => n + p.count, 0);
    return (
        <div className={s.chartBox}>
            <div className={s.chartTitle}>
                <span>RDV obtenus par mois</span>
                <span className={cx(s.chartTotal, s.num)}>{total} au total</span>
            </div>
            <div className={s.bars}>
                {points.map((p, i) => (
                    <div key={p.label} className={s.barCol} title={`${p.label} : ${p.count} RDV`}>
                        <span className={cx(s.barValue, s.num)}>{p.count}</span>
                        <div className={cx(s.bar, i === points.length - 1 && s.barLast)} style={{ height: `${Math.max(4, (p.count / max) * 100)}%` }} />
                    </div>
                ))}
            </div>
            <div className={s.barLabels}>
                {points.map((p) => <span key={p.label}>{p.label}</span>)}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   SESSIONS
═══════════════════════════════════════════════════════════════ */

function SessionRow({ session, open, onToggle }: { session: ClientSession; open: boolean; onToggle: () => void }) {
    const toast = useToast();
    const [view, setView] = useState<"cr" | "email">("cr");
    const openTasks = session.tasks.filter((t) => !t.doneAt).length;
    const excerpt = session.crMarkdown?.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.slice(0, 140);
    const color = SESSION_COLORS[session.type] ?? SESSION_COLORS.Autre;

    return (
        <div className={s.session} style={{ "--c": color } as CSSProperties}>
            <button type="button" className={s.sessionHead} onClick={onToggle} aria-expanded={open}>
                <span className={s.typePill}>{session.type}</span>
                <div className={s.sessionMain}>
                    <div className={s.sessionTitle}>Session du {sessionDateFmt.format(new Date(session.date))}</div>
                    {excerpt && <div className={s.sessionExcerpt}>{excerpt}</div>}
                </div>
                <div className={s.sessionSide}>
                    {session.recordingUrl && (
                        <a className={s.link} href={session.recordingUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                            <Mic size={13} /> Enregistrement
                        </a>
                    )}
                    {openTasks > 0 && <span className={s.taskBadge}>{openTasks} tâche{openTasks > 1 ? "s" : ""}</span>}
                    <ChevronDown size={16} className={cx(s.chev, open && s.chevOpen)} />
                </div>
            </button>
            {open && (
                <div className={s.sessionBody}>
                    <div className={s.subTabs}>
                        <button type="button" className={cx(s.subTab, view === "cr" && s.subTabActive)} onClick={() => setView("cr")}>Compte rendu</button>
                        <button type="button" className={cx(s.subTab, view === "email" && s.subTabActive)} onClick={() => setView("email")}>Mail de synthèse</button>
                    </div>
                    {view === "cr" ? (
                        session.crMarkdown
                            ? <pre className={s.doc}>{session.crMarkdown}</pre>
                            : <p className={s.emptyText}>Pas encore de compte rendu pour cette session.</p>
                    ) : session.summaryEmail ? (
                        <>
                            <div className={s.docBox}><pre className={s.doc}>{session.summaryEmail}</pre></div>
                            <button type="button" className={s.btn} style={{ marginTop: 10 }}
                                onClick={() => navigator.clipboard.writeText(session.summaryEmail!).then(() => toast.success("Copié", "Le mail est dans votre presse-papier"))}>
                                <Copy size={14} /> Copier le mail
                            </button>
                        </>
                    ) : (
                        <p className={s.emptyText}>Pas de mail de synthèse pour cette session.</p>
                    )}
                    {session.tasks.length > 0 && (
                        <div className={s.tasks}>
                            <div className={s.tasksTitle}>Prochaines actions</div>
                            {session.tasks.map((t) => (
                                <div key={t.id} className={s.task}>
                                    <span className={cx(s.taskDot, t.doneAt && s.taskDone)} />
                                    <span className={t.doneAt ? s.taskLabelDone : undefined}>{t.label}</span>
                                    {t.assignee && <span className={s.taskMeta}>{t.assignee}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════ */

export default function ClientPortalReportingPage() {
    const toast = useToast();
    const builderRef = useRef<HTMLDivElement>(null);
    const [today] = useState(() => DateTime.now().setZone(ZONE).startOf("day"));

    const [tab, setTab] = useState<"report" | "sessions">("report");
    const [overview, setOverview] = useState<ReportingOverview | null>(null);
    const [overviewError, setOverviewError] = useState(false);
    const [sessions, setSessions] = useState<ClientSession[] | null>(null);
    const [openSession, setOpenSession] = useState<string | null>(null);

    const [preset, setPreset] = useState<Preset>("this_month");
    const [range, setRange] = useState<Range>(() => presetRange("this_month", DateTime.now().setZone(ZONE).startOf("day"), null));
    const [missionId, setMissionId] = useState("");
    const [compare, setCompare] = useState(true);

    const [preview, setPreview] = useState<{ key: string; data: ReportData } | null>(null);
    const [previewError, setPreviewError] = useState<{ key: string; message: string } | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);

    /* ── Loads ── */
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/client/reporting/monthly-summary");
                const json = await res.json();
                if (json.success) setOverview(json.data);
                else setOverviewError(true);
            } catch {
                setOverviewError(true);
            }
        })();
        (async () => {
            try {
                const res = await fetch("/api/client/sessions");
                const json = await res.json();
                setSessions(json.success ? json.data ?? [] : []);
            } catch {
                setSessions([]);
            }
        })();
    }, []);

    const validRange = Boolean(range.from && range.to && range.from <= range.to);
    const queryKey = `${range.from}|${range.to}|${missionId}|${compare}`;

    useEffect(() => {
        if (!validRange) return;
        const ctrl = new AbortController();
        const key = queryKey;
        const timer = setTimeout(() => {
            fetch(`/api/client/reporting/data?${reportQuery(range, missionId, compare)}`, { signal: ctrl.signal })
                .then((res) => res.json())
                .then((json) => {
                    if (json.success) setPreview({ key, data: json.data });
                    else setPreviewError({ key, message: json.error ?? "Impossible de préparer l'aperçu." });
                })
                .catch((err) => {
                    if ((err as Error)?.name !== "AbortError") setPreviewError({ key, message: "Impossible de préparer l'aperçu." });
                });
        }, 180);
        return () => { clearTimeout(timer); ctrl.abort(); };
    }, [queryKey, validRange, range, missionId, compare]);

    const previewReady = preview?.key === queryKey;
    const currentError = previewError?.key === queryKey ? previewError.message : null;

    /* ── Builder actions ── */
    const choosePreset = (p: Exclude<Preset, "custom">) => {
        setPreset(p);
        setRange(presetRange(p, today, overview?.launchDate ?? null));
    };

    const flash = (id: string) => {
        setCopied(id);
        setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
    };

    const runPdf = useCallback(async (r: Range, id: string) => {
        setBusy(id);
        try {
            await downloadPdf(r, missionId, compare);
            toast.success("Rapport téléchargé");
        } catch {
            toast.error("Erreur", "Impossible de générer le PDF pour le moment.");
        } finally {
            setBusy(null);
        }
    }, [missionId, compare, toast]);

    const runShare = useCallback(async (r: Range, id: string) => {
        setBusy(id);
        try {
            const url = await createShareLink(r, missionId);
            await navigator.clipboard.writeText(url);
            flash(id);
            toast.success("Lien copié", "Valable 30 jours, à coller dans un email.");
        } catch {
            toast.error("Erreur", "Impossible de créer le lien de partage.");
        } finally {
            setBusy(null);
        }
    }, [missionId, toast]);

    const copySummary = async () => {
        if (!preview || !previewReady) return;
        await navigator.clipboard.writeText(summaryText(preview.data, compare));
        flash("summary");
        toast.success("Résumé copié", "Prêt à coller dans un email.");
    };

    const previewMonth = (key: string) => {
        setPreset("custom");
        setRange(monthRange(key, today));
        setTab("report");
        builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    /* ── History ── */
    const history = useMemo(() => [...(overview?.months ?? [])].reverse(), [overview]);
    const maxMeetings = Math.max(1, ...history.map((m) => m.meetings));
    const totals = useMemo(() => history.reduce(
        (t, m) => ({ meetings: t.meetings + m.meetings, calls: t.calls + m.calls, touched: t.touched + m.contactsTouched }),
        { meetings: 0, calls: 0, touched: 0 }
    ), [history]);
    const currentMonthKey = today.toFormat("yyyy-MM");
    /** Best finished-or-running month by RDV, only meaningful once there is something to compare. */
    const bestMonthKey = useMemo(() => {
        if (history.length < 2) return null;
        const best = history.reduce((b, m) => (m.meetings > b.meetings ? m : b), history[0]);
        return best.meetings > 0 ? best.key : null;
    }, [history]);

    const data = preview?.data;
    const [dContacts, dQualified, dMeetings, dConversion] = data?.deltas ?? [null, null, null, null];
    const printHref = `/client/portal/reporting/export?${reportQuery(range, missionId, compare)}`;
    const noMissions = overview !== null && overview.missions.length === 0;

    return (
        <div className={s.root}>
            <header className={s.header}>
                <div>
                    <div className={s.eyebrow}>Rapports</div>
                    <h1 className={s.title}>Vos résultats, prêts à partager</h1>
                    <p className={s.subtitle}>Composez un rapport sur la période de votre choix, puis téléchargez-le, partagez-le ou collez-en le résumé.</p>
                </div>
                <div className={s.tabs} role="group" aria-label="Section">
                    <button type="button" aria-pressed={tab === "report"} className={cx(s.tab, tab === "report" && s.tabActive)} onClick={() => setTab("report")}>
                        <FileText size={14} /> Rapport
                    </button>
                    <button type="button" aria-pressed={tab === "sessions"} className={cx(s.tab, tab === "sessions" && s.tabActive)} onClick={() => setTab("sessions")}>
                        <Mic size={14} /> Comptes rendus
                        {sessions && sessions.length > 0 && <span className={cx(s.tabCount, s.num)}>{sessions.length}</span>}
                    </button>
                </div>
            </header>

            {tab === "sessions" ? (
                <section className={s.card}>
                    <div className={s.cardHead}>
                        <span className={s.cardTitle} style={{ "--k": "#c98a0b" } as CSSProperties}>
                            <span className={s.cardTitleIcon}><Mic size={14} /></span>
                            Sessions et comptes rendus
                        </span>
                        <span className={s.cardHint}>Les points faits avec votre équipe Captain Prospect</span>
                    </div>
                    {sessions === null ? (
                        <div style={{ padding: 20, display: "grid", gap: 10 }}>
                            {[0, 1, 2].map((i) => <div key={i} className={s.shimmer} style={{ height: 48 }} />)}
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className={s.empty}>
                            <div className={s.emptyTitle}>Aucune session pour le moment</div>
                            <div className={s.emptyText}>Les comptes rendus de vos points d&apos;équipe apparaîtront ici.</div>
                        </div>
                    ) : (
                        sessions.map((session) => (
                            <SessionRow key={session.id} session={session} open={openSession === session.id}
                                onToggle={() => setOpenSession(openSession === session.id ? null : session.id)} />
                        ))
                    )}
                </section>
            ) : noMissions ? (
                <section className={cx(s.card, s.empty)}>
                    <div className={s.emptyTitle}>Aucun rapport disponible</div>
                    <div className={s.emptyText}>Vos rapports apparaîtront ici dès le lancement de votre mission.</div>
                </section>
            ) : (
                <>
                    {/* ── Builder + live preview ── */}
                    <section className={s.card} ref={builderRef} style={{ scrollMarginTop: 16 }}>
                        <div className={s.controls}>
                            <div className={s.presets} role="group" aria-label="Période">
                                {(Object.keys(PRESET_LABELS) as Exclude<Preset, "custom">[]).map((p) => (
                                    <button key={p} type="button" aria-pressed={preset === p}
                                        className={cx(s.preset, preset === p && s.presetActive)} onClick={() => choosePreset(p)}>
                                        {PRESET_LABELS[p]}
                                    </button>
                                ))}
                            </div>
                            <div className={s.dates}>
                                <input type="date" className={s.input} value={range.from} max={range.to || iso(today)} aria-label="Du"
                                    onChange={(e) => { setPreset("custom"); setRange((r) => ({ ...r, from: e.target.value })); }} />
                                →
                                <input type="date" className={s.input} value={range.to} min={range.from} max={iso(today)} aria-label="Au"
                                    onChange={(e) => { setPreset("custom"); setRange((r) => ({ ...r, to: e.target.value })); }} />
                            </div>
                            <div className={s.controlsRight}>
                                {overview && overview.missions.length > 1 && (
                                    <select className={s.select} value={missionId} onChange={(e) => setMissionId(e.target.value)} aria-label="Mission">
                                        <option value="">Toutes les missions</option>
                                        {overview.missions.map((m) => <option key={m.id} value={m.id}>{m.name}{m.isActive ? "" : " (terminée)"}</option>)}
                                    </select>
                                )}
                                <label className={s.toggle}>
                                    <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} style={{ display: "none" }} />
                                    <span className={cx(s.switch, compare && s.switchOn)} aria-hidden="true" />
                                    Comparer à la période précédente
                                </label>
                            </div>
                        </div>

                        {!validRange ? (
                            <div className={s.previewError}>Choisissez une date de début antérieure à la date de fin.</div>
                        ) : currentError ? (
                            <div className={s.previewError}>{currentError}</div>
                        ) : !data ? (
                            <div className={s.preview}>
                                <div className={s.shimmer} style={{ height: 22, width: "40%", marginBottom: 14 }} />
                                <div className={s.shimmer} style={{ height: 150, borderRadius: 18 }} />
                                <div className={s.kpis3}>{[0, 1, 2].map((i) => <div key={i} className={s.shimmer} style={{ height: 110 }} />)}</div>
                            </div>
                        ) : (
                            <div className={cx(s.preview, !previewReady && s.previewStale)} aria-busy={!previewReady}>
                                <div className={s.paperHead}>
                                    <div>
                                        <div className={s.paperTitle}>{data.missionLabel}</div>
                                        <div className={s.paperMeta}>{data.periodLabel}</div>
                                    </div>
                                    <span className={s.paperStamp}>
                                        {!previewReady && <Loader2 size={12} className={s.spin} />}
                                        Aperçu du rapport · {data.clientName}
                                    </span>
                                </div>
                                <div className={s.hero}>
                                    <div className={s.heroGlow} />
                                    <div>
                                        <div className={s.heroLabel}>RDV obtenus</div>
                                        <div className={cx(s.heroValue, s.num)}>{data.meetingsBooked.toLocaleString("fr-FR")}</div>
                                        <div className={s.heroFoot}>
                                            {compare && dMeetings !== null && dMeetings !== undefined
                                                ? <HeroPill value={dMeetings} />
                                                : <span className={s.heroCaption}>sur la période</span>}
                                        </div>
                                    </div>
                                    <div className={s.heroDivider} />
                                    <div>
                                        <div className={s.heroLabel}>Taux de conversion</div>
                                        <div className={cx(s.heroValueSm, s.num)}>{String(data.conversionRate).replace(".", ",")} %</div>
                                        <div className={s.heroCaption}>des contacts touchés ont obtenu un RDV</div>
                                        <div className={s.heroFoot}>
                                            {compare && dConversion !== null && dConversion !== undefined && <HeroPill value={dConversion} unit="pts" />}
                                        </div>
                                    </div>
                                </div>
                                <div className={s.kpis3}>
                                    <Kpi label="Contacts touchés" value={data.contactsReached.toLocaleString("fr-FR")} delta={dContacts}
                                        icon={Users} color="#3b6fe0" footnote="entreprises et contacts" compare={compare} />
                                    <Kpi label="Leads qualifiés" value={data.qualifiedLeads.toLocaleString("fr-FR")} delta={dQualified}
                                        icon={Target} color="#c98a0b" footnote="intérêt, rappel ou RDV" compare={compare} />
                                    <Kpi label="Opportunités" value={data.opportunities.toLocaleString("fr-FR")}
                                        icon={Sparkles} color="#0f8f86" footnote="détectées sur la période" compare={compare} />
                                </div>
                                {data.meetingsByPeriod.length > 1 ? (
                                    <MeetingsChart points={data.meetingsByPeriod} />
                                ) : data.missions.length > 0 && (
                                    <div className={s.chartBox}>
                                        <div className={s.chartTitle}><span>{data.missions.length > 1 ? "Missions incluses" : "Mission"}</span></div>
                                        <div className={s.missionChips}>
                                            {data.missions.map((m) => <span key={m.id} className={s.chip}>{m.name}</span>)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className={s.actions}>
                            <button type="button" className={cx(s.btn, s.btnPrimary)} disabled={!validRange || busy === "pdf"} onClick={() => runPdf(range, "pdf")}>
                                {busy === "pdf" ? <Loader2 size={15} className={s.spin} /> : <Download size={15} />} Télécharger le PDF
                            </button>
                            <button type="button" className={cx(s.btn, copied === "share" && s.btnDone)} disabled={!validRange || busy === "share"} onClick={() => runShare(range, "share")}>
                                {busy === "share" ? <Loader2 size={15} className={s.spin} /> : copied === "share" ? <Check size={15} /> : <Link2 size={15} />}
                                {copied === "share" ? "Lien copié" : "Copier un lien de partage"}
                            </button>
                            <button type="button" className={cx(s.btn, copied === "summary" && s.btnDone)} disabled={!previewReady} onClick={copySummary}>
                                {copied === "summary" ? <Check size={15} /> : <Copy size={15} />}
                                {copied === "summary" ? "Résumé copié" : "Copier le résumé"}
                            </button>
                            <a className={s.btn} href={printHref} target="_blank" rel="noopener noreferrer" aria-disabled={!validRange}>
                                <Printer size={15} /> Version imprimable
                            </a>
                            <span className={s.actionsNote}>Lien de partage valable 30 jours, sans connexion.</span>
                        </div>
                    </section>

                    {/* ── Monthly history ── */}
                    <section className={s.card}>
                        <div className={s.cardHead}>
                            <span className={s.cardTitle} style={{ "--k": "#3b6fe0" } as CSSProperties}>
                                <span className={s.cardTitleIcon}><BarChart3 size={14} /></span>
                                Historique mensuel
                            </span>
                            <span className={s.cardHint}>
                                {overview?.launchDate ? `Depuis le lancement · ${totals.meetings} RDV au total` : ""}
                            </span>
                        </div>
                        {overviewError ? (
                            <div className={s.previewError}>Impossible de charger l&apos;historique pour le moment.</div>
                        ) : overview === null ? (
                            <div style={{ padding: 20, display: "grid", gap: 8 }}>
                                {[0, 1, 2, 3].map((i) => <div key={i} className={s.shimmer} style={{ height: 36 }} />)}
                            </div>
                        ) : history.length === 0 ? (
                            <div className={s.empty}>
                                <div className={s.emptyTitle}>Pas encore d&apos;historique</div>
                                <div className={s.emptyText}>Le premier mois apparaîtra ici dès le démarrage de la mission.</div>
                            </div>
                        ) : (
                            <div style={{ overflowX: "auto" }}>
                                <table className={s.table}>
                                    <thead>
                                        <tr>
                                            <th>Mois</th>
                                            <th>RDV obtenus</th>
                                            <th className={cx(s.right, s.hideSm)}>Appels</th>
                                            <th className={cx(s.right, s.hideSm)}>Contacts touchés</th>
                                            <th className={s.right}>Rapport</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.map((m, i) => {
                                            const r = monthRange(m.key, today);
                                            const pdfId = `pdf-${m.key}`;
                                            const shareId = `share-${m.key}`;
                                            const isCurrent = m.key === currentMonthKey;
                                            const isBest = m.key === bestMonthKey;
                                            // History is newest first; a running month is partial, so it gets no comparison.
                                            const prev = history[i + 1];
                                            const mom = !isCurrent && prev && prev.meetings > 0
                                                ? Math.round(((m.meetings - prev.meetings) / prev.meetings) * 100)
                                                : null;
                                            return (
                                                <tr key={m.key} className={cx(isCurrent && s.rowCurrent, !isCurrent && isBest && s.rowBest)}>
                                                    <td className={s.monthCell}>
                                                        {monthLabel(m.key)}
                                                        {isCurrent && <span className={cx(s.tag, s.tagNow)}>en cours</span>}
                                                        {isBest && <span className={cx(s.tag, s.tagBest)}><Trophy size={11} /> meilleur mois</span>}
                                                    </td>
                                                    <td>
                                                        <div className={s.meetCell}>
                                                            <span className={cx(s.meetValue, s.num)}>{m.meetings}</span>
                                                            <div className={s.meetTrack}>
                                                                <div className={s.meetFill} style={{ width: `${(m.meetings / maxMeetings) * 100}%` }} />
                                                            </div>
                                                            <span className={s.meetChip}>{mom !== null && <Delta value={mom} />}</span>
                                                        </div>
                                                    </td>
                                                    <td className={cx(s.right, s.num, s.hideSm)}>{m.calls.toLocaleString("fr-FR")}</td>
                                                    <td className={cx(s.right, s.num, s.hideSm)}>{m.contactsTouched.toLocaleString("fr-FR")}</td>
                                                    <td className={s.right}>
                                                        <div className={s.rowActions}>
                                                            <button type="button" className={cx(s.btn, s.iconOnly)} title="Voir l'aperçu" aria-label={`Aperçu ${monthLabel(m.key)}`} onClick={() => previewMonth(m.key)}>
                                                                <Eye size={14} />
                                                            </button>
                                                            <button type="button" className={cx(s.btn, s.iconOnly)} title="Télécharger le PDF" aria-label={`PDF ${monthLabel(m.key)}`}
                                                                disabled={busy === pdfId} onClick={() => runPdf(r, pdfId)}>
                                                                {busy === pdfId ? <Loader2 size={14} className={s.spin} /> : <Download size={14} />}
                                                            </button>
                                                            <button type="button" className={cx(s.btn, s.iconOnly, copied === shareId && s.btnDone)} title="Copier un lien de partage" aria-label={`Lien ${monthLabel(m.key)}`}
                                                                disabled={busy === shareId} onClick={() => runShare(r, shareId)}>
                                                                {busy === shareId ? <Loader2 size={14} className={s.spin} /> : copied === shareId ? <Check size={14} /> : <Link2 size={14} />}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    {history.length > 1 && (
                                        <tfoot>
                                            <tr>
                                                <td>Total</td>
                                                <td><span className={s.num}>{totals.meetings}</span></td>
                                                <td className={cx(s.right, s.num, s.hideSm)}>{totals.calls.toLocaleString("fr-FR")}</td>
                                                <td className={cx(s.right, s.num, s.hideSm)} title="Somme des contacts touchés chaque mois">{totals.touched.toLocaleString("fr-FR")}</td>
                                                <td />
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}
