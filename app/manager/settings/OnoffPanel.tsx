"use client";

// ============================================
// Paramètres → Intégrations → Onoff Business. Two ways in, one card:
//   1. Appels en direct  the webhook: every new call lands in the CRM (Advanced or MAX)
//   2. Historique + IA   the API key (MAX only): past calls, recordings, Onoff's AI
//                        summaries and transcripts, imported by « Récupérer l'historique »
// Server side: app/api/manager/onoff, lib/onoff/import.ts.
// ============================================

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
    AlertTriangle, ArrowRight, AudioLines, CalendarRange, Check, CheckCircle2, ChevronDown, Copy, History, Loader2, PhoneIncoming, Sparkles, UserCheck, UserX, Users,
} from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FOCUS, Shimmer } from "@/components/accueil/AccueilUI";
import { FormStatus, INPUT, Notice, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/settings/SettingsUI";
import type { IntegrationKeyStatus } from "@/lib/integrations/store";
import { KeyLine } from "./KeyEditor";

interface Run {
    id: string;
    status: "running" | "done" | "failed" | "interrupted";
    fromDate: string;
    toDate: string;
    phase: "members" | "calls" | "details" | "linking" | "done";
    membersTotal: number;
    membersDone: number;
    callsFound: number;
    callsNew: number;
    detailsTotal: number;
    detailsDone: number;
    recordings: number;
    summaries: number;
    actionsLinked: number;
    unmatched: { name: string; email: string | null }[];
    error: string | null;
    startedAt: string;
    finishedAt: string | null;
}

interface OnoffState {
    webhookConfigured: boolean;
    apiConfigured: boolean;
    stats: { calls: number; withSummary: number; withAudio: number; lastCallAt: string | null };
    runs: Run[];
}

interface MemberPreview {
    id: string;
    name: string;
    email: string | null;
    numbers: string[];
    user: { id: string; name: string } | null;
}

async function api<T>(init?: RequestInit, query = ""): Promise<T> {
    const res = await fetch(`/api/manager/onoff${query}`, init);
    const json = await res.json().catch(() => null);
    if (!json?.success) throw new Error(json?.error || "Erreur de connexion");
    return json.data as T;
}

const nf = new Intl.NumberFormat("fr-FR");
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const fmtWhen = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function localDay(d: Date) {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
    return z.toISOString().slice(0, 10);
}

const PRESETS: { id: string; label: string; days: number }[] = [
    { id: "7", label: "7 jours", days: 7 },
    { id: "30", label: "30 jours", days: 30 },
    { id: "90", label: "3 mois", days: 90 },
    { id: "180", label: "6 mois", days: 180 },
    { id: "365", label: "12 mois", days: 365 },
];

const WEBHOOK_PATH = "/api/webhooks/onoff";
const noSubscribe = () => () => {};

export function OnoffPanel({ keys, onKeysChanged }: { keys: IntegrationKeyStatus[]; onKeysChanged: (k: IntegrationKeyStatus[]) => void }) {
    const [state, setState] = useState<OnoffState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const webhookKey = keys.find((k) => k.name === "ONOFF_WEBHOOK_KEY");
    const apiKey = keys.find((k) => k.name === "ONOFF_API_KEY");
    const apiOn = !!apiKey && apiKey.source !== "none";
    const hookOn = !!webhookKey && webhookKey.source !== "none";

    // Bumped to reload: a key saved, an import started, or every 2 s while one runs.
    const [tick, setTick] = useState(0);
    const reload = useCallback(() => setTick((t) => t + 1), []);

    useEffect(() => {
        let alive = true;
        api<OnoffState>()
            .then((d) => {
                if (!alive) return;
                setState(d);
                setError(null);
            })
            .catch((e) => alive && setError(e instanceof Error ? e.message : "Erreur de connexion"));
        return () => {
            alive = false;
        };
    }, [tick, apiOn, hookOn]);

    const running = state?.runs.find((r) => r.status === "running") ?? null;
    useEffect(() => {
        if (!running) return;
        const t = setInterval(reload, 2_000);
        return () => clearInterval(t);
    }, [running, reload]);

    return (
        <section aria-labelledby="onoff-title" className="rounded-3xl border border-line bg-surface shadow-card overflow-hidden">
            <header className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 bg-[linear-gradient(135deg,rgba(16,185,129,0.08),transparent_55%)]">
                <span className="w-12 h-12 rounded-2xl bg-zinc-950 text-white flex items-center justify-center text-[15px] font-black tracking-tight shadow-[0_6px_16px_rgba(9,9,11,0.22)] flex-shrink-0" aria-hidden>
                    On
                </span>
                <div className="min-w-0 flex-1">
                    <h3 id="onoff-title" className="text-lg font-black tracking-tight text-ink">Onoff Business</h3>
                    <p className="text-xs font-medium text-ink-3 leading-relaxed">
                        Les appels de vos SDR arrivent dans le CRM, rattachés au bon prospect et au RDV, avec l&apos;enregistrement et le résumé IA.
                    </p>
                </div>
                {state && (
                    <dl className="grid grid-cols-3 gap-2 sm:w-[300px] flex-shrink-0">
                        <Stat label="Appels" value={nf.format(state.stats.calls)} />
                        <Stat label="Audio" value={nf.format(state.stats.withAudio)} />
                        <Stat label="Résumés IA" value={nf.format(state.stats.withSummary)} />
                    </dl>
                )}
            </header>

            {error && <div className="px-5 sm:px-6 pb-4"><Notice tone="rose">{error}</Notice></div>}

            <div className="grid lg:grid-cols-2 border-t border-line">
                <div className="p-5 sm:p-6 space-y-4 lg:border-r border-line">
                    <StepTitle n={1} icon={PhoneIncoming} title="Appels en direct" done={hookOn} plan="Plan Advanced ou MAX" />
                    <p className="text-xs font-medium text-ink-3 leading-relaxed">
                        Chaque nouvel appel est envoyé au CRM dès qu&apos;il se termine.
                        {state?.stats.lastCallAt && <> Dernier appel reçu le <b className="text-ink-2">{fmtWhen(state.stats.lastCallAt)}</b>.</>}
                    </p>
                    <WebhookUrl />
                    {webhookKey && <KeyLine key={`${webhookKey.name}:${webhookKey.source}`} item={webhookKey} keys={keys} onSaved={onKeysChanged} />}
                    <Disclosure label="Comment brancher Onoff">
                        <ol className="space-y-2">
                            {[
                                "Créez une clé de 24 caractères minimum et enregistrez-la ci-dessus.",
                                "Console Onoff → Intégrations → Webhook « Appels » : collez l'adresse et la même clé (« Api key »), puis « Intégrer ».",
                                "Activez l'enregistrement des appels dans Onoff. Chaque SDR doit avoir le même e-mail dans Onoff et dans le CRM, sinon renseignez son numéro Onoff dans sa fiche.",
                            ].map((s, i) => (
                                <li key={s} className="flex gap-2 text-xs font-medium leading-relaxed text-ink-2">
                                    <span className="w-5 h-5 rounded-full bg-surface-2 text-[11px] font-black text-ink flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                    {s}
                                </li>
                            ))}
                        </ol>
                    </Disclosure>
                </div>

                <div className="p-5 sm:p-6 space-y-4 border-t lg:border-t-0 border-line">
                    <StepTitle n={2} icon={History} title="Historique + résumés IA" done={apiOn} plan="Plan MAX" accent />
                    <p className="text-xs font-medium text-ink-3 leading-relaxed">
                        Récupère les appels passés avec leur enregistrement, le résumé et la transcription faits par l&apos;IA d&apos;Onoff, puis les rattache aux fiches.
                    </p>
                    {apiKey && <KeyLine key={`${apiKey.name}:${apiKey.source}`} item={apiKey} keys={keys} onSaved={onKeysChanged} />}
                    {!apiOn && (
                        <Notice tone="amber" icon={AlertTriangle}>
                            L&apos;API Onoff n&apos;est ouverte que sur le <b>plan MAX</b>. Un administrateur crée la clé dans la console Onoff → Intégrations → Clés API.
                            Sans elle, seuls les appels reçus en direct (étape 1) sont dans le CRM.
                        </Notice>
                    )}
                    {apiOn && <MembersCheck />}
                </div>
            </div>

            {apiOn && (
                <div className="border-t border-line p-5 sm:p-6 space-y-5 bg-surface-2/40">
                    {state ? <ImportBox state={state} running={running} onStarted={reload} /> : <Shimmer className="h-40 rounded-2xl" />}
                </div>
            )}
        </section>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-surface border border-line px-2.5 py-2 text-center">
            <dd className="text-base font-black tabular-nums text-ink leading-none">{value}</dd>
            <dt className="text-[10px] font-bold text-ink-3 mt-1">{label}</dt>
        </div>
    );
}

function StepTitle({ n, icon: Icon, title, done, plan, accent }: { n: number; icon: typeof History; title: string; done: boolean; plan: string; accent?: boolean }) {
    return (
        <div className="flex items-center gap-2.5">
            <span className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0", done ? "bg-emerald-500 text-white" : "bg-surface-2 text-ink-2")}>
                {done ? <Check className="w-4 h-4" aria-hidden /> : n}
            </span>
            <Icon className="w-4 h-4 text-ink-3 flex-shrink-0" aria-hidden />
            <h4 className="text-sm font-black text-ink">{title}</h4>
            <span className={cn("ml-auto text-[10px] font-extrabold px-2 py-0.5 rounded-md whitespace-nowrap", accent ? "bg-zinc-950 text-white" : "bg-surface-2 text-ink-2")}>{plan}</span>
        </div>
    );
}

function WebhookUrl() {
    const { success } = useToast();
    const url = useSyncExternalStore(noSubscribe, () => `${window.location.origin}${WEBHOOK_PATH}`, () => WEBHOOK_PATH);
    const [copied, setCopied] = useState(false);
    return (
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-1.5 pl-3">
            <code className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-ink-2">{url}</code>
            <button
                type="button"
                className={cn(SECONDARY_BUTTON, "h-8")}
                onClick={() => {
                    void navigator.clipboard?.writeText(url).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1_500);
                        success("Adresse copiée", "Collez-la dans Onoff → Intégrations → Webhook « Appels ».");
                    });
                }}
            >
                {copied ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
                {copied ? "Copiée" : "Copier"}
            </button>
        </div>
    );
}

