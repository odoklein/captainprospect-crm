"use client";

// ============================================
// Paramètres → Téléphonie → Lignes et fournisseurs → Kavkom. One card, three steps:
//   1. Appeler depuis le CRM   API token + domain: « Appeler » rings the SDR's Kavkom app, then the prospect
//   2. Appels en direct        the webhook: ringing, answered, end of call, recording, transcript
//   3. Qui est qui             each SDR's extension (auto-matched by e-mail, or in their fiche)
//   4. Téléphone dans le CRM   Kavkom's WebRTC address: the CRM tab becomes the SDR's phone (no Kavkom app)
// Server side: app/api/manager/kavkom, lib/kavkom.
// ============================================

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Copy, Headphones, Loader2, PhoneCall, PhoneIncoming, UserCheck, UserX, Users, Wand2 } from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FormStatus, Notice, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/settings/SettingsUI";
import type { IntegrationKeyStatus } from "@/lib/integrations/store";
import { KeyLine } from "./KeyEditor";

interface KavkomState {
    apiConfigured: boolean;
    webhookConfigured: boolean;
    autoAnswer: boolean;
    dialFormat: string;
    stats: { calls: number; withAudio: number; withSummary: number; lastCallAt: string | null; assigned: number };
}

interface ExtensionRow {
    uuid: string;
    extension: string;
    enabled: boolean;
    name: string | null;
    userEmail: string | null;
    callerIdNumber: string | null;
    user: { id: string; name: string } | null;
    suggested: { id: string; name: string } | null;
}

async function api<T>(init?: RequestInit, query = ""): Promise<T> {
    const res = await fetch(`/api/manager/kavkom${query}`, init);
    const json = await res.json().catch(() => null);
    if (!json?.success) throw new Error(json?.error || "Erreur de connexion");
    return json.data as T;
}

const nf = new Intl.NumberFormat("fr-FR");
const fmtWhen = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const WEBHOOK_PATH = "/api/webhooks/kavkom";
const noSubscribe = () => () => {};

