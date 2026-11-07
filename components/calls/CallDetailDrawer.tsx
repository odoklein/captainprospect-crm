"use client";

// ============================================
// CALL DETAIL — everything about one call, for the manager's journal.
// Status and note as the SDR logged them, the recording with its real
// waveform, the AI summary (or the provider's), the transcript with the
// search term highlighted, what Twilio saw, and the prospect's other calls.
// ============================================

import { useEffect, useState } from "react";
import { Clock, FileText, Headphones, History, Phone, PhoneIncoming, User } from "lucide-react";
import { Drawer } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { CallDetail } from "@/lib/calls-journal/types";
import { CALL_SOURCE_LABELS } from "@/lib/calls-journal/filters";
import { TELEPHONY_STATUS_LABELS } from "@/lib/telephony/status";
import { formatDuration, formatPhone } from "@/components/incoming-calls/useIncomingCalls";
import { AiSummaryView, Highlighted, TranscriptView } from "@/components/telephony/CallInsights";
import { CallPlayer } from "./CallPlayer";
import { StatusLabel } from "./StatusLabel";

function when(iso: string): string {
    return new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Section({ title, icon: Icon, children, aside }: { title: string; icon: typeof Clock; children: React.ReactNode; aside?: React.ReactNode }) {
    return (
        <section className="border-t border-line-subtle px-6 py-5 first:border-t-0">
            <header className="mb-3 flex items-center gap-2">
                <Icon className="h-4 w-4 text-ink-3" aria-hidden />
                <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
                {aside && <div className="ml-auto">{aside}</div>}
            </header>
            {children}
        </section>
    );
}

export function CallDetailDrawer({
    target,
    onClose,
    onOpenCall,
    highlight,
    resolveStatus,
}: {
    target: { id: string; kind: "action" | "call" } | null;
    onClose: () => void;
    /** Opens another call (from the prospect's history). */
    onOpenCall: (id: string) => void;
    highlight?: string;
    resolveStatus?: (code: string) => { label: string; color: string | null } | null;
}) {
    // Loaded detail, tagged with the call it belongs to: switching calls never shows the previous one.
    const [loaded, setLoaded] = useState<{ key: string; detail: CallDetail | null; error: string | null } | null>(null);
    const key = target ? `${target.kind}:${target.id}` : null;

    useEffect(() => {
        if (!target || !key) return;
        const ctrl = new AbortController();
        fetch(`/api/manager/calls/${target.id}?kind=${target.kind}`, { signal: ctrl.signal })
            .then((r) => r.json())
            .then((json) => {
                setLoaded(json?.success ? { key, detail: json.data, error: null } : { key, detail: null, error: json?.error ?? "Appel introuvable" });
            })
            .catch((e) => {
                if ((e as Error).name !== "AbortError") setLoaded({ key, detail: null, error: "Chargement impossible" });
            });
        return () => ctrl.abort();
    }, [target, key]);

    const current = loaded && loaded.key === key ? loaded : null;
    const d = current?.detail ?? null;
    const error = current?.error ?? null;
    const who = d?.contact?.name ?? d?.company?.name ?? (d?.phone ? formatPhone(d.phone) : "Appel");

    return (
        <Drawer
            isOpen={Boolean(target)}
            onClose={onClose}
            size="lg"
            title={d ? who : "Appel"}
            description={d ? [d.contact?.title, d.contact ? d.company?.name : null, d.mission?.name].filter(Boolean).join(" · ") || undefined : undefined}
        >
            {!d && !error && (
                <div className="space-y-3 p-6" aria-busy="true">
                    {[70, 100, 90, 60].map((w, i) => (
                        <div key={i} className="cp-shimmer h-3 rounded" style={{ width: `${w}%` }} />
                    ))}
                </div>
            )}
            {error && <p className="p-6 text-[13px] text-danger-ink">{error}</p>}

            {d && (
                <div className="cp-stagger -m-6">
                    {/* Facts line */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 pb-5 pt-5 text-[13px]">
                        {d.status ? (
                            <StatusLabel label={d.status.label} color={d.status.color} className="font-medium" />
                        ) : (
                            <span className="rounded-full border border-warning-line bg-warning-soft px-2 py-0.5 text-[12px] font-medium text-warning-ink">Sans statut</span>
                        )}
                        <span className="flex items-center gap-1.5 text-ink-2">
                            <Clock className="h-3.5 w-3.5 text-ink-3" aria-hidden />
                            {when(d.at)}
                        </span>
                        <span className="flex items-center gap-1.5 text-ink-2">
                            <User className="h-3.5 w-3.5 text-ink-3" aria-hidden />
                            {d.sdr.name}
                        </span>
                        {d.durationSec !== null && <span className="tabular-nums text-ink-2">{formatDuration(d.durationSec)}</span>}
                        {d.source && <span className="text-ink-3">{CALL_SOURCE_LABELS[d.source]}</span>}
                        {d.phone && (
                            <a href={`tel:${d.phone}`} className="flex items-center gap-1 font-mono text-[12px] text-ink-3 hover:text-ink">
                                <Phone className="h-3 w-3" /> {formatPhone(d.phone)}
                            </a>
                        )}
                    </div>

                    {d.recordingUrl && (
                        <div className="px-6 pb-5">
                            <CallPlayer src={d.recordingUrl} durationHint={d.durationSec} />
                        </div>
                    )}

                    {(d.note || d.callbackDate) && (
                        <Section title="Note du SDR" icon={FileText}>
                            {d.note && (
                                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                                    <Highlighted text={d.note} term={highlight} />
                                </p>
                            )}
                            {d.callbackDate && (
                                <p className="mt-2 text-[12px] text-ink-3">
                                    Rappel prévu le {new Date(d.callbackDate).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                                </p>
                            )}
                        </Section>
                    )}

                    {d.ai.status !== "none" ? (
                        <Section title="Résumé IA" icon={FileText}>
                            <AiSummaryView state={d.ai} resolveStatus={resolveStatus} />
                        </Section>
                    ) : (
                        d.summary && (
                            <Section title="Résumé de l'appel" icon={FileText}>
                                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                                    <Highlighted text={d.summary} term={highlight} />
                                </p>
                            </Section>
                        )
                    )}

                    {(d.transcript.length > 0 || d.transcription) && (
                        <Section title="Transcription" icon={Headphones}>
                            {d.transcript.length > 0 ? (
                                <TranscriptView
                                    lines={d.transcript}
                                    names={{ sdr: d.sdr.name, prospect: d.contact?.name ?? "Prospect" }}
                                    highlight={highlight}
                                    className="max-h-[420px] pr-1"
                                />
                            ) : (
                                <p className="max-h-[420px] overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                                    <Highlighted text={d.transcription ?? ""} term={highlight} />
                                </p>
                            )}
                        </Section>
                    )}

                    {d.telephony && (
                        <Section title="Téléphone intégré" icon={PhoneIncoming}>
                            <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                                <dt className="text-ink-3">Issue Twilio</dt>
                                <dd className="text-ink">{TELEPHONY_STATUS_LABELS[d.telephony.status]}</dd>
                                <dt className="text-ink-3">Numéro présenté</dt>
                                <dd className="font-mono text-ink-2">{formatPhone(d.telephony.from)}</dd>
                                <dt className="text-ink-3">Décroché</dt>
                                <dd className="text-ink-2">{d.telephony.answeredAt ? new Date(d.telephony.answeredAt).toLocaleTimeString("fr-FR") : "—"}</dd>
                                <dt className="text-ink-3">Raccroché</dt>
                                <dd className="text-ink-2">{d.telephony.endedAt ? new Date(d.telephony.endedAt).toLocaleTimeString("fr-FR") : "—"}</dd>
                            </dl>
                        </Section>
                    )}

                    <Section title="Autres appels avec ce prospect" icon={History}>
                        {d.history.length === 0 ? (
                            <p className="text-[13px] text-ink-3">Aucun autre appel enregistré.</p>
                        ) : (
                            <ol className="relative space-y-0.5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-line">
                                {d.history.map((h) => (
                                    <li key={h.id}>
                                        <button
                                            type="button"
                                            onClick={() => onOpenCall(h.id)}
                                            className="relative grid w-full grid-cols-[12px_1fr_auto] items-center gap-3 rounded-control py-1.5 pr-2 text-left text-[13px] hover:bg-surface-2"
                                        >
                                            <span
                                                className="relative z-10 h-[11px] w-[11px] rounded-full border-2 border-surface"
                                                style={{ background: h.status?.color ?? "var(--ds-line-strong)" }}
                                                aria-hidden
                                            />
                                            <span className="min-w-0 truncate">
                                                <span className="text-ink">{h.status?.label ?? "—"}</span>
                                                <span className="text-ink-3"> · {h.sdr}</span>
                                            </span>
                                            <span className={cn("text-[12px] tabular-nums text-ink-3")}>
                                                {new Date(h.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                                {h.durationSec ? ` · ${formatDuration(h.durationSec)}` : ""}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </Section>
                </div>
            )}
        </Drawer>
    );
}
