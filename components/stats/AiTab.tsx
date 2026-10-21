"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, PhoneOff, Target, ThumbsUp, UserX } from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";
import { cn } from "@/lib/utils";
import { EmptyBlock, FOCUS, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/accueil/AccueilUI";
import { formatInt } from "@/lib/stats/format";
import { periodParams, type StatsState } from "@/lib/stats/period";
import { Panel } from "./shared";

interface AiAnalysis {
    executiveSummary: string;
    keyInsights: string[];
    objectionClusters: { objection: string; frequency: "LOW" | "MEDIUM" | "HIGH"; whyItHappens: string; recommendedResponse: string }[];
    disqualificationCauses: { cause: string; signalInNotes: string; correctiveAction: string }[];
    recommendations: { title: string; priority: "P1" | "P2" | "P3"; expectedImpact: string; actionPlan: string }[];
    next7DaysPlan: string[];
}

interface RecapResult { recap: string; analysis: AiAnalysis | null }

const FOLLOW_UPS = [
    { id: "objections", label: "Objections détaillées", icon: AlertTriangle, prompt: "Liste et analyse en détail toutes les objections récurrentes dans les notes (budget, timing, prestataire actuel, etc.). Donne des exemples concrets et des pistes de réponse." },
    { id: "causes", label: "Causes des refus", icon: UserX, prompt: "Quelles sont les causes racines des disqualifications ? Analyse les notes des contacts disqualifiés et synthétise les motifs récurrents." },
    { id: "recommandations", label: "Recommandations", icon: ThumbsUp, prompt: "Donne des recommandations actionnables et concrètes pour améliorer les résultats (pitch, qualification, timing, etc.)." },
    { id: "meetings", label: "Facteurs de succès des RDV", icon: Target, prompt: "Quels facteurs ou patterns ressortent dans les notes des contacts qui ont booké un RDV ? Que faire pour reproduire ce succès ?" },
    { id: "non_reponse", label: "Réduire la non-réponse", icon: PhoneOff, prompt: "Quelles stratégies proposer pour réduire le taux de non-réponse ? Analyse les notes et le contexte pour identifier des leviers." },
] as const;

const FREQUENCY: Record<string, { label: string; cls: string }> = {
    HIGH: { label: "Fréquente", cls: "bg-danger-soft text-danger-ink border-danger-line" },
    MEDIUM: { label: "Régulière", cls: "bg-warning-soft text-warning-ink border-warning-line" },
    LOW: { label: "Rare", cls: "bg-surface-3 text-ink-3 border-line" },
};

/** The model answers in light markdown: render **bold** and bullets as React nodes, never as raw HTML. */
function RichText({ text, className }: { text: string; className?: string }) {
    const inline = (s: string): ReactNode[] =>
        s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
            part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-bold text-ink">{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
        );
    const blocks: ReactNode[] = [];
    let bullets: string[] = [];
    const flush = () => {
        if (bullets.length) {
            blocks.push(<ul key={`u${blocks.length}`} className="my-2 list-disc space-y-1 pl-5">{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>);
            bullets = [];
        }
    };
    for (const raw of text.split("\n")) {
        const line = raw.trim();
        const bullet = line.match(/^[-*•]\s+(.*)$/);
        if (bullet) { bullets.push(bullet[1]); continue; }
        flush();
        if (!line) continue;
        const heading = line.match(/^#{1,4}\s+(.*)$/);
        blocks.push(heading
            ? <h4 key={`h${blocks.length}`} className="mt-3 text-[13px] font-extrabold text-ink first:mt-0">{inline(heading[1])}</h4>
            : <p key={`p${blocks.length}`} className="my-1.5">{inline(line)}</p>);
    }
    flush();
    return <div className={cn("text-[13px] leading-relaxed text-ink-2", className)}>{blocks}</div>;
}

function Block({ icon: Icon, title, children }: { icon: typeof AlertTriangle; title: string; children: ReactNode }) {
    return (
        <div className="rounded-panel border border-line bg-surface-2/60 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-[13px] font-extrabold text-ink"><Icon className="size-4 text-ink-3" aria-hidden />{title}</h3>
            <div className="space-y-2.5">{children}</div>
        </div>
    );
}

async function postRecap(body: Record<string, unknown>): Promise<RecapResult> {
    const res = await fetch("/api/analytics/ai-recap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success || !json.data?.recap) throw new Error(json?.error ?? "L'analyse n'a pas pu aboutir.");
    return { recap: json.data.recap, analysis: json.data.analysis ?? null };
}

export function AiTab({ state, range, calls }: { state: StatsState; range: { start: string; end: string }; calls: number }) {
    const [result, setResult] = useState<RecapResult | null>(null);
    const [extras, setExtras] = useState<{ id: string; label: string; answer: string }[]>([]);
    const [pending, setPending] = useState<string | null>(null);

    const scopeKey = periodParams(range, state).toString();
    const base = { from: range.start, to: range.end, missionIds: state.missionIds, sdrIds: state.sdrIds, clientIds: state.clientIds, listIds: state.listIds };

    // A new period or scope makes the previous analysis stale: clear it, never recompute silently (it costs tokens).
    useEffect(() => { setResult(null); setExtras([]); }, [scopeKey]);

    const analyse = useMutation({ mutationFn: () => postRecap(base), onSuccess: (r) => { setResult(r); setExtras([]); } });

    const askFollowUp = async (f: (typeof FOLLOW_UPS)[number]) => {
        if (!result) return;
        setPending(f.id);
        try {
            const r = await postRecap({ ...base, followUp: f.prompt, previousRecap: result.recap });
            setExtras((prev) => [...prev.filter((e) => e.id !== f.id), { id: f.id, label: f.label, answer: r.recap }]);
        } catch {
            // the button simply becomes available again
        } finally {
            setPending(null);
        }
    };

    const a = result?.analysis;

    return (
        <div className="space-y-4">
            <Panel
                title="Synthèse IA de la période"
                subtitle="Lit les résultats et les notes d'appels, puis en tire objections, causes de refus et pistes d'action"
                right={
                    <div className="flex flex-wrap items-center gap-2">
                        <Link href="/manager/analyse-ia" className={cn(SECONDARY_BUTTON)}>
                            Analyse hebdomadaire <ArrowRight className="size-3.5" aria-hidden />
                        </Link>
                        <button type="button" onClick={() => analyse.mutate()} disabled={analyse.isPending || calls === 0} className={PRIMARY_BUTTON}>
                            {analyse.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <AiMark className="size-4" aria-hidden />}
                            {result ? "Relancer l'analyse" : "Analyser la période"}
                        </button>
                    </div>
                }
            >
                {analyse.isPending ? (
                    <div className="flex items-center gap-3 rounded-panel border border-line bg-surface-2/60 px-4 py-5" role="status">
                        <Loader2 className="size-5 shrink-0 animate-spin text-primary-600" aria-hidden />
                        <div>
                            <p className="text-sm font-bold text-ink">Analyse de {formatInt(calls)} appels en cours</p>
                            <p className="text-xs text-ink-3">Comptez une trentaine de secondes. Vous pouvez changer d'onglet, le résultat restera ici.</p>
                        </div>
                    </div>
                ) : analyse.isError ? (
                    <div className="rounded-panel border border-danger-line bg-danger-soft px-4 py-3 text-[13px] font-semibold text-danger-ink" role="alert">
                        {analyse.error instanceof Error ? analyse.error.message : "L'analyse n'a pas pu aboutir."} Réessayez dans un instant.
                    </div>
                ) : !result ? (
                    <EmptyBlock
                        compact
                        tone="violet"
                        icon={AiMark}
                        title={calls === 0 ? "Aucun appel à analyser" : `${formatInt(calls)} appels prêts à être analysés`}
                        hint={calls === 0 ? "Élargissez la période ou retirez un filtre." : "L'analyse suit la période et les filtres choisis en haut de page. Elle ne se lance que sur demande."}
                    />
                ) : a ? (
                    <div className="space-y-4">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-4">Synthèse</p>
                            <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-ink">{a.executiveSummary}</p>
                            {a.keyInsights.length > 0 && (
                                <ul className="mt-3 flex flex-wrap gap-2">
                                    {a.keyInsights.map((k, i) => <li key={i} className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-semibold text-ink-2">{k}</li>)}
                                </ul>
                            )}
                        </div>

                        <div className="grid gap-3 lg:grid-cols-3">
                            <Block icon={AlertTriangle} title="Objections récurrentes">
                                {a.objectionClusters.slice(0, 4).map((o, i) => (
                                    <div key={i} className="rounded-xl border border-line bg-surface p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="text-[13px] font-bold text-ink">{o.objection}</p>
                                            <span className={cn("shrink-0 rounded-full border px-2 py-px text-[10px] font-bold", (FREQUENCY[o.frequency] ?? FREQUENCY.LOW).cls)}>{(FREQUENCY[o.frequency] ?? FREQUENCY.LOW).label}</span>
                                        </div>
                                        <p className="mt-1 text-xs text-ink-3">{o.whyItHappens}</p>
                                        <p className="mt-1.5 text-xs text-ink-2"><span className="font-bold">Réponse : </span>{o.recommendedResponse}</p>
                                    </div>
                                ))}
                            </Block>
                            <Block icon={UserX} title="Causes de refus">
                                {a.disqualificationCauses.slice(0, 4).map((c, i) => (
                                    <div key={i} className="rounded-xl border border-line bg-surface p-3">
                                        <p className="text-[13px] font-bold text-ink">{c.cause}</p>
                                        <p className="mt-1 text-xs text-ink-3">{c.signalInNotes}</p>
                                        <p className="mt-1.5 text-xs text-ink-2"><span className="font-bold">Action : </span>{c.correctiveAction}</p>
                                    </div>
                                ))}
                            </Block>
                            <Block icon={ThumbsUp} title="Recommandations">
                                {a.recommendations.slice(0, 4).map((r, i) => (
                                    <div key={i} className="rounded-xl border border-line bg-surface p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="text-[13px] font-bold text-ink">{r.title}</p>
                                            <span className="shrink-0 rounded-full border border-primary-200 bg-primary-50 px-2 py-px text-[10px] font-bold text-primary-700">{r.priority}</span>
                                        </div>
                                        <p className="mt-1 text-xs text-ink-3">{r.actionPlan}</p>
                                        <p className="mt-1.5 text-xs text-ink-2"><span className="font-bold">Impact attendu : </span>{r.expectedImpact}</p>
                                    </div>
                                ))}
                            </Block>
                        </div>

                        {a.next7DaysPlan.length > 0 && (
                            <div className="rounded-panel border border-success-line bg-success-soft p-4">
                                <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-extrabold text-success-ink"><CheckCircle2 className="size-4" aria-hidden />Plan des 7 prochains jours</h3>
                                <ol className="grid gap-2 md:grid-cols-2">
                                    {a.next7DaysPlan.map((step, i) => (
                                        <li key={i} className="flex gap-2.5 rounded-xl border border-success-line/60 bg-surface px-3 py-2 text-xs text-ink-2">
                                            <span className="font-black text-success-ink tabular-nums">{i + 1}.</span>{step}
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}
                    </div>
                ) : (
                    <RichText text={result.recap} className="max-w-3xl" />
                )}
            </Panel>

            {result && (
                <Panel title="Approfondir" subtitle="Posez une question de suivi : la réponse s'appuie sur la même période">
                    <div className="flex flex-wrap gap-2">
                        {FOLLOW_UPS.map((f) => {
                            const done = extras.some((e) => e.id === f.id);
                            const loading = pending === f.id;
                            return (
                                <button
                                    key={f.id}
                                    type="button"
                                    disabled={done || loading || pending !== null}
                                    onClick={() => askFollowUp(f)}
                                    className={cn("inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors disabled:pointer-events-none", FOCUS, done ? "border-success-line bg-success-soft text-success-ink" : "border-line bg-surface text-ink-2 shadow-2xs hover:border-line-strong hover:bg-surface-2 disabled:opacity-50")}
                                >
                                    {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : done ? <CheckCircle2 className="size-3.5" aria-hidden /> : <f.icon className="size-3.5" aria-hidden />}
                                    {f.label}
                                </button>
                            );
                        })}
                    </div>
                    {extras.length > 0 && (
                        <div className="mt-4 space-y-3">
                            {extras.map((e) => (
                                <details key={e.id} open className="group rounded-panel border border-line bg-surface-2/60">
                                    <summary className={cn("flex cursor-pointer list-none items-center justify-between gap-3 rounded-panel px-4 py-3 text-[13px] font-extrabold text-ink", FOCUS)}>
                                        {e.label}
                                        <span className="text-xs font-semibold text-ink-4 group-open:hidden">Afficher</span>
                                        <span className="hidden text-xs font-semibold text-ink-4 group-open:inline">Masquer</span>
                                    </summary>
                                    <div className="px-4 pb-4"><RichText text={e.answer} /></div>
                                </details>
                            ))}
                        </div>
                    )}
                </Panel>
            )}
        </div>
    );
}
