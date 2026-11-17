"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
    AlertCircle, ArrowRight, Ban, CalendarCheck, Check, CheckCircle2, Clock, Crosshair, Flag, Layers, Loader2,
    MessageSquareQuote, Pencil, Rocket, Target, UserRound, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    SALES_CYCLE_LABEL, SECTOR_LABEL, SIZE_LABEL, WEEKDAYS, definedSegments, missingScreens, parseExclusions,
    screenIssues, scriptOpener, type Answers, type ScreenKey,
} from "@/lib/client-onboarding/questionnaire";
import type { MarketResult } from "@/lib/client-onboarding/market";
import type { PortalView } from "@/lib/client-onboarding/service";
import { CARD, FOCUS, formatDay } from "./ui";

const SCREEN_TITLES: Record<ScreenKey, string> = {
    pitch: "Ce que vous vendez", offer: "Votre offre", channels: "Les canaux", referent: "Votre interlocuteur",
    targets: "Vos cibles", exclusions: "Les exclusions", value: "Votre proposition de valeur", objections: "Les objections",
    meetings: "Vos critères de RDV", goals: "La date de lancement", review: "Validation",
};

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/** Total market across the client's segments (each answered from the server cache). */
function useSegmentsTotal(token: string, answers: Answers): { total: number | null; capped: boolean; loading: boolean } {
    const segs = definedSegments(answers).filter((s) => s.sectors.length > 0);
    const key = JSON.stringify(segs.map((s) => [s.sectors, s.sizes, s.regions]));
    const [state, setState] = useState<{ total: number | null; capped: boolean; loading: boolean }>({ total: null, capped: false, loading: segs.length > 0 });
    useEffect(() => {
        let cancelled = false;
        const filters = JSON.parse(key) as [string[], string[], string[]][];
        Promise.all(filters.map(async ([sectors, sizes, regions]) => {
            const res = await fetch(`/api/public/onboarding/${token}/market`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sectors, sizes, regions }),
            });
            const json = await res.json();
            return (json.success ? json.data : null) as MarketResult | null;
        })).then((results) => {
            if (cancelled) return;
            const ok = results.filter((r): r is MarketResult => !!r && r.total !== null);
            setState({
                total: ok.length ? ok.reduce((n, r) => n + (r.total ?? 0), 0) : null,
                capped: ok.some((r) => r.capped),
                loading: false,
            });
        }).catch(() => !cancelled && setState({ total: null, capped: false, loading: false }));
        return () => { cancelled = true; };
    }, [token, key]);
    return state;
}

function SummaryCard({ icon: IconC, title, onEdit, readOnly, children, className }: {
    icon: Icon;
    title: string;
    onEdit: () => void;
    readOnly: boolean;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={cn(CARD, "flex min-w-0 flex-col p-5", className)}>
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-3 font-display text-lg font-bold text-ink">
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-600" aria-hidden>
                        <IconC className="size-5" />
                    </span>
                    {title}
                </h2>
                {!readOnly && (
                    <button type="button" onClick={onEdit} className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-primary-700 hover:bg-primary-50", FOCUS)} aria-label={`Modifier : ${title}`}>
                        <Pencil className="size-3.5" aria-hidden /> Modifier
                    </button>
                )}
            </div>
            <div className="min-w-0 flex-1 text-sm text-ink-2">{children}</div>
        </section>
    );
}

function Line({ icon: IconC, children }: { icon: Icon; children: ReactNode }) {
    return (
        <p className="flex items-start gap-2.5 border-b border-line-subtle py-2 last:border-0">
            <IconC className="mt-0.5 size-4 shrink-0 text-ink-4" aria-hidden />
            <span className="min-w-0">{children}</span>
        </p>
    );
}