function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <details className="group">
            <summary className="list-none cursor-pointer inline-flex items-center gap-1 text-xs font-bold text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" aria-hidden />
                {label}
            </summary>
            <div className="pt-3">{children}</div>
        </details>
    );
}

/** « Tester la clé » : who Onoff knows, and whether the CRM can tell who made each call. */
function MembersCheck() {
    const [members, setMembers] = useState<MemberPreview[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const run = async () => {
        setBusy(true);
        setError(null);
        try {
            setMembers(await api<MemberPreview[]>(undefined, "?members=1"));
        } catch (e) {
            setMembers(null);
            setError(e instanceof Error ? e.message : "Erreur de connexion");
        } finally {
            setBusy(false);
        }
    };

    const unmatched = members?.filter((m) => !m.user) ?? [];
    return (
        <div className="space-y-3">
            <button type="button" onClick={run} disabled={busy} className={SECONDARY_BUTTON}>
                {busy ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden /> : <Users className="w-3.5 h-3.5" aria-hidden />}
                Tester la clé et voir les membres
            </button>
            <FormStatus error={error} />
            {members && (
                <div className="rounded-xl border border-line overflow-hidden">
                    <p className="px-3 py-2 text-[11px] font-bold text-ink-2 bg-surface-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden />
                        Clé valide · {members.length} membre{members.length > 1 ? "s" : ""} Onoff
                        {unmatched.length > 0 && <span className="ml-auto text-amber-700">{unmatched.length} sans compte CRM</span>}
                    </p>
                    <ul className="max-h-56 overflow-y-auto divide-y divide-line">
                        {members.map((m) => (
                            <li key={m.id} className="px-3 py-2 flex items-center gap-2.5">
                                {m.user ? <UserCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden /> : <UserX className="w-4 h-4 text-amber-600 flex-shrink-0" aria-hidden />}
                                <span className="min-w-0 flex-1">
                                    <span className="block text-xs font-bold text-ink truncate">{m.name}</span>
                                    <span className="block text-[11px] font-medium text-ink-3 truncate">{m.email ?? m.numbers.join(", ")}</span>
                                </span>
                                <span className={cn("text-[11px] font-bold truncate max-w-[45%]", m.user ? "text-ink-2" : "text-amber-700")}>
                                    {m.user ? `→ ${m.user.name}` : "Aucun compte CRM"}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {unmatched.length > 0 && (
                        <p className="px-3 py-2 text-[11px] font-medium text-ink-3 border-t border-line">
                            Leurs appels seront importés sans SDR. Pour les rattacher, donnez-leur le même e-mail dans le CRM, ou renseignez leur numéro Onoff dans leur fiche.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Import ──────────────────────────────────────────────────────────────────

const PHASES: { id: Run["phase"]; label: string }[] = [
    { id: "members", label: "Membres" },
    { id: "calls", label: "Appels" },
    { id: "details", label: "Audio & IA" },
    { id: "linking", label: "Fiches" },
];

function ImportBox({ state, running, onStarted }: { state: OnoffState; running: Run | null; onStarted: () => void }) {
    const toast = useToast();
    const today = useMemo(() => localDay(new Date()), []);
    const [preset, setPreset] = useState("90");
    const [from, setFrom] = useState(() => localDay(new Date(Date.now() - 89 * 86_400_000)));
    const [to, setTo] = useState(today);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const choose = (id: string) => {
        setPreset(id);
        const p = PRESETS.find((x) => x.id === id);
        if (p) {
            setFrom(localDay(new Date(Date.now() - (p.days - 1) * 86_400_000)));
            setTo(today);
        }
    };

    const start = async () => {
        setBusy(true);
        setError(null);
        try {
            await api<{ runId: string }>({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to }) });
            toast.success("Import lancé", "Vous pouvez quitter la page : il continue sur le serveur.");
            onStarted();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Erreur de connexion");
        } finally {
            setBusy(false);
        }
    };

    const past = state.runs.filter((r) => r.id !== running?.id);

    return (
        <>
            {running ? (
                <RunProgress run={running} />
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <CalendarRange className="w-4 h-4 text-ink-3" aria-hidden />
                        <h4 className="text-sm font-black text-ink">Récupérer l&apos;historique</h4>
                    </div>
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Période">
                        {[...PRESETS, { id: "custom", label: "Personnalisé", days: 0 }].map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                role="radio"
                                aria-checked={preset === p.id}
                                onClick={() => choose(p.id)}
                                className={cn(
                                    "h-8 px-3 rounded-xl text-xs font-bold border transition-colors",
                                    FOCUS,
                                    preset === p.id ? "bg-zinc-950 border-zinc-950 text-white" : "bg-surface border-line text-ink-2 hover:border-line-strong",
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    {preset === "custom" && (
                        <div className="grid grid-cols-2 gap-3 max-w-md">
                            <label className="space-y-1">
                                <span className="text-[11px] font-bold text-ink-3">Du</span>
                                <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={INPUT} />
                            </label>
                            <label className="space-y-1">
                                <span className="text-[11px] font-bold text-ink-3">Au</span>
                                <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className={INPUT} />
                            </label>
                        </div>
                    )}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <button type="button" onClick={start} disabled={busy || !from || !to} className={cn(PRIMARY_BUTTON, "sm:w-auto")}>
                            {busy ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden /> : <ArrowRight className="w-4 h-4" aria-hidden />}
                            Récupérer du {from ? fmtDay(from) : "…"} au {to ? fmtDay(to) : "…"}
                        </button>
                        <p className="text-[11px] font-medium text-ink-3 leading-relaxed">
                            Sans doublons : relancer sur la même période complète ce qui manque. Comptez environ 1 minute pour 100 appels décrochés.
                        </p>
                    </div>
                    <FormStatus error={error} />
                </div>
            )}

            {past.length > 0 && (
                <div className="space-y-2">
                    <p className="text-[11px] font-bold text-ink-3">Derniers imports</p>
                    <ul className="space-y-1.5">
                        {past.map((r) => <RunRow key={r.id} run={r} />)}
                    </ul>
                </div>
            )}
        </>
    );
}

function RunProgress({ run }: { run: Run }) {
    const phaseIndex = PHASES.findIndex((p) => p.id === run.phase);
    const pct =
        run.phase === "members" ? 4
        : run.phase === "calls" ? 5 + Math.round((run.membersDone / Math.max(1, run.membersTotal)) * 40)
        : run.phase === "details" ? 45 + Math.round((run.detailsDone / Math.max(1, run.detailsTotal)) * 45)
        : 92;
    return (
        <div className="space-y-4" role="status" aria-live="polite">
            <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-emerald-600 motion-safe:animate-spin" aria-hidden />
                <h4 className="text-sm font-black text-ink">Import en cours · {fmtDay(run.fromDate)} → {fmtDay(run.toDate)}</h4>
                <span className="ml-auto text-sm font-black tabular-nums text-ink">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
            </div>
            <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PHASES.map((p, i) => {
                    const done = i < phaseIndex;
                    const now = i === phaseIndex;
                    const detail =
                        p.id === "members" ? (run.membersTotal ? `${run.membersTotal} membres` : "")
                        : p.id === "calls" ? (run.callsFound ? `${nf.format(run.callsFound)} appels · ${nf.format(run.callsNew)} nouveaux` : now ? `${run.membersDone}/${run.membersTotal} membres` : "")
                        : p.id === "details" ? (run.detailsTotal ? `${nf.format(run.detailsDone)}/${nf.format(run.detailsTotal)}` : "")
                        : run.actionsLinked ? `${nf.format(run.actionsLinked)} complétées` : "";
                    return (
                        <li key={p.id} className={cn("rounded-xl border px-3 py-2", now ? "border-emerald-300 bg-emerald-50/60" : "border-line bg-surface")}>
                            <p className={cn("flex items-center gap-1.5 text-xs font-extrabold", done ? "text-emerald-700" : now ? "text-ink" : "text-ink-3")}>
                                {done ? <Check className="w-3.5 h-3.5" aria-hidden /> : now ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden /> : <span className="w-3.5 h-3.5 rounded-full border border-line" aria-hidden />}
                                {p.label}
                            </p>
                            {detail && <p className="text-[11px] font-medium text-ink-3 mt-0.5 tabular-nums truncate">{detail}</p>}
                        </li>
                    );
                })}
            </ol>
            <p className="text-[11px] font-medium text-ink-3">Vous pouvez quitter la page : l&apos;import continue sur le serveur.</p>
        </div>
    );
}

function RunRow({ run }: { run: Run }) {
    const look =
        run.status === "done" ? { icon: CheckCircle2, cls: "text-emerald-600", label: "Terminé" }
        : run.status === "failed" ? { icon: AlertTriangle, cls: "text-rose-600", label: "Échec" }
        : { icon: AlertTriangle, cls: "text-amber-600", label: "Interrompu (relancez-le)" };
    return (
        <li className="rounded-xl bg-surface border border-line px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <look.icon className={cn("w-4 h-4 flex-shrink-0", look.cls)} aria-hidden />
            <span className="text-xs font-bold text-ink">{fmtDay(run.fromDate)} → {fmtDay(run.toDate)}</span>
            <span className={cn("text-[11px] font-bold", look.cls)}>{look.label}</span>
            <span className="ml-auto flex flex-wrap items-center gap-3 text-[11px] font-semibold text-ink-3 tabular-nums">
                <span>{nf.format(run.callsFound)} appels</span>
                <span className="inline-flex items-center gap-1"><AudioLines className="w-3 h-3" aria-hidden />{nf.format(run.recordings)}</span>
                <span className="inline-flex items-center gap-1"><Sparkles className="w-3 h-3" aria-hidden />{nf.format(run.summaries)}</span>
                <span>{nf.format(run.actionsLinked)} fiches complétées</span>
            </span>
            {run.error && <p className="w-full text-[11px] font-semibold text-rose-700">{run.error}</p>}
            {run.status === "done" && run.unmatched.length > 0 && (
                <p className="w-full text-[11px] font-medium text-amber-700">
                    Sans compte CRM : {run.unmatched.map((u) => u.name).join(", ")}
                </p>
            )}
        </li>
    );
}
