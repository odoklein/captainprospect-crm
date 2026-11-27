"use client";

// Client portal home (app/client/portal): « La lettre de la semaine ». Built for
// someone who logs in once a week: what the mission produced, not what the
// team did. Pure view over GET /api/client/letter (lib/client-portal/letter.ts
// holds every rule); the page owns fetching.
//
// Two clocks, said on the page: confirmed RDV are live, every other figure is
// as of the last Monday 06:00. Every figure says how it is counted on hover.

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Database, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPercent, paceLabel, type PaceVerdict } from "@/lib/missions/pulse";
import { formatEuros, formatMultiple, type ClientLetter, type LetterUpcomingMeeting } from "@/lib/client-portal/letter";
import { Shimmer } from "./AccueilUI";
import { DEFINED, Definition } from "@/components/client/letter/Definition";
import { DispositionChart, FunnelChart, ReasonsChart, WeeklyChart } from "@/components/client/letter/LetterCharts";
import { AssumptionsForm } from "@/components/client/letter/AssumptionsForm";

export interface ClientHomeViewProps {
    letter: ClientLetter;
    userName: string;
    showCallHistory: boolean;
    showDatabase: boolean;
    onAssumptionsSaved: () => void;
}

const fr = (n: number) => n.toLocaleString("fr-FR");
const CARD = "rounded-[18px] border border-line bg-surface p-5 sm:p-6 min-w-0";
const EYEBROW = "font-mono text-[11px] sm:text-xs uppercase tracking-[0.14em]";

const VERDICT_TONE: Partial<Record<PaceVerdict, string>> = {
    ahead: "text-success-ink",
    on_track: "text-success-ink",
    reached: "text-success-ink",
    behind: "text-warning-ink",
    ended: "text-warning-ink",
};

