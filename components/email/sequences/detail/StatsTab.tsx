"use client";

import { BarChart3 } from "lucide-react";
import { Callout, Card, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ENROLLMENT_STATUS_META, pct, type EnrollmentStatus, type SequenceDetail } from "../types";

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
    const width = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0;
    return (
        <div className="h-1.5 w-full rounded-full bg-surface-3" aria-hidden>
            <div className={cn("h-1.5 rounded-full", className)} style={{ width: `${width}%` }} />
        </div>
    );
}

function Metric({ label, value, sub, barValue, barMax, barClass }: { label: string; value: number; sub?: string; barValue: number; barMax: number; barClass: string }) {
    return (
        <div className="min-w-0 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-ink-3">{label}</span>
                <span className="text-[13px] font-semibold text-ink">
                    {value.toLocaleString("fr-FR")}
                    {sub && <span className="ml-1 font-normal text-ink-3">{sub}</span>}
                </span>
            </div>
            <Bar value={barValue} max={barMax} className={barClass} />
        </div>
    );
}

const STATUS_ORDER: EnrollmentStatus[] = ["ACTIVE", "PAUSED", "REPLIED", "COMPLETED", "BOUNCED", "UNSUBSCRIBED", "MANUAL_EXIT"];
const STATUS_BAR: Record<EnrollmentStatus, string> = {
    ACTIVE: "bg-primary",
    PAUSED: "bg-warning",
    REPLIED: "bg-success",
    COMPLETED: "bg-ink-4",
    BOUNCED: "bg-danger",
    UNSUBSCRIBED: "bg-ink-4",
    MANUAL_EXIT: "bg-ink-4",
};

export function StatsTab({ detail }: { detail: SequenceDetail }) {
    const { stats, steps, counts } = detail;

    if (stats.sent === 0) {
        return (
            <EmptyState
                icon={BarChart3}
                title="Pas encore de statistiques"
                description="Les ouvertures, réponses et rebonds apparaîtront ici étape par étape dès que les premiers emails seront partis."
            />
        );
    }

    return (
        <div className="space-y-5">
            {!detail.trackOpens && (
                <Callout tone="info">Le suivi des ouvertures et des clics est désactivé pour cette séquence : seuls les envois, réponses et rebonds sont comptés.</Callout>
            )}

            <Card padding="none">
                <div className="border-b border-line-subtle px-5 py-3">
                    <h3 className="text-sm font-semibold text-ink">Entonnoir par étape</h3>
                    <p className="text-xs text-ink-3">Taux calculés sur les emails envoyés à chaque étape.</p>
                </div>
                <ul className="divide-y divide-line-subtle">
                    {steps.map((s, i) => (
                        <li key={s.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))] lg:items-center">
                            <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">Email {i + 1}</p>
                                <p className="truncate text-[13px] font-semibold text-ink">{s.subject || "Réponse dans le même fil"}</p>
                            </div>
                            <Metric label="Envoyés" value={s.stats.sent} barValue={s.stats.sent} barMax={Math.max(...steps.map((x) => x.stats.sent), 1)} barClass="bg-primary" />
                            <Metric label="Ouverts" value={s.stats.opened} sub={pct(s.stats.opened, s.stats.sent)} barValue={s.stats.opened} barMax={s.stats.sent} barClass="bg-info" />
                            <Metric label="Réponses" value={s.stats.replied} sub={pct(s.stats.replied, s.stats.sent)} barValue={s.stats.replied} barMax={s.stats.sent} barClass="bg-success" />
                            <Metric label="Rebonds" value={s.stats.bounced} sub={pct(s.stats.bounced, s.stats.sent)} barValue={s.stats.bounced} barMax={s.stats.sent} barClass="bg-danger" />
                        </li>
                    ))}
                </ul>
            </Card>

            <Card padding="none">
                <div className="border-b border-line-subtle px-5 py-3">
                    <h3 className="text-sm font-semibold text-ink">Où en sont les contacts</h3>
                    <p className="text-xs text-ink-3">{counts.total.toLocaleString("fr-FR")} inscrits au total.</p>
                </div>
                <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
                    {STATUS_ORDER.filter((st) => (counts[st] ?? 0) > 0).map((st) => (
                        <Metric
                            key={st}
                            label={ENROLLMENT_STATUS_META[st].label}
                            value={counts[st] ?? 0}
                            sub={pct(counts[st] ?? 0, counts.total)}
                            barValue={counts[st] ?? 0}
                            barMax={counts.total}
                            barClass={STATUS_BAR[st]}
                        />
                    ))}
                </div>
            </Card>
        </div>
    );
}
