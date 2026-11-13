"use client";

// ============================================
// Paramètres → Téléphonie → Numérotation & automatisation.
// The organisation's dialing policy (parallel lines, abandon ceiling, calling
// hours, caller-id quota), what may happen without a click after a call, and
// the measured numbers that say whether to loosen or tighten them. Every value
// is clamped again on the server (lib/dialer/policy, lib/post-call/policy).
// ============================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Bot, Clock, Gauge, PhoneOutgoing, Rows3, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Shimmer } from "@/components/accueil/AccueilUI";
import { Notice, SaveBar, SettingRow, SettingsCard, Toggle } from "@/components/settings/SettingsUI";
import { formatPhone } from "@/components/incoming-calls/useIncomingCalls";
import type { DialerPolicy } from "@/lib/dialer/policy";
import type { AutomationMode, AutomationPolicy, ProposalKind } from "@/lib/post-call/policy";
import type { SalesEngineMetrics } from "@/lib/sales-engine/metrics";

type Payload = {
    dialer: DialerPolicy;
    automation: AutomationPolicy;
    ceilings: { dialer: { maxLinesPerSdr: number; maxAbandonRate: number }; automation: Record<ProposalKind, AutomationMode> };
    kindLabels: Record<ProposalKind, string>;
    flags: { parallel: boolean; smartQueue: "off" | "shadow" | "on" };
    metrics: SalesEngineMetrics;
};

const DAYS = [
    { d: 1, l: "L" }, { d: 2, l: "M" }, { d: 3, l: "M" }, { d: 4, l: "J" }, { d: 5, l: "V" }, { d: 6, l: "S" }, { d: 7, l: "D" },
];
const SELECT = "h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-semibold text-zinc-900";
const pct = (v: number | null) => (v == null ? "–" : `${Math.round(v * 1000) / 10} %`);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => null);
    if (!json?.success) throw new Error(json?.error || "Erreur de connexion");
    return json.data as T;
}