export function ClientHomeView({ letter, userName, showCallHistory, showDatabase, onAssumptionsSaved }: ClientHomeViewProps) {
    const asOf = `Arrêté au ${letter.cutoffLabel}.`;
    const since = letter.sinceLabel ? `le ${letter.sinceLabel}` : "le lancement";
    const called = letter.funnel.find((s) => s.key === "called")?.count ?? 0;
    const reached = letter.funnel.find((s) => s.key === "reached")?.count ?? 0;
    const base = letter.funnel.find((s) => s.key === "base")?.count ?? 0;
    const notReached = letter.dispositions.find((d) => d.key === "notReached")?.count ?? 0;
    const neverCalled = Math.max(0, base - called);
    const hasCost = letter.roi.costPerRdv !== null;

    return (
        <div className="mx-auto w-full max-w-[1200px] space-y-6 pb-12 text-ink antialiased sm:space-y-7">
            <LetterHeader letter={letter} userName={userName} />

            <RoiBand letter={letter} since={since} />

            {/* ═══ Chiffres clés ═══ */}
            <section aria-label="Chiffres clés" className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", hasCost ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
                <MonthTile month={letter.month} />
                <Figure
                    label="Décideurs contactés"
                    definition={`Décideurs de votre cible appelés au moins une fois, depuis ${since} jusqu’au ${letter.cutoffLabel}.`}
                    value={fr(called)}
                    note={base ? `sur ${fr(base)} dans votre cible · ${formatPercent(called / base)}` : "Aucune base active pour l’instant"}
                />
                <Figure
                    label="Joignabilité"
                    definition={`Part des décideurs appelés qu’on a eus en ligne au moins une fois (tout sauf pas de réponse, barrage, numéro invalide). ${asOf}`}
                    value={called ? formatPercent(reached / called) : "—"}
                    note={`${fr(reached)} ${reached > 1 ? "décideurs ont décroché" : "décideur a décroché"}`}
                />
                {hasCost && (
                    <Figure
                        label="Coût par RDV confirmé"
                        definition={`Montant HT facturé pour ${letter.roi.investedLabel}, divisé par les RDV confirmés sur ces mêmes mois. ${asOf}`}
                        value={formatEuros(letter.roi.costPerRdv as number)}
                        note={`${formatEuros(letter.roi.invested as number)} ÷ ${letter.roi.confirmedInvoiced} RDV · ${letter.roi.investedLabel}`}
                    />
                )}
            </section>

            {/* ═══ Funnel + dispositions ═══ */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <section aria-labelledby="letter-funnel" className={CARD}>
                    <CardHead id="letter-funnel" title="De votre cible aux rendez-vous" sub={`Depuis ${since}, arrêté au ${letter.cutoffLabel}. À droite, la part de l’étape précédente.`} />
                    <FunnelChart steps={letter.funnel} />
                </section>
                <section aria-labelledby="letter-dispositions" className={CARD}>
                    <CardHead id="letter-dispositions" title={`Ce que sont devenus les ${fr(called)} contactés`} sub={`Le statut actuel de chaque décideur appelé. ${asOf}`} />
                    {called ? (
                        <>
                            <DispositionChart items={letter.dispositions} total={called} />
                            {(notReached > 0 || neverCalled > 0) && (
                                <p className="mt-4 text-sm text-ink-3">
                                    {notReached > 0 && <>{fr(notReached)} {notReached > 1 ? "décideurs appelés restent" : "décideur appelé reste"} à joindre. </>}
                                    {neverCalled > 0 && <>{fr(neverCalled)} {neverCalled > 1 ? "décideurs de votre cible n’ont" : "décideur de votre cible n’a"} pas encore été {neverCalled > 1 ? "appelés" : "appelé"}.</>}
                                </p>
                            )}
                        </>
                    ) : (
                        <Empty>Aucun décideur appelé à la date de la lettre.</Empty>
                    )}
                </section>
            </div>

            {/* ═══ Weekly RDV + market ═══ */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <section aria-labelledby="letter-weeks" className={CARD}>
                    <CardHead id="letter-weeks" title="RDV confirmés par semaine" sub="Depuis le lancement, par semaine de confirmation. La semaine en cours se remplit en direct, dès qu’un RDV est confirmé." />
                    {letter.weeks.length ? <WeeklyChart weeks={letter.weeks} letterWeekStart={letter.week.start} /> : <Empty>La mission n’a pas encore commencé.</Empty>}
                </section>
                <section aria-labelledby="letter-market" className={CARD}>
                    <CardHead
                        id="letter-market"
                        title="Ce que le marché vous dit"
                        sub={letter.refusals.total
                            ? `Les ${fr(letter.refusals.total)} décideurs qui ont décliné, par motif noté par l’équipe au moment de l’appel. ${asOf}`
                            : `Les motifs de refus, notés par l’équipe au moment de l’appel. ${asOf}`}
                    />
                    {letter.refusals.total ? <ReasonsChart refusals={letter.refusals} /> : <Empty>Aucun refus enregistré à cette date.</Empty>}
                </section>
            </div>

            <UpcomingMeetings meetings={letter.upcoming} total={letter.upcomingTotal} />

            {/* ═══ Vos hypothèses ═══ */}
            <section id="hypotheses" aria-labelledby="letter-assumptions" className={cn(CARD, "scroll-mt-24 border-dashed")}>
                <CardHead
                    id="letter-assumptions"
                    title="Vos hypothèses"
                    sub="Deux chiffres que vous seul connaissez. Ils servent uniquement à estimer le pipeline généré par les RDV tenus."
                />
                <AssumptionsForm value={letter.assumptions} onSaved={onAssumptionsSaved} />
            </section>

            {(showCallHistory || showDatabase) && (
                <nav aria-label="Pour aller plus loin" className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {showCallHistory && (
                        <Shortcut href="/client/portal/calls" icon={<PhoneCall className="h-[18px] w-[18px]" aria-hidden />} title="Historique des appels" hint="Le détail des appels passés par l’équipe." />
                    )}
                    {showDatabase && (
                        <Shortcut href="/client/portal/database" icon={<Database className="h-[18px] w-[18px]" aria-hidden />} title="Base de données" hint="Les entreprises et contacts suivis par l’équipe." />
                    )}
                </nav>
            )}

            <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-xs text-ink-3 sm:text-sm">
                <span className="inline-flex items-center gap-2"><LiveDot />RDV confirmés en direct</span>
                <span>Le reste arrêté au {letter.cutoffLabel}</span>
                <span>Mêmes définitions que votre manager de mission</span>
                <span>Aucun appel individuel n’est affiché sur cette page</span>
            </footer>
        </div>
    );
}

// ── Header ────────────────────────────────────────────────────────────────

function LetterHeader({ letter, userName }: { letter: ClientLetter; userName: string }) {
    const missionLine = [
        `Bonjour ${userName}`,
        letter.missions.length === 1 ? letter.missions[0].name : `${letter.missions.length} missions`,
        letter.sdrCount ? `${letter.sdrCount} ${letter.sdrCount > 1 ? "SDR dédiés" : "SDR dédié"}` : null,
        letter.sinceLabel ? `depuis le ${letter.sinceLabel}` : null,
    ].filter(Boolean).join(" · ");
    return (
        <header className="flex flex-col gap-5 pt-1 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
            <div className="min-w-0 max-w-4xl">
                <p className={cn(EYEBROW, "text-accent-soft-ink")}>
                    Lettre du lundi · semaine {letter.week.number} · {letter.week.rangeLabel}
                </p>
                <Definition
                    text={`RDV confirmés par votre manager de mission ${letter.week.rangeLabel} (date de confirmation). Compté en direct : un RDV annulé depuis n’y figure plus.`}
                    className="mt-3 rounded-xl"
                >
                    <h1 className="font-display text-[34px] font-semibold leading-[1.04] tracking-[-0.04em] text-ink text-balance sm:text-5xl lg:text-[58px]">
                        {letter.headline.title}
                    </h1>
                </Definition>
                {letter.headline.detail && <p className="mt-3 text-base text-ink-2 sm:text-lg">{letter.headline.detail}</p>}
                <p className="mt-3 text-sm text-ink-3">{missionLine}</p>
            </div>
            <div className="shrink-0 space-y-1 text-sm text-ink-3 lg:text-right">
                <p className="inline-flex items-center gap-2 font-semibold text-success-ink lg:justify-end"><LiveDot />RDV confirmés : en direct</p>
                <p>Le reste arrêté au {letter.cutoffLabel}</p>
            </div>
        </header>
    );
}

function LiveDot() {
    return (
        <span className="relative inline-flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-50 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
    );
}

// ── ROI band ──────────────────────────────────────────────────────────────

function RoiBand({ letter, since }: { letter: ClientLetter; since: string }) {
    const { roi, assumptions } = letter;
    const asOf = `Arrêté au ${letter.cutoffLabel}.`;
    const ready = roi.pipeline !== null;
    const rate = assumptions.meetingToOppRate !== null ? formatPercent(assumptions.meetingToOppRate) : null;
    const deal = assumptions.avgDealValue !== null ? formatEuros(assumptions.avgDealValue) : null;
    const comparable = roi.invested !== null && roi.pipelineInvoiced !== null;
    const barMax = comparable ? Math.max(roi.invested as number, roi.pipelineInvoiced as number, 1) : 1;
    const heldDef = `RDV confirmés qui ont eu lieu : un retour le dit, ou le délai de 48 h pour signaler une absence est passé sans signalement (même règle que la facturation). ${asOf}`;

    return (
        <section aria-labelledby="letter-roi" className="rounded-3xl bg-inverse p-5 text-inverse-ink sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h2 id="letter-roi" className="font-display text-xl font-semibold tracking-[-0.02em] sm:text-[22px]">
                    Ce que la mission a produit depuis {since}
                </h2>
                <a href="#hypotheses" className="rounded text-sm text-inverse-ink-2 underline decoration-inverse-ink-3 underline-offset-4 hover:text-inverse-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                    {ready ? "Vos hypothèses · les modifier" : "Renseigner vos hypothèses"}
                </a>
            </div>

            <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-12">
                <div className="min-w-0 flex-1 space-y-5">
                    {comparable ? (
                        <>
                            <BandBar
                                label={`Investi · facturé pour ${roi.investedLabel}`}
                                definition={`Montants HT facturés pour ${roi.investedLabel} : factures validées, envoyées ou payées, avoirs déduits. ${asOf}`}
                                value={formatEuros(roi.invested as number)}
                                width={(roi.invested as number) / barMax}
                                fill="bg-inverse-ink-3"
                            />
                            <BandBar
                                label={`Pipeline généré · RDV tenus de ${roi.investedLabel}`}
                                definition={`RDV tenus de ${roi.investedLabel} × votre taux de passage en opportunité × votre panier moyen. Une estimation fondée sur vos hypothèses, pas un chiffre d’affaires. ${asOf}`}
                                value={formatEuros(roi.pipelineInvoiced as number)}
                                width={(roi.pipelineInvoiced as number) / barMax}
                                fill="bg-accent"
                            />
                            <p className="text-sm text-inverse-ink-2">
                                {roi.heldInvoiced} {roi.heldInvoiced > 1 ? "RDV tenus" : "RDV tenu"} × {rate} qui deviennent une opportunité × {deal} de panier moyen.
                                {roi.heldOutsideInvoices > 0 && roi.pipeline !== null && (
                                    <> En plus, {roi.heldOutsideInvoices} {roi.heldOutsideInvoices > 1 ? "RDV tenus" : "RDV tenu"} hors des mois facturés, soit {formatEuros(roi.pipeline - (roi.pipelineInvoiced as number))} de pipeline non compté dans le multiple.</>
                                )}
                            </p>
                        </>
                    ) : ready ? (
                        <>
                            <BandBar
                                label={`Pipeline généré · ${roi.held} ${roi.held > 1 ? "RDV tenus" : "RDV tenu"}`}
                                definition={`RDV tenus × votre taux de passage en opportunité × votre panier moyen. Une estimation fondée sur vos hypothèses, pas un chiffre d’affaires. ${asOf}`}
                                value={formatEuros(roi.pipeline as number)}
                                width={roi.pipeline ? 1 : 0}
                                fill="bg-accent"
                            />
                            <p className="text-sm text-inverse-ink-2">
                                {roi.held} {roi.held > 1 ? "RDV tenus" : "RDV tenu"} × {rate} qui deviennent une opportunité × {deal} de panier moyen.
                                {" "}Aucune facture n’est encore émise pour cette mission : le coût n’est pas connu, le multiple sera calculé dès la première facture.
                            </p>
                        </>
                    ) : (
                        <div className="space-y-3">
                            <Definition text={heldDef} className="max-w-md rounded-xl">
                                <div className="flex items-baseline gap-3">
                                    <span className="font-display text-6xl font-semibold leading-none tracking-[-0.05em] tabular-nums">{roi.held}</span>
                                    <span className={cn("text-sm text-inverse-ink-2", DEFINED, "decoration-inverse-ink-3")}>{roi.held > 1 ? "RDV tenus" : "RDV tenu"} depuis {since}</span>
                                </div>
                            </Definition>
                            <p className="max-w-xl text-sm text-inverse-ink-2">
                                Pour chiffrer le pipeline qu’ils représentent, indiquez votre panier moyen et la part de RDV tenus qui deviennent une opportunité.
                                {roi.invested === null && " Aucune facture n’est encore émise : le coût de la mission n’est pas encore connu."}
                            </p>
                            {roi.invested !== null && (
                                <Definition text={`Montants HT facturés pour ${roi.investedLabel} : factures validées, envoyées ou payées, avoirs déduits. ${asOf}`} className="max-w-md rounded-xl">
                                    <p className="text-sm text-inverse-ink-2">
                                        <span className={cn(DEFINED, "decoration-inverse-ink-3")}>Investi, facturé pour {roi.investedLabel}</span>
                                        {" "}<span className="font-mono text-base tabular-nums text-inverse-ink">{formatEuros(roi.invested)}</span>
                                    </p>
                                </Definition>
                            )}
                        </div>
                    )}
                    {letter.heldPending > 0 && (
                        <p className="text-sm text-inverse-ink-2">
                            {letter.heldPending} {letter.heldPending > 1 ? "RDV passés juste avant lundi ne sont" : "RDV passé juste avant lundi n’est"} pas encore {letter.heldPending > 1 ? "comptés" : "compté"} :
                            une absence peut être signalée jusqu’à 48 h après le RDV. Ils entreront dans la lettre de lundi prochain.
                        </p>
                    )}
                </div>

                {roi.multiple !== null ? (
                    <Definition text={`Pipeline des mois facturés ÷ montant facturé pour ces mêmes mois. ${asOf}`} className="shrink-0 rounded-xl lg:w-[240px]">
                        <p className="font-display text-[64px] font-semibold leading-[0.85] tracking-[-0.06em] text-inverse-ink tabular-nums sm:text-[96px]">{formatMultiple(roi.multiple)}</p>
                        <p className={cn("mt-3 text-sm text-inverse-ink-2", DEFINED, "decoration-inverse-ink-3")}>le pipeline rapporté à ce qui vous a été facturé</p>
                    </Definition>
                ) : ready ? (
                    <Definition text={heldDef} className="shrink-0 rounded-xl lg:w-[240px]">
                        <p className="font-display text-[64px] font-semibold leading-[0.85] tracking-[-0.06em] tabular-nums sm:text-[88px]">{roi.held}</p>
                        <p className={cn("mt-3 text-sm text-inverse-ink-2", DEFINED, "decoration-inverse-ink-3")}>{roi.held > 1 ? "RDV tenus" : "RDV tenu"} depuis {since}</p>
                    </Definition>
                ) : null}
            </div>
        </section>
    );
}

function BandBar({ label, definition, value, width, fill }: { label: string; definition: string; value: string; width: number; fill: string }) {
    return (
        <Definition text={definition} className="rounded-xl">
            <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4">
                <div className="min-w-0">
                    <p className={cn("text-[13px] text-inverse-ink-2", DEFINED, "decoration-inverse-ink-3")}>{label}</p>
                    <p className="font-mono text-xl tabular-nums sm:text-[22px]">{value}</p>
                </div>
                <div className="h-3 rounded-r-md bg-inverse-raised sm:h-[22px]" aria-hidden>
                    <div className={cn("h-full rounded-r-md", fill, width > 0 && "min-w-[10px]")} style={{ width: `${Math.max(0, Math.min(1, width)) * 100}%` }} />
                </div>
            </div>
        </Definition>
    );
}

// ── Key figures ───────────────────────────────────────────────────────────

function Figure({ label, definition, value, note }: { label: string; definition: string; value: string; note: string }) {
    return (
        <Definition text={definition} className="rounded-[18px]">
            <div className={cn(CARD, "h-full")}>
                <p className={cn("text-sm text-ink-2", DEFINED)}>{label}</p>
                <p className="mt-1 font-display text-[40px] font-semibold leading-[1.15] tracking-[-0.035em] tabular-nums">{value}</p>
                <p className="text-sm text-ink-3">{note}</p>
            </div>
        </Definition>
    );
}

const todayLabel = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });

