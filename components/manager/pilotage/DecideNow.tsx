"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Signal } from "@/lib/manager-pilotage/signals";
import { CONTROL, PRIMARY_CONTROL } from "@/components/workspace/Workspace";

// « À décider maintenant »: the signals, most severe first, each with its fix.
// Red only for what costs the client today (SAS past 4 office hours, empty queue).

const BADGE: Record<Signal["severity"], string> = {
    critical: "bg-danger-soft text-danger-ink",
    warning: "bg-warning-soft text-warning-ink",
    info: "bg-surface-3 text-ink-2",
};

export function DecideNow({ signals }: { signals: Signal[] }) {
    return (
        <section aria-label="À décider maintenant" className="min-w-0 flex-[1_1_420px] rounded-panel border border-line bg-surface px-5 py-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[18px] font-semibold tracking-[-0.02em] text-ink">À décider maintenant</h2>
                <span className="text-[12.5px] text-ink-3">
                    {signals.length ? `${signals.length} signal${signals.length > 1 ? "aux" : ""} · le plus grave en haut` : "Rien en attente"}
                </span>
            </div>
            {signals.length ? (
                <ul>
                    {signals.map((s) => (
                        <li key={s.id} className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line-subtle py-3 first:border-t-0">
                            <span
                                className={cn("grid h-[34px] min-w-[34px] place-items-center rounded-[10px] px-1 font-mono text-[10.5px] font-semibold", BADGE[s.severity])}
                                title={s.severity === "critical" ? "Urgent" : s.severity === "warning" ? "À traiter" : "À savoir"}
                            >
                                {s.rule.length > 4 ? "—" : s.rule}
                            </span>
                            <div className="min-w-0">
                                <p className="text-[14px] font-semibold text-ink">{s.title}</p>
                                <p className="text-[12.5px] text-ink-3">{s.detail}</p>
                            </div>
                            <Link href={s.action.href} className={cn(s.severity === "critical" ? PRIMARY_CONTROL : CONTROL, "whitespace-nowrap font-medium")}>
                                {s.action.label}
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="border-t border-line-subtle py-6 text-center text-[13px] text-ink-3">
                    Aucun RDV en attente, personne de silencieux, aucune file à sec. Rien à décider pour l’instant.
                </p>
            )}
        </section>
    );
}