export function KavkomPanel({ keys, onKeysChanged }: { keys: IntegrationKeyStatus[]; onKeysChanged: (k: IntegrationKeyStatus[]) => void }) {
    const [state, setState] = useState<KavkomState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const token = keys.find((k) => k.name === "KAVKOM_API_TOKEN");
    const domain = keys.find((k) => k.name === "KAVKOM_DOMAIN_UUID");
    const secret = keys.find((k) => k.name === "KAVKOM_WEBHOOK_SECRET");
    const wss = keys.find((k) => k.name === "KAVKOM_SIP_WSS_URL");
    const sipDomain = keys.find((k) => k.name === "KAVKOM_SIP_DOMAIN");
    const webphoneOn = !!wss && wss.source !== "none";
    const apiOn = !!token && token.source !== "none" && !!domain && domain.source !== "none";
    const hookOn = !!secret && secret.source !== "none";

    const [tick, setTick] = useState(0);
    const reload = useCallback(() => setTick((t) => t + 1), []);
    useEffect(() => {
        let alive = true;
        api<KavkomState>()
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

    return (
        <section aria-labelledby="kavkom-title" className="rounded-3xl border border-line bg-surface shadow-card overflow-hidden">
            <header className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 bg-[linear-gradient(135deg,rgba(59,130,246,0.08),transparent_55%)]">
                <span className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-[15px] font-semibold tracking-tight shadow-[0_6px_16px_rgba(37,99,235,0.28)] flex-shrink-0" aria-hidden>
                    Kv
                </span>
                <div className="min-w-0 flex-1">
                    <h3 id="kavkom-title" className="text-lg font-semibold tracking-tight text-ink">Kavkom</h3>
                    <p className="text-xs font-medium text-ink-3 leading-relaxed">
                        « Appeler » dans le CRM fait sonner l&apos;application Kavkom du SDR puis le prospect. Chaque appel revient sur la fiche : statut, durée, enregistrement, transcription et résumé IA.
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
                    <StepTitle n={1} icon={PhoneCall} title="Appeler depuis le CRM" done={apiOn} />
                    <p className="text-xs font-medium text-ink-3 leading-relaxed">
                        Le jeton API et le domaine se trouvent dans Kavkom → Réglages avancés → API.
                        {state?.apiConfigured && (state.autoAnswer
                            ? " L'application Kavkom du SDR décroche toute seule : un clic dans le CRM et le prospect sonne."
                            : " Le SDR décroche d'abord sur Kavkom, puis le prospect sonne (KAVKOM_AUTO_ANSWER=0).")}
                    </p>
                    {token && <KeyLine key={`${token.name}:${token.source}`} item={token} keys={keys} onSaved={onKeysChanged} />}
                    {domain && <KeyLine key={`${domain.name}:${domain.source}`} item={domain} keys={keys} onSaved={onKeysChanged} />}
                </div>

                <div className="p-5 sm:p-6 space-y-4 border-t lg:border-t-0 border-line">
                    <StepTitle n={2} icon={PhoneIncoming} title="Appels en direct" done={hookOn} />
                    <p className="text-xs font-medium text-ink-3 leading-relaxed">
                        Kavkom prévient le CRM à chaque étape : sonnerie, décroché, fin d&apos;appel, enregistrement, transcription. Les appels entrants ouvrent la fiche de l&apos;appelant.
                        {state?.stats.lastCallAt && <> Dernier appel reçu le <b className="text-ink-2">{fmtWhen(state.stats.lastCallAt)}</b>.</>}
                    </p>
                    <WebhookUrl />
                    {secret && <KeyLine key={`${secret.name}:${secret.source}`} item={secret} keys={keys} onSaved={onKeysChanged} />}
                    <Disclosure label="Comment brancher Kavkom">
                        <ol className="space-y-2">
                            {[
                                "Créez un secret de 24 caractères minimum et enregistrez-le ci-dessus.",
                                "Kavkom → Réglages avancés → Intégrations → Webhook → Installer : collez l'adresse ci-dessus.",
                                "Dans « Headers », ajoutez Authorization avec la valeur « Bearer » suivie d'un espace et du secret.",
                                "Cochez les appels entrants, sortants et le CDR, et laissez le mapping par défaut. Activez l'enregistrement (et la transcription si votre offre l'inclut).",
                            ].map((s, i) => (
                                <li key={s} className="flex gap-2 text-xs font-medium leading-relaxed text-ink-2">
                                    <span className="w-5 h-5 rounded-full bg-surface-2 text-[11px] font-semibold text-ink flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                    {s}
                                </li>
                            ))}
                        </ol>
                    </Disclosure>
                </div>
            </div>

            {apiOn && (
                <div className="border-t border-line p-5 sm:p-6 space-y-4 bg-surface-2/40">
                    <StepTitle n={3} icon={Users} title="Extensions des SDR" done={(state?.stats.assigned ?? 0) > 0} />
                    <p className="text-xs font-medium text-ink-3 leading-relaxed">
                        Un SDR appelle via Kavkom dès qu&apos;il a une extension. Elles sont rattachées par e-mail, ou à la main dans la fiche de l&apos;utilisateur (Extension Kavkom).
                        {state && <> {state.stats.assigned} utilisateur{state.stats.assigned > 1 ? "s" : ""} relié{state.stats.assigned > 1 ? "s" : ""}.</>}
                    </p>
                    <Extensions onChanged={reload} />
                </div>
            )}

            {apiOn && (
                <div className="border-t border-line p-5 sm:p-6 space-y-4">
                    <StepTitle n={4} icon={Headphones} title="Téléphone dans le CRM" done={webphoneOn} />
                    <p className="text-xs font-medium text-ink-3 leading-relaxed">
                        {webphoneOn
                            ? "L'onglet du CRM est le téléphone Kavkom du SDR : micro, casque, sonnerie, clavier et coupure du micro dans la barre d'appel. Plus besoin de l'application Kavkom."
                            : "Sans cette adresse, les appels sonnent dans l'application Kavkom du SDR. Avec elle, l'onglet du CRM devient son téléphone : plus d'application à ouvrir à côté."}
                    </p>
                    {wss && <KeyLine key={`${wss.name}:${wss.source}`} item={wss} keys={keys} onSaved={onKeysChanged} />}
                    {sipDomain && <KeyLine key={`${sipDomain.name}:${sipDomain.source}`} item={sipDomain} keys={keys} onSaved={onKeysChanged} />}
                    <Notice tone="amber" icon={AlertTriangle}>
                        Demandez au support Kavkom l&apos;adresse WebRTC (wss://…) de votre standard. Le mot de passe SIP de chaque extension est lu chez Kavkom
                        au moment de la connexion et n&apos;est envoyé qu&apos;au navigateur de son SDR. Si le CRM ne peut pas se connecter, les appels sonnent
                        dans l&apos;application Kavkom comme avant.
                    </Notice>
                </div>
            )}
        </section>
    );
}

function Extensions({ onChanged }: { onChanged: () => void }) {
    const { success } = useToast();
    const [rows, setRows] = useState<ExtensionRow[] | null>(null);
    const [busy, setBusy] = useState<"list" | "match" | null>(null);
    const [error, setError] = useState<string | null>(null);

    const list = async () => {
        setBusy("list");
        setError(null);
        try {
            setRows(await api<ExtensionRow[]>(undefined, "?extensions=1"));
        } catch (e) {
            setRows(null);
            setError(e instanceof Error ? e.message : "Erreur de connexion");
        } finally {
            setBusy(null);
        }
    };

    const match = async () => {
        setBusy("match");
        setError(null);
        try {
            const r = await api<{ assigned: number; extensions: ExtensionRow[] }>({
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "match" }),
            });
            setRows(r.extensions);
            success(r.assigned ? `${r.assigned} extension${r.assigned > 1 ? "s" : ""} attribuée${r.assigned > 1 ? "s" : ""}` : "Rien à attribuer", r.assigned ? "Ces SDR appellent maintenant via Kavkom." : "Chaque extension a déjà son utilisateur, ou aucun e-mail ne correspond.");
            onChanged();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Erreur de connexion");
        } finally {
            setBusy(null);
        }
    };

    const suggestions = rows?.filter((r) => r.enabled && r.suggested).length ?? 0;
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={list} disabled={!!busy} className={SECONDARY_BUTTON}>
                    {busy === "list" ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden /> : <Users className="w-3.5 h-3.5" aria-hidden />}
                    Tester la connexion et voir les extensions
                </button>
                {rows && suggestions > 0 && (
                    <button type="button" onClick={match} disabled={!!busy} className={PRIMARY_BUTTON}>
                        {busy === "match" ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden /> : <Wand2 className="w-3.5 h-3.5" aria-hidden />}
                        Relier {suggestions} extension{suggestions > 1 ? "s" : ""} par e-mail
                    </button>
                )}
            </div>
            <FormStatus error={error} />
            {rows && (
                <div className="rounded-xl border border-line overflow-hidden bg-surface">
                    <p className="px-3 py-2 text-[11px] font-medium text-ink-2 bg-surface-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden />
                        Connexion valide · {rows.length} extension{rows.length > 1 ? "s" : ""}
                    </p>
                    <ul className="max-h-64 overflow-y-auto divide-y divide-line">
                        {rows.map((r) => (
                            <li key={r.uuid} className={cn("px-3 py-2 flex items-center gap-2.5", !r.enabled && "opacity-50")}>
                                {r.user ? <UserCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden /> : <UserX className="w-4 h-4 text-amber-600 flex-shrink-0" aria-hidden />}
                                <code className="text-xs font-semibold tabular-nums text-ink w-12 flex-shrink-0">{r.extension}</code>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-xs font-medium text-ink truncate">{r.name ?? "Sans nom"}</span>
                                    <span className="block text-[11px] font-medium text-ink-3 truncate">{r.userEmail ?? r.callerIdNumber ?? "—"}</span>
                                </span>
                                <span className={cn("text-[11px] font-medium truncate max-w-[45%]", r.user ? "text-ink-2" : r.suggested ? "text-blue-700" : "text-amber-700")}>
                                    {r.user ? `→ ${r.user.name}` : r.suggested ? `→ ${r.suggested.name} (même e-mail)` : r.enabled ? "Aucun utilisateur" : "Désactivée"}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-surface border border-line px-2.5 py-2 text-center">
            <dd className="text-base font-semibold tabular-nums text-ink leading-none">{value}</dd>
            <dt className="text-[10px] font-medium text-ink-3 mt-1">{label}</dt>
        </div>
    );
}

function StepTitle({ n, icon: Icon, title, done }: { n: number; icon: typeof Users; title: string; done: boolean }) {
    return (
        <div className="flex items-center gap-2.5">
            <span className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0", done ? "bg-emerald-500 text-white" : "bg-surface-2 text-ink-2")}>
                {done ? <Check className="w-4 h-4" aria-hidden /> : n}
            </span>
            <Icon className="w-4 h-4 text-ink-3 flex-shrink-0" aria-hidden />
            <h4 className="text-sm font-semibold text-ink">{title}</h4>
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
                        success("Adresse copiée", "Collez-la dans Kavkom → Intégrations → Webhook.");
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
            <summary className="list-none cursor-pointer inline-flex items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" aria-hidden />
                {label}
            </summary>
            <div className="pt-3">{children}</div>
        </details>
    );
}