export function SalesEnginePanel() {
    const { success, error: showError } = useToast();
    const [data, setData] = useState<Payload | null>(null);
    const [dialer, setDialer] = useState<DialerPolicy | null>(null);
    const [automation, setAutomation] = useState<AutomationPolicy | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => {
        api<Payload>("/api/manager/sales-engine?days=7")
            .then((p) => {
                setData(p);
                setDialer(p.dialer);
                setAutomation(p.automation);
            })
            .catch((e) => showError("Numérotation", e instanceof Error ? e.message : "Chargement impossible"));
    }, [showError]);
    useEffect(load, [load]);

    const dirty = useMemo(
        () => Boolean(data && dialer && automation && (JSON.stringify(dialer) !== JSON.stringify(data.dialer) || JSON.stringify(automation) !== JSON.stringify(data.automation))),
        [data, dialer, automation],
    );

    async function save() {
        if (!dialer || !automation) return;
        setSaving(true);
        try {
            await api("/api/manager/sales-engine", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dialer, automation }) });
            success("Numérotation", "Politique enregistrée");
            load();
        } catch (e) {
            showError("Numérotation", e instanceof Error ? e.message : "Enregistrement impossible");
        } finally {
            setSaving(false);
        }
    }

    if (!data || !dialer || !automation) return <Shimmer className="h-48 rounded-3xl" />;
    const m = data.metrics;
    const window0 = dialer.callingWindows[0];
    const setWindow = (patch: Partial<typeof window0>) => setDialer({ ...dialer, callingWindows: [{ ...window0, ...patch }, ...dialer.callingWindows.slice(1)] });
    const kept = m.ai.judged > 0 ? m.ai.kept / m.ai.judged : null;

    return (
        <div className="space-y-6">
            {(!data.flags.parallel || data.flags.smartQueue !== "on") && (
                <Notice tone="slate" icon={ShieldCheck}>
                    <p className="font-bold text-zinc-900">Déploiement progressif.</p>
                    <p>
                        {data.flags.parallel ? "Le mode parallèle est activé sur cette instance." : "Le mode parallèle n'est pas encore activé sur cette instance (DIALER_PARALLEL) : vos réglages s'appliqueront dès son activation."}{" "}
                        {data.flags.smartQueue === "on"
                            ? "La File d'actions est triée par score expliqué."
                            : data.flags.smartQueue === "shadow"
                              ? "Les explications de priorité sont visibles, l'ordre de la File d'actions reste l'ordre habituel (SMART_QUEUE=shadow)."
                              : "Les explications de priorité sont désactivées (SMART_QUEUE=off)."}
                    </p>
                </Notice>
            )}

            {/* ── Measured ── */}
            <SettingsCard icon={Activity} tone="indigo" title="Mesures des 7 derniers jours" subtitle="Comptées depuis les tentatives réelles, sans double comptage">
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <Kpi label="Appels" value={m.dialing.attempts} />
                    <Kpi label="Conversations" value={m.dialing.conversations} strong />
                    <Kpi label="Messageries" value={m.dialing.voicemails} />
                    <Kpi label="Abandons" value={pct(m.dialing.abandonRate)} hint={`${m.dialing.abandoned} appels`} warn={(m.dialing.abandonRate ?? 0) > dialer.maxAbandonRate} />
                    <Kpi label="Décroché → SDR" value={m.dialing.medianBridgeSec == null ? "–" : `${m.dialing.medianBridgeSec} s`} hint={m.dialing.p90BridgeSec == null ? "médiane" : `p90 ${m.dialing.p90BridgeSec} s`} />
                    <Kpi label="Résultat IA gardé" value={pct(kept)} hint={`${m.ai.judged} appels qualifiés`} />
                </dl>
                {(m.events.failing > 0 || m.events.parked > 0 || m.dialing.failed > 0) && (
                    <p className="mt-3 text-xs font-medium text-amber-700">
                        {m.dialing.failed > 0 && `${m.dialing.failed} appel(s) refusé(s) par l'opérateur. `}
                        {m.events.failing > 0 && `${m.events.failing} évènement(s) Twilio en reprise. `}
                        {m.events.parked > 0 && `${m.events.parked} évènement(s) abandonné(s) après 5 essais : à examiner.`}
                    </p>
                )}
                {m.bySdr.length > 0 && (
                    <table className="mt-4 w-full text-left text-xs">
                        <thead className="text-[11px] uppercase tracking-wider text-zinc-400">
                            <tr><th className="py-1.5 font-bold">SDR</th><th className="font-bold">Appels</th><th className="font-bold">Conversations</th><th className="font-bold">Abandons</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {m.bySdr.map((r) => (
                                <tr key={r.sdrId} className="font-semibold text-zinc-800">
                                    <td className="py-1.5">{r.name}</td>
                                    <td className="tabular-nums">{r.attempts}</td>
                                    <td className="tabular-nums">{r.conversations}</td>
                                    <td className={cn("tabular-nums", r.abandoned > 0 && "text-amber-700")}>{r.abandoned}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {m.ai.proposals.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                        {m.ai.proposals.map((p) => (
                            <span key={p.kind} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                                {data.kindLabels[p.kind as ProposalKind] ?? p.kind} · {p.applied + p.auto} appliquées{p.auto ? ` (dont ${p.auto} auto)` : ""} · {p.dismissed} écartées
                            </span>
                        ))}
                    </div>
                )}
            </SettingsCard>

            {/* ── Dialing policy ── */}
            <SettingsCard icon={Rows3} tone="violet" title="Numérotation parallèle" subtitle="Plusieurs lignes sonnent ; une seule conversation est transmise au SDR">
                <div className="space-y-3">
                    <SettingRow
                        icon={Rows3}
                        tone="violet"
                        title="Autoriser le mode parallèle"
                        description="Les SDR choisissent « Parallèle » au lancement du Mode Focus. Sans cela, seuls Focus et Power sont proposés."
                        active={dialer.parallelEnabled}
                        control={<Toggle checked={dialer.parallelEnabled} onChange={(v) => setDialer({ ...dialer, parallelEnabled: v })} label="Mode parallèle" />}
                    />
                    <SettingRow
                        icon={PhoneOutgoing}
                        tone="indigo"
                        title="Lignes par SDR"
                        description={`Plafond ; le moteur s'adapte au taux de décroché réel. Maximum ${data.ceilings.dialer.maxLinesPerSdr}.`}
                        control={
                            <select className={SELECT} value={dialer.maxLinesPerSdr} onChange={(e) => setDialer({ ...dialer, maxLinesPerSdr: Number(e.target.value) })} aria-label="Lignes par SDR">
                                {Array.from({ length: data.ceilings.dialer.maxLinesPerSdr }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                        }
                    />
                    <SettingRow
                        icon={Gauge}
                        tone="amber"
                        title="Plafond d'abandons"
                        description="Part des personnes ayant décroché sans SDR disponible. Au-delà, la session repasse sur une ligne. À valider avec les règles applicables à votre marché."
                        control={
                            <select className={SELECT} value={dialer.maxAbandonRate} onChange={(e) => setDialer({ ...dialer, maxAbandonRate: Number(e.target.value) })} aria-label="Plafond d'abandons">
                                {[0.01, 0.02, 0.03, 0.04, 0.05].filter((v) => v <= data.ceilings.dialer.maxAbandonRate).map((v) => <option key={v} value={v}>{v * 100} %</option>)}
                            </select>
                        }
                    />
                    <SettingRow
                        icon={Bot}
                        tone="teal"
                        title="Détection incertaine"
                        description="Quand la détection ne sait pas si c'est une personne ou une messagerie."
                        control={
                            <select className={SELECT} value={dialer.uncertain} onChange={(e) => setDialer({ ...dialer, uncertain: e.target.value as DialerPolicy["uncertain"] })} aria-label="Détection incertaine">
                                <option value="bridge">Transmettre au SDR</option>
                                <option value="release">Raccrocher</option>
                            </select>
                        }
                    />
                    <SettingRow
                        icon={Clock}
                        tone="slate"
                        title="Plages d'appel"
                        description={`Heure de ${dialer.timezone.replace("Europe/", "")}. Aucune ligne ne sonne en dehors.`}
                        control={
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                                {DAYS.map(({ d, l }) => {
                                    const on = window0.days.includes(d);
                                    return (
                                        <button
                                            key={d}
                                            type="button"
                                            aria-pressed={on}
                                            onClick={() => setWindow({ days: on ? window0.days.filter((x) => x !== d) : [...window0.days, d].sort() })}
                                            className={cn("h-8 w-8 rounded-lg text-xs font-bold", on ? "bg-zinc-900 text-white" : "bg-slate-100 text-zinc-500")}
                                        >
                                            {l}
                                        </button>
                                    );
                                })}
                                <input type="time" className={SELECT} value={window0.start} onChange={(e) => setWindow({ start: e.target.value })} aria-label="Début" />
                                <input type="time" className={SELECT} value={window0.end} onChange={(e) => setWindow({ end: e.target.value })} aria-label="Fin" />
                            </div>
                        }
                    />
                    <SettingRow
                        icon={ShieldCheck}
                        tone="emerald"
                        title="Appels par numéro et par jour"
                        description="Protège la réputation de vos numéros (risque d'étiquette « spam » chez les opérateurs)."
                        control={<input type="number" min={10} max={400} className={cn(SELECT, "w-24")} value={dialer.maxDailyCallsPerNumber} onChange={(e) => setDialer({ ...dialer, maxDailyCallsPerNumber: Number(e.target.value) })} aria-label="Appels par numéro et par jour" />}
                    />
                </div>
                {m.callerIds.length > 0 && (
                    <p className="mt-3 text-xs font-medium text-zinc-500">
                        Aujourd&apos;hui : {m.callerIds.map((c) => `${formatPhone(c.number)} ${c.today}/${dialer.maxDailyCallsPerNumber} (décroché ${pct(c.answerRate)})`).join(" · ")}
                    </p>
                )}
            </SettingsCard>

            {/* ── Post-call automation ── */}
            <SettingsCard icon={Bot} tone="teal" title="Après l'appel" subtitle="Ce que le CRM peut faire seul. Par défaut, tout est proposé et validé d'un clic.">
                <ul className="divide-y divide-slate-100">
                    {(Object.keys(data.kindLabels) as ProposalKind[]).map((kind) => {
                        const capped = data.ceilings.automation[kind] !== "auto";
                        return (
                            <li key={kind} className="flex items-center gap-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-zinc-900">{data.kindLabels[kind]}</p>
                                    {capped && <p className="text-[11px] font-medium text-zinc-400">Toujours validé par un SDR</p>}
                                </div>
                                <select
                                    className={SELECT}
                                    value={automation[kind]}
                                    onChange={(e) => setAutomation({ ...automation, [kind]: e.target.value as AutomationMode })}
                                    aria-label={data.kindLabels[kind]}
                                >
                                    <option value="off">Désactivé</option>
                                    <option value="suggest">Proposé au SDR</option>
                                    {!capped && <option value="auto">Automatique</option>}
                                </select>
                            </li>
                        );
                    })}
                </ul>
                <p className="mt-2 text-[11px] font-medium text-zinc-400">
                    « Automatique » ne s&apos;applique que si l&apos;IA cite la conversation avec une confiance suffisante ; sinon la proposition attend le SDR.
                </p>
            </SettingsCard>

            <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={() => { setDialer(data.dialer); setAutomation(data.automation); }} />
        </div>
    );
}

function Kpi({ label, value, hint, strong, warn }: { label: string; value: string | number; hint?: string; strong?: boolean; warn?: boolean }) {
    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{label}</dt>
            <dd className={cn("mt-1 text-xl font-extrabold tabular-nums", warn ? "text-amber-700" : strong ? "text-indigo-700" : "text-zinc-900")}>{value}</dd>
            {hint && <p className="text-[11px] font-medium text-zinc-400">{hint}</p>}
        </div>
    );
}
