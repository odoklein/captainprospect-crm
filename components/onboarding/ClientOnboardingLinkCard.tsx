"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Link2, Loader2, RefreshCw, Send } from "lucide-react";
import type { LinkInfo } from "@/lib/client-onboarding/service";
import { goalsSummary, icpSummary, parseExclusions, pitchSummary } from "@/lib/client-onboarding/questionnaire";

async function call(clientId: string, method: string, body?: unknown): Promise<LinkInfo> {
    const res = await fetch(`/api/clients/${clientId}/onboarding-link`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? "Erreur");
    return json.data;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");

/** « Onboarding client » : the shareable questionnaire link and the client's progress. */
export function ClientOnboardingLinkCard({ clientId }: { clientId: string }) {
    const qc = useQueryClient();
    const key = ["client-onboarding-link", clientId];
    const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => call(clientId, "GET"), staleTime: 30_000 });
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [kickoff, setKickoff] = useState<string | null>(null);
    const [message, setMessage] = useState("");
    const [error, setError] = useState<string | null>(null);

    const run = async (method: string, body?: unknown) => {
        setBusy(true);
        setError(null);
        try {
            qc.setQueryData(key, await call(clientId, method, body));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Erreur");
        } finally {
            setBusy(false);
        }
    };

    const url = data?.token ? `${window.location.origin}/onboarding/${data.token}` : null;
    const status = !data?.token ? null
        : data.submittedAt ? { text: `Validé le ${fmt(data.submittedAt)}`, cls: "bg-emerald-50 text-emerald-700" }
        : data.expired ? { text: "Lien expiré", cls: "bg-rose-50 text-rose-700" }
        : data.openedAt ? { text: `En cours · ${data.completion} %`, cls: "bg-amber-50 text-amber-800" }
        : { text: "Pas encore ouvert", cls: "bg-surface-2 text-ink-3" };

    return (
        <section className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Send className="h-4 w-4 text-ink-3" aria-hidden /> Questionnaire client
                </h3>
                {status && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status.cls}`}>{status.text}</span>}
            </div>
            {isLoading ? (
                <p className="mt-3 text-xs text-ink-3">Chargement…</p>
            ) : !url ? (
                <div className="mt-3 space-y-3">
                    <p className="text-xs text-ink-3">
                        Un lien à envoyer au client : il remplit son entreprise, ses cibles, son discours et ses objectifs, sans créer de compte. Ses réponses arrivent ici.
                    </p>
                    <label className="block text-xs font-medium text-ink-2">
                        Lien de RDV avec le chef de projet (facultatif)
                        <input type="url" value={kickoff ?? ""} onChange={(e) => setKickoff(e.target.value)} placeholder="https://calendly.com/…" className="mt-1 w-full rounded-lg border border-line px-2.5 py-1.5 text-sm" />
                        <span className="mt-1 block font-normal text-ink-3">Proposé au client une fois le questionnaire validé.</span>
                    </label>
                    <label className="block text-xs font-medium text-ink-2">
                        Mot d&apos;accueil (facultatif)
                        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={2} placeholder="Bonjour, voici votre espace de lancement…" className="mt-1 w-full rounded-lg border border-line px-2.5 py-1.5 text-sm" />
                    </label>
                    <button type="button" disabled={busy} onClick={() => run("POST", { welcomeMessage: message, ...(kickoff ? { kickoffUrl: kickoff.trim() } : {}) })} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />} Créer le lien client
                    </button>
                </div>
            ) : (
                <div className="mt-3 space-y-3">
                    <div className="flex gap-2">
                        <input readOnly value={url} aria-label="Lien du questionnaire" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink-2" />
                        <button type="button" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-semibold text-ink-2 hover:bg-surface-2">
                            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />} {copied ? "Copié" : "Copier"}
                        </button>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-line px-2.5 text-ink-2 hover:bg-surface-2" aria-label="Ouvrir le questionnaire">
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-primary" style={{ width: `${data?.submittedAt ? 100 : data?.completion ?? 0}%` }} /></div>
                    <p className="text-xs text-ink-3">
                        {data?.lastSeenAt ? `Dernière visite le ${fmt(data.lastSeenAt)}` : "Le client n'a pas encore ouvert le lien"}
                        {data?.expiresAt && ` · expire le ${fmt(data.expiresAt)}`}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs font-medium">
                        {data?.submittedAt && <button type="button" disabled={busy} onClick={() => run("PATCH", { reopen: true })} className="text-link hover:underline">Rouvrir les réponses</button>}
                        <button type="button" disabled={busy} onClick={() => confirm("Créer un nouveau lien ? L'ancien ne fonctionnera plus.") && run("POST", {})} className="inline-flex items-center gap-1 text-link hover:underline"><RefreshCw className="h-3 w-3" aria-hidden /> Nouveau lien</button>
                        <button type="button" disabled={busy} onClick={() => confirm("Désactiver ce lien ?") && run("DELETE")} className="text-rose-600 hover:underline">Désactiver</button>
                    </div>
                    <form
                        className="flex gap-2"
                        onSubmit={(e) => { e.preventDefault(); void run("PATCH", { kickoffUrl: (kickoff ?? data?.kickoffUrl ?? "").trim() }); }}
                    >
                        <input
                            type="url"
                            aria-label="Lien de RDV avec le chef de projet"
                            value={kickoff ?? data?.kickoffUrl ?? ""}
                            onChange={(e) => setKickoff(e.target.value)}
                            placeholder="Lien de RDV chef de projet (https://…)"
                            className="min-w-0 flex-1 rounded-lg border border-line px-2.5 py-1.5 text-xs"
                        />
                        <button type="submit" disabled={busy || kickoff === null} className="rounded-lg border border-line px-2.5 text-xs font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-40">Enregistrer</button>
                    </form>
                    {data?.state && (data.openedAt || data.submittedAt) && <Answers info={data} />}
                    {data?.submittedAt && <p className="text-xs text-ink-3">Le ciblage et le discours du client ont été copiés dans la fiche (ICP et pitch) s&apos;ils étaient vides.</p>}
                </div>
            )}
            {error && <p className="mt-2 text-xs text-rose-600" role="alert">{error}</p>}
        </section>
    );
}

/** Everything the client wrote, as the CRM summaries plus the « Prochaines étapes » items. */
function Answers({ info }: { info: LinkInfo }) {
    const a = info.state!.answers;
    const blacklist = parseExclusions(a.exclusions.text);
    const blocks: [string, string][] = [
        ["Entreprise & discours", pitchSummary(a)],
        ["Cibles", icpSummary(a)],
        ["Objectifs & interlocuteurs", goalsSummary(a)],
        ["Blacklist", blacklist.length ? `${blacklist.length} entreprises : ${blacklist.slice(0, 20).join(", ")}${blacklist.length > 20 ? "…" : ""}` : ""],
        ["Calendrier", [a.meetings.bookingUrl, a.meetings.attendee && `Participant : ${a.meetings.attendee}`, a.meetings.days.length ? `Jours : ${a.meetings.days.join(", ")}` : ""].filter(Boolean).join("\n")],
        ["Documents", a.documents.links],
    ];
    return (
        <details className="rounded-lg border border-line bg-surface-2/50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-ink">Voir les réponses</summary>
            <div className="mt-2 space-y-3">
                {blocks.filter(([, t]) => t.trim()).map(([title, t]) => (
                    <div key={title}>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-4">{title}</p>
                        <p className="whitespace-pre-line text-xs leading-relaxed text-ink-2">{t}</p>
                    </div>
                ))}
            </div>
        </details>
    );
}
