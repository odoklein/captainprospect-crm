"use client";

// Why a recording, transcript or summary is missing — read from the server,
// not guessed: each prerequisite, then what Twilio delivered for the last calls.

import { useState } from "react";
import { Check, Minus, Stethoscope, X } from "lucide-react";
import { Drawer } from "@/components/ui";
import { cn } from "@/lib/utils";
import { TELEPHONY_STATUS_LABELS, type TelephonyStatus } from "@/lib/telephony/status";

interface Diagnostics {
    checks: { id: string; label: string; ok: boolean; detail: string }[];
    calls: {
        id: string;
        at: string;
        sdr: string;
        status: TelephonyStatus;
        reachedTwilio: boolean;
        answered: boolean;
        durationSec: number | null;
        recording: boolean;
        transcriptLines: number;
        summary: string | null;
        summaryNote: string | null;
        errorCode: string | null;
        qualified: boolean;
    }[];
}

const SUMMARY_LABEL: Record<string, string> = { done: "Résumé prêt", pending: "En cours", skipped: "Ignoré", failed: "Échec" };

function Mark({ ok, neutral }: { ok: boolean; neutral?: boolean }) {
    if (neutral) return <Minus className="h-3.5 w-3.5 text-ink-4" aria-label="sans objet" />;
    return ok ? <Check className="h-3.5 w-3.5 text-success" aria-label="oui" /> : <X className="h-3.5 w-3.5 text-danger" aria-label="non" />;
}

export function TelephonyDiagnosticsButton() {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState<Diagnostics | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = () => {
        setOpen(true);
        setError(null);
        fetch("/api/manager/telephony/diagnostics")
            .then((r) => r.json())
            .then((json) => (json?.success ? setData(json.data) : setError(json?.error ?? "Diagnostic impossible")))
            .catch(() => setError("Diagnostic impossible"));
    };

    return (
        <>
            <button
                type="button"
                onClick={load}
                className="cp-press flex h-8 items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-[12px] font-medium text-ink-2 hover:text-ink"
            >
                <Stethoscope className="h-3.5 w-3.5" /> Diagnostic
            </button>
            <Drawer isOpen={open} onClose={() => setOpen(false)} size="lg" title="Diagnostic téléphonie" description="Ce que le CRM et Twilio ont réellement reçu">
                {error && <p className="text-[13px] text-danger-ink">{error}</p>}
                {!data && !error && (
                    <div className="space-y-3">
                        {[90, 70, 80].map((w) => (
                            <div key={w} className="cp-shimmer h-3 rounded" style={{ width: `${w}%` }} />
                        ))}
                    </div>
                )}
                {data && (
                    <div className="cp-stagger space-y-6">
                        <section>
                            <h3 className="mb-2 text-[13px] font-semibold text-ink">Prérequis</h3>
                            <ul className="divide-y divide-line-subtle rounded-control border border-line">
                                {data.checks.map((c) => (
                                    <li key={c.id} className="flex items-start gap-3 px-3 py-2.5 text-[13px]">
                                        <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", c.ok ? "bg-success-soft" : "bg-danger-soft")}>
                                            <Mark ok={c.ok} />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block font-medium text-ink">{c.label}</span>
                                            <span className="block break-words text-[12px] text-ink-3">{c.detail}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        <section>
                            <h3 className="mb-2 text-[13px] font-semibold text-ink">Derniers appels du téléphone intégré</h3>
                            {data.calls.length === 0 ? (
                                <p className="text-[13px] text-ink-3">Aucun appel passé depuis le CRM pour l&apos;instant.</p>
                            ) : (
                                <div className="overflow-x-auto rounded-control border border-line">
                                    <table className="w-full min-w-[620px] text-[12px]">
                                        <thead>
                                            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
                                                <th className="px-3 py-2 font-semibold">Appel</th>
                                                <th className="px-2 py-2 text-center font-semibold" title="Twilio a demandé quoi composer">Twilio</th>
                                                <th className="px-2 py-2 text-center font-semibold">Décroché</th>
                                                <th className="px-2 py-2 text-center font-semibold">Enreg.</th>
                                                <th className="px-2 py-2 text-center font-semibold">Transcr.</th>
                                                <th className="px-3 py-2 font-semibold">Résumé</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.calls.map((c) => (
                                                <tr key={c.id} className="border-t border-line-subtle align-top">
                                                    <td className="px-3 py-2">
                                                        <span className="block text-ink">
                                                            {new Date(c.at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {c.sdr}
                                                        </span>
                                                        <span className="block text-ink-3">
                                                            {TELEPHONY_STATUS_LABELS[c.status]}
                                                            {c.errorCode ? ` · erreur ${c.errorCode}` : ""}
                                                        </span>
                                                    </td>
                                                    <td className="px-2 py-2"><span className="flex justify-center"><Mark ok={c.reachedTwilio} /></span></td>
                                                    <td className="px-2 py-2"><span className="flex justify-center"><Mark ok={c.answered} neutral={!c.reachedTwilio} /></span></td>
                                                    <td className="px-2 py-2"><span className="flex justify-center"><Mark ok={c.recording} neutral={!c.answered} /></span></td>
                                                    <td className="px-2 py-2 text-center tabular-nums text-ink-2">{c.answered ? c.transcriptLines : "—"}</td>
                                                    <td className="px-3 py-2">
                                                        <span className="block text-ink-2">{c.summary ? SUMMARY_LABEL[c.summary] ?? c.summary : "—"}</span>
                                                        {c.summaryNote && <span className="block text-ink-3">{c.summaryNote}</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <p className="mt-2 text-[12px] text-ink-3">
                                « Twilio » non coché : le navigateur n&apos;a pas atteint Twilio (micro, réseau, clés). Décroché sans transcription ni
                                enregistrement : activez <code>TWILIO_RECORD_CALLS=1</code> pour la transcription de secours.
                            </p>
                        </section>
                    </div>
                )}
            </Drawer>
        </>
    );
}