function Timeline({ steps }: { steps: { label: string; date?: string; state: "done" | "next" | "todo" | "goal" }[] }) {
    return (
        <ol className={cn(CARD, "grid grid-cols-1 gap-4 p-5 sm:grid-cols-5 sm:gap-0 sm:px-4 sm:py-6")}>
            {steps.map((s, i) => (
                <li key={s.label} className="relative flex items-center gap-3 sm:flex-col sm:gap-3 sm:text-center">
                    {i > 0 && (
                        <span
                            aria-hidden
                            className={cn(
                                "absolute hidden h-[3px] sm:block sm:top-[18px] sm:right-1/2 sm:w-full",
                                steps[i - 1].state === "done" ? "bg-primary" : "bg-line",
                            )}
                            style={{ marginRight: 20 }}
                        />
                    )}
                    <span
                        className={cn(
                            "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border-[3px]",
                            s.state === "done" && "border-primary bg-primary text-primary-fg",
                            s.state === "next" && "border-primary bg-surface text-primary",
                            s.state === "todo" && "border-line bg-surface text-ink-4",
                            s.state === "goal" && "border-line bg-surface-2 text-ink-2",
                        )}
                        aria-hidden
                    >
                        {s.state === "done" ? <Check className="size-4" strokeWidth={3} /> : s.state === "goal" ? <Flag className="size-4" /> : null}
                    </span>
                    <span className="text-sm font-bold text-ink">
                        {s.label}
                        {s.date && <span className="text-primary-700"> · {s.date}</span>}
                        <span className="sr-only">{s.state === "done" ? " (fait)" : " (à venir)"}</span>
                    </span>
                </li>
            ))}
        </ol>
    );
}

const SPARKS = [
    "left-[8%] top-6 rotate-[30deg] bg-amber-400", "left-[13%] top-14 -rotate-12 bg-primary-300",
    "left-[18%] top-3 rotate-[60deg] bg-primary-600", "right-[9%] top-5 -rotate-[30deg] bg-primary-300",
    "right-[14%] top-12 rotate-12 bg-amber-400", "right-[19%] top-2 rotate-45 bg-primary-600",
];