function MonthTile({ month }: { month: ClientLetter["month"] }) {
    const { pace, target, confirmed } = month;
    const expected = pace.expected !== null ? Math.round(pace.expected) : null;
    const verdict =
        pace.verdict === "no_target"
            ? "Aucun objectif chiffré sur la mission"
            : pace.verdict === "on_track" || pace.verdict === "ahead" || pace.verdict === "behind"
                ? `${paceLabel(pace.verdict)} · ${expected} ${expected !== null && expected > 1 ? "attendus" : "attendu"} au ${todayLabel.format(new Date())}`
                : paceLabel(pace.verdict);
    const definition = target
        ? `RDV confirmés en ${month.label}, en direct. Objectif du mois : l’objectif de la mission réparti sur sa durée, soit ${target} en ${month.label}. Le repère montre où en serait un rythme régulier.`
        : `RDV confirmés en ${month.label}, en direct. La mission n’a pas d’objectif chiffré.`;
    return (
        <Definition text={definition} className="rounded-[18px]">
            <div className={cn(CARD, "h-full")}>
                <p className={cn("text-sm text-ink-2 first-letter:uppercase", DEFINED)}>RDV confirmés · {month.label}</p>
                <p className="mt-1 font-display text-[40px] font-semibold leading-[1.15] tracking-[-0.035em] tabular-nums">
                    {confirmed}
                    {target && <span className="ml-1.5 text-lg font-medium text-ink-3">/ {target}</span>}
                </p>
                {target && (
                    <div className="relative mt-2 h-2.5 rounded-full bg-surface-3" aria-hidden>
                        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.min(100, (confirmed / target) * 100)}%` }} />
                        {expected !== null && expected > 0 && (
                            <div className="absolute -inset-y-1 w-0.5 rounded-full bg-ink" style={{ left: `${Math.min(100, (expected / target) * 100)}%` }} />
                        )}
                    </div>
                )}
                <p className={cn("mt-2 text-sm font-semibold", VERDICT_TONE[pace.verdict] ?? "text-ink-3")}>{verdict}</p>
            </div>
        </Definition>
    );
}

// ── Upcoming meetings ─────────────────────────────────────────────────────

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const dayKey = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" });

function meetingDay(iso: string): string {
    const at = new Date(iso);
    const key = dayKey.format(at);
    const now = new Date();
    if (key === dayKey.format(now)) return "Aujourd’hui";
    if (key === dayKey.format(new Date(now.getTime() + 86_400_000))) return "Demain";
    const label = dayFmt.format(at);
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function UpcomingMeetings({ meetings, total }: { meetings: LetterUpcomingMeeting[]; total: number }) {
    return (
        <section aria-labelledby="letter-upcoming" className={CARD}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id="letter-upcoming" className="font-display text-xl font-semibold tracking-[-0.02em]">
                    {total > 0 ? `Vos ${total > meetings.length ? meetings.length : total} prochains rendez-vous` : "Vos prochains rendez-vous"}
                </h2>
                <Link href="/client/portal/meetings" className="rounded text-sm font-semibold text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                    Tous les rendez-vous
                </Link>
            </div>
            <p className="mb-3 text-sm text-ink-3">Confirmés par votre manager de mission, en direct.</p>
            {meetings.length === 0 ? (
                <Empty>Aucun rendez-vous confirmé à venir pour l’instant.</Empty>
            ) : (
                <ul>
                    {meetings.map((m) => (
                        <li key={m.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-2 border-t border-line-subtle py-3.5 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center">
                            <div>
                                <p className="text-sm font-semibold">{m.date ? meetingDay(m.date) : "Date à fixer"}</p>
                                {m.date && <p className="font-mono text-sm tabular-nums text-ink-3">{timeFmt.format(new Date(m.date))}</p>}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate font-semibold">{m.person}</p>
                                <p className="truncate text-sm text-ink-3">{[m.title, m.company].filter(Boolean).join(" · ")}</p>
                            </div>
                            <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto sm:justify-end">
                                {m.format && <span className="inline-flex h-6 items-center rounded-full bg-success-soft px-2.5 text-xs font-semibold text-success-ink">{m.format}</span>}
                                <Link
                                    href={`/client/portal/meetings?rdv=${encodeURIComponent(m.id)}`}
                                    className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-fg hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                >
                                    {m.hasFiche ? "Fiche de préparation" : "Détail du RDV"}
                                </Link>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {total > meetings.length && (
                <p className="border-t border-line-subtle pt-3 text-sm text-ink-3">+ {total - meetings.length} autres RDV confirmés à venir</p>
            )}
        </section>
    );
}

// ── Small parts ───────────────────────────────────────────────────────────

function CardHead({ id, title, sub }: { id: string; title: string; sub: string }) {
    return (
        <div className="mb-5">
            <h2 id={id} className="font-display text-xl font-semibold tracking-[-0.02em]">{title}</h2>
            <p className="mt-1 text-sm text-ink-3">{sub}</p>
        </div>
    );
}

function Empty({ children }: { children: ReactNode }) {
    return <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">{children}</p>;
}

function Shortcut({ href, icon, title, hint }: { href: string; icon: ReactNode; title: string; hint: string }) {
    return (
        <Link href={href} className="group flex items-center gap-4 rounded-[18px] border border-line bg-surface p-5 transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-ink-2">{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-ink-3">{hint}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
    );
}

export function ClientHomeSkeleton() {
    return (
        <div className="mx-auto w-full max-w-[1200px] space-y-6 pb-12" aria-busy="true" aria-label="Chargement de la lettre de la semaine">
            <div className="space-y-3 pt-1">
                <Shimmer className="h-4 w-72 max-w-full rounded-md" />
                <Shimmer className="h-14 w-[36rem] max-w-full rounded-xl" />
                <Shimmer className="h-4 w-80 max-w-full rounded-md" />
            </div>
            <div className="h-[260px] rounded-3xl bg-inverse/90 motion-safe:animate-pulse" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[0, 1, 2, 3].map((i) => <Shimmer key={i} className="h-[150px] rounded-[18px]" />)}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Shimmer className="h-[320px] rounded-[18px]" />
                <Shimmer className="h-[320px] rounded-[18px]" />
            </div>
        </div>
    );
}
