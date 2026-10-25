"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, BarChart3, Clock, Eye, Inbox, MailWarning, Reply, RotateCw, Send, Workflow, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Callout, EmptyState, Input, KpiCard, Section, SegmentedControl, Select, Skeleton, Tooltip } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/recipes";
import { EmailHubPage } from "@/components/email/EmailHubPage";
import { formatDayLabel, formatDuration, formatInt, formatPercent } from "@/components/email/dashboard/format";
import type { MetricRates, MetricTotals } from "@/components/email/dashboard/types";

// ============================================
// EMAIL ANALYTICS (/manager/emails/analytics)
// Computed from the Email table by /api/email/analytics (never EmailAnalyticsDaily).
// Filters in the URL: ?period=7|30|90|custom&from=&to=&mailbox=&mission=
// Every breakdown row opens the matching slice of Envoyés.
// ============================================

type Period = "7" | "30" | "90" | "custom";
type BreakdownKey = "mailbox" | "mission" | "sdr" | "sequence" | "template";

interface BreakdownRow {
    id: string;
    label: string;
    hint?: string | null;
    sent: number;
    tracked: number;
    opened: number;
    replied: number;
    bounced: number;
    failed: number;
}

interface AnalyticsData {
    period: { preset: Period; from: string; to: string; days: number };
    totals: MetricTotals;
    rates: MetricRates;
    daily: { date: string; sent: number; opened: number; clicked: number; replied: number; bounced: number; failed: number; inbound: number }[];
    breakdowns: Record<BreakdownKey, BreakdownRow[]>;
    responseTime: { medianMinutes: number | null; samples: number };
    sequences: { enrolled: number; completed: number; replied: number; active: number };
    truncated: boolean;
    context: { outboundEver: number; trackedEver: number; mailboxCount: number };
    options: {
        mailboxes: { id: string; label: string; hint: string | null; inactive: boolean }[];
        missions: { id: string; label: string; hint: string | null }[];
    };
}

const METRICS = {
    sent: { label: "Envoyés", color: "var(--brand-primary-600)", unit: "envois", empty: "Aucun envoi" },
    replied: { label: "Réponses", color: "var(--ds-success)", unit: "réponses", empty: "Aucune réponse" },
    bounced: { label: "Rebonds", color: "var(--ds-warning)", unit: "rebonds", empty: "Aucun rebond" },
    inbound: { label: "Reçus", color: "var(--ds-info)", unit: "emails reçus", empty: "Aucun email reçu" },
} as const;
type ChartMetric = keyof typeof METRICS;

const BREAKDOWNS: { key: BreakdownKey; label: string; param: string }[] = [
    { key: "mailbox", label: "Boîtes", param: "mailbox" },
    { key: "mission", label: "Missions", param: "mission" },
    { key: "sdr", label: "Expéditeurs", param: "sdr" },
    { key: "sequence", label: "Séquences", param: "sequence" },
    { key: "template", label: "Templates", param: "template" },
];

const parisDate = (iso: string) => new Date(iso).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });

export default function AnalyticsView() {
    return (
        <Suspense fallback={<EmailHubPage title="Analytics"><PageSkeleton /></EmailHubPage>}>
            <AnalyticsInner />
        </Suspense>
    );
}

