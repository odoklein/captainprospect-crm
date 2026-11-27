"use client";

import { cn } from "@/lib/utils";
import { statusLabel, type TeamMember, type TeamStatus } from "@/lib/manager-pilotage/team";
import { initials } from "./format";

// « L'équipe en direct »: SDRs planned today, their state now, calls against
// the prorated quota (the same expected count as their own pace strip), RDV.

const STATUS_INK: Record<TeamStatus, string> = {
    online: "text-success-ink",
    silent: "text-warning-ink",
    starting: "text-ink-2",
    break: "text-ink-3",
    before: "text-ink-3",
    done: "text-ink-3",
    absent: "text-ink-3",
    unplanned: "text-ink-2",
};

const DOT: Record<TeamStatus, string> = {
    online: "bg-success",
    silent: "bg-warning",
    starting: "bg-ink-4",
    break: "bg-line-strong",
    before: "bg-line-strong",
    done: "bg-line-strong",
    absent: "bg-line-strong",
    unplanned: "bg-ink-4",
};

export function TeamLive({ team }: { team: TeamMember[] }) {
    const calls = team.reduce((s, m) => s + m.calls, 0);
    const expected = team.reduce((s, m) => s + (m.expected ?? 0), 0);
    const online = team.filter((m) => m.status === "online").length;
    const scale = Math.max(1, ...team.map((m) => Math.max(m.dayQuota ?? 0, m.calls)));

    return (
        <section aria-label="L’équipe en direct" className="min-w-0 flex-[1_1_420px] rounded-panel border border-line bg-surface px-5 py-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="font-display text-[18px] font-semibold tracking-[-0.02em] text-ink">L’équipe en direct</h2>
                <span className="text-[12.5px] text-ink-3">
                    <b className="font-mono font-medium text-ink">{online}</b> en ligne · <b className="font-mono font-medium text-ink">{calls}</b> appels ·{" "}
                    {expected} attendus
                </span>
            </div>
            {team.length ? (
                <ul>
                    {team.map((m) => {
                        const behind = m.expected !== null && m.expected - m.calls >= 4;
                        return (
                            <li key={m.id} className="grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1.2fr)_44px] items-center gap-3 border-t border-line-subtle py-2.5 first:border-t-0">
                                <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-surface-3 text-[12px] font-semibold text-ink" aria-hidden>
                                    {initials(m.name)}
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate text-[14px] font-semibold text-ink">{m.name}</p>
                                    <p className={cn("flex items-center gap-1.5 text-[12px] font-medium", STATUS_INK[m.status])}>
                                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[m.status])} aria-hidden />
                                        <span className="truncate">{statusLabel(m)}</span>
                                    </p>
                                </div>
                                <div className="min-w-0">
                                    <div className="flex justify-between gap-2 text-[12px] text-ink-3">
                                        <span className="truncate">{m.mission?.name ?? "—"}</span>
                                        <span className="shrink-0 font-mono tabular-nums text-ink" title={m.expected !== null ? `${m.calls} appels pour ${m.expected} attendus à cette heure (quota du jour ${m.dayQuota})` : "Pas de créneau planifié aujourd’hui"}>
                                            {m.calls} / {m.expected ?? "—"}
                                        </span>
                                    </div>
                                    <div className="relative mt-1.5 h-1.5 rounded-full bg-surface-3">
                                        <span
                                            className={cn("absolute inset-y-0 left-0 rounded-full", behind ? "bg-warning" : "bg-info")}
                                            style={{ width: `${Math.min(100, (m.calls / scale) * 100)}%` }}
                                        />
                                        {m.expected !== null && m.expected > 0 && (
                                            <span className="absolute -inset-y-[3px] w-0.5 rounded-sm bg-ink" style={{ left: `${Math.min(100, (m.expected / scale) * 100)}%` }} aria-hidden />
                                        )}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={cn("font-mono text-[17px] tabular-nums", m.meetings ? "text-ink" : "text-ink-4")}>{m.meetings}</p>
                                    <p className="text-[11px] text-ink-3">RDV</p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className="border-t border-line-subtle py-6 text-center text-[13px] text-ink-3">Personne n’est planifié aujourd’hui et aucun SDR n’a encore appelé.</p>
            )}
            <p className="mt-2 text-[11.5px] text-ink-3">En ligne : une action il y a moins de 15 min. Le trait marque les appels attendus à cette heure, au prorata du planning.</p>
        </section>
    );
}