export function ReviewScreen({ token, view, answers, onEdit, onSubmit, submitting, submittedAt, error }: {
    token: string;
    view: PortalView;
    answers: Answers;
    onEdit: (s: ScreenKey) => void;
    onSubmit: () => void;
    submitting: boolean;
    submittedAt: string | null;
    error: string | null;
}) {
    const [agreed, setAgreed] = useState(false);
    const readOnly = !!submittedAt;
    const missing = missingScreens(answers);
    const market = useSegmentsTotal(token, answers);
    const segments = definedSegments(answers);
    const exclusions = parseExclusions(answers.exclusions.text);
    const firstName = answers.referent.name.trim().split(/\s+/)[0] ?? "";
    const launch = view.targetLaunchDate ?? (answers.goals.launchDate || null);
    const ok = (s: ScreenKey) => screenIssues(s, answers).length === 0;
    const managerName = view.accountManager?.name.split(/\s+/)[0];
    const bookingHost = (() => {
        try { return answers.meetings.bookingUrl ? new URL(answers.meetings.bookingUrl).host.replace(/^www\./, "") : null; } catch { return null; }
    })();

    const timeline = [
        { label: "Questionnaire", state: missing.length === 0 ? "done" : "next" },
        { label: "Ciblage", state: ok("targets") ? "done" : "todo" },
        { label: "Discours", state: ok("value") && ok("meetings") ? "done" : "todo" },
        { label: "Premiers appels", date: launch ? formatDay(launch, { day: "numeric", month: "short" }) : undefined, state: missing.length === 0 ? "next" : "todo" },
        { label: "Premier RDV visé", state: "goal" },
    ] as const;

    return (
        <div className="mx-auto w-full max-w-6xl pb-32">
            <header className="relative mb-8 px-2 pt-2 text-center">
                {missing.length === 0 && SPARKS.map((c) => (
                    <span key={c} aria-hidden className={cn("absolute hidden h-2.5 w-1 rounded-full opacity-80 md:block", c)} />
                ))}
                {readOnly ? (
                    <>
                        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600" aria-hidden>
                            <CheckCircle2 className="size-8" />
                        </span>
                        <h1 className="font-display text-[clamp(2rem,4.5vw,3.25rem)] font-extrabold leading-tight tracking-tight text-ink">
                            C&apos;est validé{firstName ? <>, <span className="text-primary">{firstName}</span></> : null}.
                        </h1>
                        <p className="mt-3 text-lg text-ink-3">
                            Merci ! {managerName ? `${managerName} a été prévenu·e` : "Votre équipe a été prévenue"} et prépare le lancement. Vous pouvez fermer cette page.
                        </p>
                    </>
                ) : missing.length === 0 ? (
                    <>
                        <h1 className="font-display text-[clamp(2rem,4.5vw,3.25rem)] font-extrabold leading-tight tracking-tight text-ink">
                            Tout est prêt{firstName ? <>, <span className="text-primary">{firstName}</span></> : null}.
                        </h1>
                        <p className="mt-3 text-lg text-ink-3">Relisez et validez pour lancer votre campagne.</p>
                    </>
                ) : (
                    <>
                        <h1 className="font-display text-[clamp(2rem,4.5vw,3rem)] font-extrabold leading-tight tracking-tight text-ink">Presque prêt.</h1>
                        <p className="mt-3 text-lg text-ink-3">Il reste {missing.length} réponse{missing.length > 1 ? "s" : ""} indispensable{missing.length > 1 ? "s" : ""} avant de valider.</p>
                        <ul className="mx-auto mt-5 flex max-w-xl flex-wrap justify-center gap-2">
                            {missing.map((s) => (
                                <li key={s}>
                                    <button type="button" onClick={() => onEdit(s)} className={cn("inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100", FOCUS)}>
                                        <AlertCircle className="size-4" aria-hidden /> {SCREEN_TITLES[s]} <ArrowRight className="size-3.5" aria-hidden />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </header>

            <Timeline steps={[...timeline]} />

            <div className="mt-5 grid gap-5 lg:grid-cols-3">
                <SummaryCard icon={Crosshair} title="Cibles" onEdit={() => onEdit("targets")} readOnly={readOnly}>
                    <p className="mb-3 flex items-baseline gap-2">
                        {market.loading ? (
                            <Loader2 className="size-6 text-primary motion-safe:animate-spin" aria-label="Calcul en cours" />
                        ) : market.total !== null ? (
                            <span className="font-display text-4xl font-extrabold tracking-tight text-primary-700 tabular-nums">
                                {market.total.toLocaleString("fr-FR")}{market.capped && "+"}
                            </span>
                        ) : null}
                        {market.total !== null && <span className="text-base font-medium text-ink-2">entreprises</span>}
                    </p>
                    {segments.length === 0 && <p className="text-ink-3">Aucune cible définie.</p>}
                    {segments.map((s, i) => (
                        <Line key={s.id} icon={i === 0 ? Layers : Users}>
                            <span className="font-semibold text-ink">{s.name || `Cible ${i + 1}`}</span>
                            {" · "}
                            {[
                                s.sectors.map((x) => SECTOR_LABEL[x]).join(", "),
                                s.sizes.length ? `${s.sizes.map((x) => SIZE_LABEL[x]).join(", ")} sal.` : "",
                                s.regions.length ? s.regions.join(", ") : "France entière",
                            ].filter(Boolean).join(" · ")}
                        </Line>
                    ))}
                </SummaryCard>

                <SummaryCard icon={MessageSquareQuote} title="Discours" onEdit={() => onEdit("value")} readOnly={readOnly}>
                    <blockquote className="relative rounded-2xl bg-surface-2 p-4 pl-10 italic leading-relaxed text-ink-2">
                        <span className="absolute left-3.5 top-2 font-display text-3xl font-black not-italic text-primary-500" aria-hidden>“</span>
                        {scriptOpener(answers, view.clientName)}
                    </blockquote>
                    <p className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="rounded-lg bg-surface-2 px-2 py-1 text-ink-3">Brouillon d&apos;accroche, finalisé avec vous</span>
                        {answers.message.objections.length > 0 && (
                            <span className="rounded-lg bg-primary-50 px-2 py-1 text-primary-800">{answers.message.objections.length} objection{answers.message.objections.length > 1 ? "s" : ""} préparée{answers.message.objections.length > 1 ? "s" : ""}</span>
                        )}
                    </p>
                </SummaryCard>

                <SummaryCard icon={CalendarCheck} title="RDV" onEdit={() => onEdit("meetings")} readOnly={readOnly}>
                    <Line icon={CalendarCheck}>{bookingHost ? <>Agenda en ligne · <span className="font-semibold text-ink">{bookingHost}</span></> : "Lien d'agenda à transmettre"}</Line>
                    <Line icon={UserRound}>Participant : {answers.meetings.attendee || answers.referent.name || "à préciser"}</Line>
                    <Line icon={Clock}>
                        Créneaux : {answers.meetings.days.length ? WEEKDAYS.filter((d) => answers.meetings.days.includes(d.key)).map((d) => d.label.toLowerCase()).join(", ") : "tous les jours ouvrés"}
                    </Line>
                    <Line icon={Target}>{answers.meetings.criteria.length} critère{answers.meetings.criteria.length > 1 ? "s" : ""} de qualification</Line>
                </SummaryCard>

                <SummaryCard icon={Rocket} title="Objectifs" onEdit={() => onEdit("goals")} readOnly={readOnly}>
                    {answers.goals.monthlyMeetings && (
                        <p className="mb-2 flex items-baseline gap-2">
                            <span className="font-display text-4xl font-extrabold tracking-tight text-primary-700 tabular-nums">{answers.goals.monthlyMeetings}</span>
                            <span className="text-base font-medium text-ink-2">RDV / mois</span>
                        </p>
                    )}
                    <Line icon={Flag}>Lancement : {answers.goals.launchDate ? formatDay(answers.goals.launchDate, { day: "numeric", month: "long", year: "numeric" }) : "à définir"}</Line>
                    {answers.goals.missionEndDate && <Line icon={Clock}>Fin prévue : {formatDay(answers.goals.missionEndDate, { day: "numeric", month: "long", year: "numeric" })}</Line>}
                    {answers.company.salesCycle && <Line icon={Clock}>Cycle de vente : {SALES_CYCLE_LABEL[answers.company.salesCycle]}</Line>}
                    {answers.goals.expectedOutcome && <Line icon={Target}>À 3 mois : {answers.goals.expectedOutcome}</Line>}
                </SummaryCard>

                <SummaryCard icon={Ban} title="Exclusions" onEdit={() => onEdit("exclusions")} readOnly={readOnly}>
                    <p className="flex items-baseline gap-2">
                        <span className="font-display text-4xl font-extrabold tracking-tight text-primary-700 tabular-nums">{exclusions.length.toLocaleString("fr-FR")}</span>
                        <span className="text-base font-medium text-ink-2">entreprise{exclusions.length > 1 ? "s" : ""} exclue{exclusions.length > 1 ? "s" : ""}</span>
                    </p>
                    {exclusions.length > 0 && <p className="mt-2 line-clamp-2 text-ink-3">{exclusions.slice(0, 6).join(", ")}{exclusions.length > 6 ? "…" : ""}</p>}
                </SummaryCard>

                {view.contract.length > 0 ? (
                    <SummaryCard icon={CheckCircle2} title="Administratif" onEdit={() => onEdit("referent")} readOnly>
                        <ul>
                            {view.contract.map((c) => (
                                <li key={c.title} className="flex items-center gap-2.5 border-b border-line-subtle py-2 last:border-0">
                                    <span className={cn("flex size-5 items-center justify-center rounded-full", c.done ? "bg-primary text-primary-fg" : "border-2 border-line")} aria-hidden>
                                        {c.done && <Check className="size-3" strokeWidth={3} />}
                                    </span>
                                    <span className={cn(c.done ? "text-ink" : "text-ink-3")}>{c.title}</span>
                                    <span className="sr-only">{c.done ? "fait" : "en attente"}</span>
                                </li>
                            ))}
                        </ul>
                    </SummaryCard>
                ) : (
                    <SummaryCard icon={UserRound} title="Interlocuteur" onEdit={() => onEdit("referent")} readOnly={readOnly}>
                        <Line icon={UserRound}><span className="font-semibold text-ink">{answers.referent.name || "à préciser"}</span>{answers.referent.role && ` · ${answers.referent.role}`}</Line>
                        {answers.referent.email && <Line icon={MessageSquareQuote}>{answers.referent.email}</Line>}
                    </SummaryCard>
                )}
            </div>

            {!readOnly && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-md lg:left-[280px]">
                    <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                        <label className="flex cursor-pointer items-center gap-3 text-[15px] font-bold text-ink">
                            <input
                                type="checkbox"
                                checked={agreed}
                                onChange={(e) => setAgreed(e.target.checked)}
                                disabled={missing.length > 0}
                                className="size-5 rounded accent-[var(--brand-primary)]"
                            />
                            J&apos;ai relu et je valide le lancement
                        </label>
                        <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                            {error && <p className="text-sm font-semibold text-rose-600" role="alert">{error}</p>}
                            <span className="hidden text-sm text-ink-3 md:inline">{managerName ? `${managerName} sera notifié·e` : "Votre équipe sera notifiée"}</span>
                            <button
                                type="button"
                                onClick={onSubmit}
                                disabled={!agreed || missing.length > 0 || submitting}
                                className={cn(
                                    "inline-flex items-center justify-center gap-2.5 rounded-2xl bg-primary px-6 py-3.5 text-base font-bold text-primary-fg transition-all",
                                    "shadow-[0_10px_24px_-10px_color-mix(in_oklab,var(--brand-primary)_70%,transparent)] hover:bg-primary-hover",
                                    "disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none",
                                    FOCUS,
                                )}
                            >
                                {submitting ? <Loader2 className="size-5 motion-safe:animate-spin" aria-hidden /> : <Rocket className="size-5" aria-hidden />}
                                Valider et lancer la campagne
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