function AnalyticsInner() {
    const router = useRouter();
    const pathname = usePathname();
    const sp = useSearchParams();

    const period = (["7", "30", "90", "custom"].includes(sp.get("period") ?? "") ? sp.get("period") : "30") as Period;
    const from = sp.get("from");
    const to = sp.get("to");
    const mailbox = sp.get("mailbox");
    const mission = sp.get("mission");

    const setParams = useCallback(
        (patch: Record<string, string | null>) => {
            const next = new URLSearchParams(sp.toString());
            for (const [k, v] of Object.entries(patch)) {
                if (!v || (k === "period" && v === "30")) next.delete(k);
                else next.set(k, v);
            }
            const qs = next.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        },
        [sp, router, pathname],
    );

    const qs = useMemo(() => {
        const p = new URLSearchParams({ period });
        if (period === "custom" && from && to) {
            p.set("from", from);
            p.set("to", to);
        }
        if (mailbox) p.set("mailboxId", mailbox);
        if (mission) p.set("missionId", mission);
        return p.toString();
    }, [period, from, to, mailbox, mission]);

    const [data, setData] = useState<AnalyticsData | null>(null);
    const [attempt, setAttempt] = useState(0);
    // The key each settled request answered: loading = the current key has not settled yet.
    const [settled, setSettled] = useState<{ key: string; error: string | null } | null>(null);
    const requestKey = `${qs}|${attempt}`;

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/email/analytics?${qs}`, { cache: "no-store" })
            .then(async (r) => {
                const json = await r.json().catch(() => null);
                if (!r.ok || !json?.success) throw new Error(json?.error || `Erreur ${r.status}`);
                return json.data as AnalyticsData;
            })
            .then((d) => {
                if (cancelled) return;
                setData(d);
                setSettled({ key: requestKey, error: null });
            })
            .catch((e: unknown) => {
                if (!cancelled) setSettled({ key: requestKey, error: e instanceof Error ? e.message : "Erreur de connexion" });
            });
        return () => {
            cancelled = true;
        };
    }, [qs, requestKey]);
    const loading = settled?.key !== requestKey;
    const error = settled?.key === requestKey ? settled.error : null;

    const today = new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
    const filtersActive = period !== "30" || !!mailbox || !!mission;

    const toolbar = (
        <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
                ariaLabel="Période"
                size="sm"
                value={period}
                onChange={(p) =>
                    p === "custom"
                        ? setParams({ period: p, from: from ?? (data ? parisDate(data.period.from) : today), to: to ?? today })
                        : setParams({ period: p, from: null, to: null })
                }
                options={[
                    { value: "7", label: "7 jours" },
                    { value: "30", label: "30 jours" },
                    { value: "90", label: "90 jours" },
                    { value: "custom", label: "Personnalisée" },
                ]}
            />
            {period === "custom" && (
                <div className="flex items-center gap-1.5">
                    <Input size="sm" type="date" aria-label="Du" value={from ?? ""} max={to ?? today} onChange={(e) => setParams({ from: e.target.value || null })} className="w-[150px]" />
                    <span className="text-xs text-ink-4">au</span>
                    <Input size="sm" type="date" aria-label="Au" value={to ?? ""} min={from ?? undefined} max={today} onChange={(e) => setParams({ to: e.target.value || null })} className="w-[150px]" />
                </div>
            )}
            <div className="w-full sm:w-60">
                <Select
                    searchable
                    placeholder="Toutes les boîtes"
                    value={mailbox ?? ""}
                    onChange={(v) => setParams({ mailbox: v || null })}
                    options={[
                        { value: "", label: "Toutes les boîtes" },
                        ...(data?.options.mailboxes ?? []).map((m) => ({ value: m.id, label: m.inactive ? `${m.label} (désactivée)` : m.label })),
                    ]}
                />
            </div>
            <div className="w-full sm:w-60">
                <Select
                    searchable
                    placeholder="Toutes les missions"
                    value={mission ?? ""}
                    onChange={(v) => setParams({ mission: v || null })}
                    options={[{ value: "", label: "Toutes les missions" }, ...(data?.options.missions ?? []).map((m) => ({ value: m.id, label: m.hint ? `${m.label} · ${m.hint}` : m.label }))]}
                />
            </div>
            {filtersActive && (
                <Button variant="ghost" size="sm" leftIcon={<X className="size-3.5" />} onClick={() => router.replace(pathname, { scroll: false })}>
                    Réinitialiser
                </Button>
            )}
        </div>
    );

    return (
        <EmailHubPage title="Analytics" description="Envois, ouvertures, réponses et rebonds des emails envoyés depuis le CRM, jour par jour.">
            <div className="space-y-5">
                {toolbar}
                {error && !data ? (
                    <Callout
                        tone="danger"
                        title="Impossible de charger les statistiques"
                        action={<Button size="xs" variant="secondary" leftIcon={<RotateCw className="size-3.5" />} onClick={() => setAttempt((a) => a + 1)}>Réessayer</Button>}
                    >
                        {error}
                    </Callout>
                ) : !data ? (
                    <PageSkeleton />
                ) : (
                    <div className={cn("space-y-5", loading && "opacity-60 transition-opacity")} aria-busy={loading || undefined}>
                        {error && (
                            <Callout tone="warning" title="Données peut-être obsolètes" action={<Button size="xs" variant="secondary" onClick={() => setAttempt((a) => a + 1)}>Réessayer</Button>}>
                                {error}
                            </Callout>
                        )}
                        <AnalyticsBody data={data} />
                    </div>
                )}
            </div>
        </EmailHubPage>
    );
}

function PageSkeleton() {
    return (
        <div className="space-y-5" aria-busy aria-label="Chargement des statistiques">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-card" />)}
            </div>
            <Skeleton className="h-[360px] rounded-card" />
            <Skeleton className="h-[300px] rounded-card" />
        </div>
    );
}

function AnalyticsBody({ data }: { data: AnalyticsData }) {
    const { totals: t, rates: r } = data;
    const range = `from=${parisDate(data.period.from)}&to=${parisDate(data.period.to)}`;
    const noTracking = t.tracked === 0;

    if (data.context.outboundEver === 0 && t.inbound === 0) {
        return (
            <EmptyState
                icon={BarChart3}
                title="Pas encore de données d'envoi"
                description="Les statistiques se remplissent avec les emails envoyés depuis le CRM : écran d'appel (résultat « Envoie mail »), réponses depuis la Réception et séquences. Les campagnes ReachInbox ont leurs propres chiffres dans l'onglet Campagnes."
                action={
                    <Link href="/manager/emails/campaigns" className={cn("rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 hover:border-line-strong hover:text-ink", FOCUS_RING)}>
                        Voir les campagnes
                    </Link>
                }
            />
        );
    }

    return (
        <>
            {t.sent === 0 && (
                <Callout tone="info" title="Aucun email envoyé depuis le CRM sur cette période">
                    Seuls les emails reçus sont comptés ci-dessous. Les envois passent surtout par ReachInbox, dont les chiffres sont dans{" "}
                    <Link href="/manager/emails/campaigns" className="font-semibold underline underline-offset-2">Campagnes</Link>.
                </Callout>
            )}
            {data.truncated && (
                <Callout tone="warning" title="Période très chargée">
                    Plus de 20 000 emails sur la période : les chiffres affichés sont un minimum. Réduisez la période pour un décompte exact.
                </Callout>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                <KpiCard label="Envoyés" icon={Send} value={formatInt(t.sent)} hint={t.failed ? `${formatInt(t.failed)} échec${t.failed > 1 ? "s" : ""}` : `${formatInt(t.delivered)} délivrés`} href={`/manager/emails/sent?${range}`} />
                <KpiCard
                    label="Taux de réponse"
                    icon={Reply}
                    tone="success"
                    value={formatPercent(r.replyRate)}
                    hint={`${formatInt(t.replied)} réponse${t.replied > 1 ? "s" : ""}`}
                    href={`/manager/emails/sent?status=REPLIED&${range}`}
                />
                <KpiCard
                    label="Taux d'ouverture"
                    icon={Eye}
                    tone="info"
                    value={
                        noTracking ? (
                            <Tooltip content="Aucun email de la période n'avait de pixel de suivi : l'ouverture n'est pas mesurable.">
                                <span className="cursor-help">—</span>
                            </Tooltip>
                        ) : (
                            formatPercent(r.openRate)
                        )
                    }
                    hint={noTracking ? "Suivi inactif" : `${formatInt(t.opened)} / ${formatInt(t.tracked)} suivis · ${formatPercent(r.clickRate)} de clics`}
                />
                <KpiCard label="Rebonds" icon={MailWarning} tone="warning" value={formatInt(t.bounced)} hint={`${formatPercent(r.bounceRate)} des envois`} href={`/manager/emails/sent?status=BOUNCED&${range}`} />
                <KpiCard
                    label="Délai de réponse"
                    icon={Clock}
                    tone="neutral"
                    value={formatDuration(data.responseTime.medianMinutes)}
                    hint={data.responseTime.samples ? `médiane sur ${formatInt(data.responseTime.samples)} réponse${data.responseTime.samples > 1 ? "s" : ""}` : "Aucune réponse mesurable"}
                />
                <KpiCard label="Emails reçus" icon={Inbox} tone="neutral" value={formatInt(t.inbound)} hint="Réponses et messages entrants" href="/manager/emails/inbox" />
            </div>

            {noTracking && t.sent > 0 && (
                <Callout tone="neutral" title="Ouvertures et clics non mesurés">
                    Aucun email de la période ne contenait de pixel de suivi (désactivé sur la boîte, la séquence ou par la variable EMAIL_TRACKING_ENABLED). Les réponses et rebonds, eux, sont toujours comptés.
                </Callout>
            )}

            <TrendChart daily={data.daily} />

            <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
                <BreakdownSection data={data} range={range} />
                <Section title="Séquences" icon={Workflow} subtitle="Inscriptions sur la période">
                    <dl className="grid grid-cols-2 gap-3">
                        {[
                            { label: "Inscrits", value: data.sequences.enrolled },
                            { label: "En cours", value: data.sequences.active },
                            { label: "Terminés", value: data.sequences.completed },
                            { label: "Ont répondu", value: data.sequences.replied },
                        ].map((x) => (
                            <div key={x.label} className="rounded-panel border border-line bg-surface-2 px-3 py-2.5">
                                <dt className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">{x.label}</dt>
                                <dd className="mt-0.5 text-lg font-bold tabular-nums text-ink">{formatInt(x.value)}</dd>
                            </div>
                        ))}
                    </dl>
                    <Link href="/manager/emails/sequences" className={cn("mt-4 inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline", FOCUS_RING, "rounded")}>
                        Gérer les séquences <ArrowUpRight className="size-3.5" aria-hidden />
                    </Link>
                </Section>
            </div>

            <details className="rounded-panel border border-line bg-surface px-4 py-3 text-xs text-ink-3">
                <summary className="cursor-pointer font-semibold text-ink-2">Comment ces chiffres sont calculés</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>Envoyés : emails sortants du CRM (hors brouillons, en attente et échecs), datés à l&apos;envoi, en heure de Paris.</li>
                    <li>Réponses : email entrant reçu sur la même conversation après l&apos;envoi, ou email marqué « Répondu ».</li>
                    <li>Ouvertures et clics : uniquement sur les emails qui portaient un pixel de suivi ; le taux se calcule sur ces seuls emails.</li>
                    <li>Délai de réponse : médiane du temps entre l&apos;envoi et la première réponse sur la conversation.</li>
                    <li>Les campagnes ReachInbox ne passent pas par ces envois : voir l&apos;onglet Campagnes.</li>
                </ul>
            </details>
        </>
    );
}

function TrendChart({ daily }: { daily: AnalyticsData["daily"] }) {
    const [metric, setMetric] = useState<ChartMetric>("sent");
    const m = METRICS[metric];
    const weekly = daily.length > 45;

    const points = useMemo(() => {
        if (!weekly) return daily.map((d) => ({ label: formatDayLabel(d.date), value: d[metric] }));
        const out: { label: string; value: number }[] = [];
        for (let i = 0; i < daily.length; i += 7) {
            const chunk = daily.slice(i, i + 7);
            out.push({ label: `sem. ${formatDayLabel(chunk[0].date)}`, value: chunk.reduce((n, d) => n + d[metric], 0) });
        }
        return out;
    }, [daily, metric, weekly]);
    const total = points.reduce((n, p) => n + p.value, 0);

    return (
        <Section
            title="Évolution"
            icon={BarChart3}
            subtitle={`${formatInt(total)} ${m.unit} · ${weekly ? "par semaine" : "par jour"}`}
            actions={
                <SegmentedControl
                    ariaLabel="Indicateur du graphique"
                    size="sm"
                    value={metric}
                    onChange={setMetric}
                    options={(Object.keys(METRICS) as ChartMetric[]).map((k) => ({ value: k, label: METRICS[k].label }))}
                />
            }
        >
            {total === 0 ? (
                <p className="flex h-[240px] items-center justify-center rounded-panel border border-dashed border-line text-sm text-ink-3">
                    {m.empty} sur la période.
                </p>
            ) : (
                <div className="h-[280px] w-full" role="img" aria-label={`${m.label} par ${weekly ? "semaine" : "jour"} : ${formatInt(total)} au total`}>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={points} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="22%">
                            <CartesianGrid stroke="var(--ds-line-subtle)" vertical={false} />
                            <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={18} tick={{ fontSize: 11, fill: "var(--ds-ink-4)", fontWeight: 600 }} dy={8} />
                            <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={44} tick={{ fontSize: 11, fill: "var(--ds-ink-4)", fontWeight: 600 }} />
                            <RechartsTooltip
                                cursor={{ fill: "color-mix(in oklab, var(--brand-primary) 6%, transparent)" }}
                                content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const row = payload[0].payload as (typeof points)[number];
                                    return (
                                        <div className="min-w-[140px] rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-overlay">
                                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-4">{row.label}</p>
                                            <p className="flex items-center justify-between gap-3">
                                                <span className="flex items-center gap-1.5 font-semibold text-ink-2">
                                                    <span className="size-2 rounded-sm" style={{ background: m.color }} aria-hidden />
                                                    {m.label}
                                                </span>
                                                <span className="font-black tabular-nums text-ink">{formatInt(row.value)}</span>
                                            </p>
                                        </div>
                                    );
                                }}
                            />
                            <Bar dataKey="value" name={m.label} fill={m.color} radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Section>
    );
}

function BreakdownSection({ data, range }: { data: AnalyticsData; range: string }) {
    const [key, setKey] = useState<BreakdownKey>("mission");
    const def = BREAKDOWNS.find((b) => b.key === key)!;
    const rows = data.breakdowns[key] ?? [];
    const pct = (n: number, d: number) => (d > 0 ? formatPercent(Math.round((n / d) * 1000) / 10) : "—");

    return (
        <Section
            title="Répartition"
            subtitle="Cliquez une ligne pour voir les emails correspondants"
            actions={
                <SegmentedControl
                    ariaLabel="Répartir par"
                    size="sm"
                    value={key}
                    onChange={setKey}
                    options={BREAKDOWNS.map((b) => ({ value: b.key, label: b.label, count: data.breakdowns[b.key]?.length ?? 0 }))}
                />
            }
            flush
        >
            {rows.length === 0 ? (
                <EmptyState variant="inline" icon={BarChart3} title="Aucun envoi sur la période" description="La répartition apparaît dès le premier email envoyé." />
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-[13px]">
                        <thead className="bg-surface-2 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
                            <tr>
                                <th scope="col" className="px-5 py-2.5">{def.label.replace(/s$/, "")}</th>
                                <th scope="col" className="px-3 py-2.5 text-right">Envoyés</th>
                                <th scope="col" className="px-3 py-2.5 text-right">Ouverture</th>
                                <th scope="col" className="px-3 py-2.5 text-right">Réponses</th>
                                <th scope="col" className="px-3 py-2.5 text-right">Rebonds</th>
                                <th scope="col" className="px-3 py-2.5 text-right">Échecs</th>
                                <th scope="col" className="w-10 pr-4"><span className="sr-only">Ouvrir</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line-subtle">
                            {rows.map((row) => {
                                const href = row.id === "__none__" ? null : `/manager/emails/sent?${def.param}=${row.id}&${range}`;
                                const cells = (
                                    <>
                                        <td className="max-w-[280px] px-5 py-2.5">
                                            <p className="truncate font-semibold text-ink">{row.label}</p>
                                            {row.hint && <p className="truncate text-xs text-ink-3">{row.hint}</p>}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-ink">{formatInt(row.sent)}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{row.tracked ? pct(row.opened, row.tracked) : <span className="text-ink-4" title="Non suivi">—</span>}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">
                                            {formatInt(row.replied)} <span className="text-xs text-ink-4">({pct(row.replied, row.sent)})</span>
                                        </td>
                                        <td className={cn("px-3 py-2.5 text-right tabular-nums", row.bounced ? "text-warning-ink" : "text-ink-3")}>{formatInt(row.bounced)}</td>
                                        <td className={cn("px-3 py-2.5 text-right tabular-nums", row.failed ? "text-danger" : "text-ink-3")}>{formatInt(row.failed)}</td>
                                        <td className="pr-4 text-ink-4">{href && <ArrowUpRight className="size-4" aria-hidden />}</td>
                                    </>
                                );
                                return href ? (
                                    <BreakdownLinkRow key={row.id} href={href} label={row.label}>{cells}</BreakdownLinkRow>
                                ) : (
                                    <tr key={row.id}>{cells}</tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Section>
    );
}

/** A table row that navigates (Enter or click) to the filtered Envoyés list. */
function BreakdownLinkRow({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
    const router = useRouter();
    return (
        <tr
            tabIndex={0}
            role="link"
            aria-label={`Voir les emails : ${label}`}
            onClick={() => router.push(href)}
            onKeyDown={(e) => {
                if (e.key === "Enter") router.push(href);
            }}
            className="cursor-pointer outline-none hover:bg-surface-2 focus-visible:bg-primary-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
        >
            {children}
        </tr>
    );
}
