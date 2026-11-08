"use client";

// "Votre mission & votre équipe" — the client portal home's trust block.
// It answers the three questions a client asks before trusting an outsourced team:
// who works on my account, where is the mission at, and is anyone working right now.
// Pure view over GET /api/client/team; every line is read from real data.

import { Linkedin, Mail, MessageSquareText, PhoneCall, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { openClientSupport } from "@/lib/support/events";
import { BAR, CARD, Initials, PILL, ProgressBar, SECONDARY_BUTTON, SectionHeader, Shimmer, formatInt, relativeTime, type AccueilTone } from "./AccueilUI";

export type ClientTeamRole = "ACCOUNT_MANAGER" | "TEAM_LEAD" | "SDR";

export interface ClientTeamData {
    missions: {
        id: string;
        name: string;
        status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
        startDate: string;
        endDate: string;
        channels: ("CALL" | "EMAIL" | "LINKEDIN")[];
    }[];
    members: { id: string; name: string; role: ClientTeamRole }[];
    lastActivityAt: string | null;
    actionsLast7Days: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Under this, the team is shown as "en action" with a live dot. */
const LIVE_WINDOW_MS = 2 * 60 * 60 * 1000;

const ROLE_LABEL: Record<ClientTeamRole, string> = {
    ACCOUNT_MANAGER: "Chargé(e) de compte",
    TEAM_LEAD: "Chef de projet",
    SDR: "SDR",
};

const STATUS: Record<ClientTeamData["missions"][number]["status"], { label: string; tone: AccueilTone }> = {
    ACTIVE: { label: "En cours", tone: "emerald" },
    PAUSED: { label: "En pause", tone: "amber" },
    DRAFT: { label: "En préparation", tone: "slate" },
    COMPLETED: { label: "Terminée", tone: "slate" },
    ARCHIVED: { label: "Archivée", tone: "slate" },
};

const CHANNEL: Record<ClientTeamData["missions"][number]["channels"][number], { label: string; icon: LucideIcon }> = {
    CALL: { label: "Appels", icon: PhoneCall },
    EMAIL: { label: "Email", icon: Mail },
    LINKEDIN: { label: "LinkedIn", icon: Linkedin },
};

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** Where the mission is on its contracted calendar. Past the end date we only state it. */
function missionCalendar(startIso: string, endIso: string, now: Date) {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    const t = now.getTime();
    const totalDays = Math.max(1, Math.round((end - start) / DAY_MS));
    if (t < start) {
        return { phase: "upcoming" as const, percent: 0, line: `Démarrage le ${formatDate(startIso)}` };
    }
    if (t > end) {
        return { phase: "past" as const, percent: 100, line: `Échéance initiale : ${formatDate(endIso)}` };
    }
    const day = Math.min(totalDays, Math.floor((t - start) / DAY_MS) + 1);
    const left = Math.max(0, Math.ceil((end - t) / DAY_MS));
    return {
        phase: "running" as const,
        percent: (day / totalDays) * 100,
        line: `Jour ${day} sur ${totalDays} · ${left} jour${left > 1 ? "s" : ""} restant${left > 1 ? "s" : ""}`,
    };
}

/** "il y a 12 min" / "hier" / "il y a 4 j", and "le 3 nov. 2026" beyond a week. */
function lastActionPhrase(iso: string, now: Date): string {
    if (now.getTime() - new Date(iso).getTime() < 7 * DAY_MS) return relativeTime(iso, now);
    return `le ${formatDate(iso)}`;
}

/** `now` is when `data` was fetched: day counts and "il y a…" are stated as of that moment. */
export function ClientMissionTeamCard({ data, now }: { data: ClientTeamData | null; now: Date | null }) {
    const ready = !!data && !!now;
    return (
        <section className={cn(CARD, "p-6 space-y-5")} aria-busy={!ready}>
            <SectionHeader
                icon={Users}
                tone="indigo"
                title="Votre mission & votre équipe"
                subtitle="L'équipe et le calendrier de la mission"
                right={
                    <button type="button" onClick={openClientSupport} className={SECONDARY_BUTTON}>
                        <MessageSquareText className="w-3.5 h-3.5" aria-hidden />
                        Écrire à l&apos;équipe
                    </button>
                }
            />

            {!ready ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Shimmer className="h-[148px]" />
                    <Shimmer className="h-[148px]" />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <MissionsColumn missions={data.missions} now={now} />
                    <TeamColumn data={data} now={now} />
                </div>
            )}
        </section>
    );
}

function MissionsColumn({ missions, now }: { missions: ClientTeamData["missions"]; now: Date }) {
    if (missions.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-line bg-surface-2/60 p-5 text-center">
                <p className="text-sm font-bold text-ink">Aucune mission active</p>
                <p className="text-xs text-ink-3 mt-1">Vos missions apparaîtront ici dès leur lancement.</p>
            </div>
        );
    }
    return (
        <ul className="space-y-3">
            {missions.map((m) => {
                const cal = missionCalendar(m.startDate, m.endDate, now);
                const status = STATUS[m.status] ?? STATUS.ACTIVE;
                return (
                    <li key={m.id} className="rounded-2xl border border-line bg-surface-2/60 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-extrabold text-ink leading-snug min-w-0 break-words">{m.name}</p>
                            <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 px-2.5 rounded-full border text-[11px] font-bold", PILL[status.tone])}>
                                <span className={cn("w-1.5 h-1.5 rounded-full", BAR[status.tone])} aria-hidden />
                                {status.label}
                            </span>
                        </div>

                        {m.channels.length > 0 && (
                            <div className="flex flex-wrap gap-1.5" aria-label="Canaux de prospection">
                                {m.channels.map((c) => {
                                    const ch = CHANNEL[c];
                                    if (!ch) return null;
                                    const Icon = ch.icon;
                                    return (
                                        <span key={c} className="inline-flex h-6 items-center gap-1 px-2 rounded-lg bg-surface border border-line text-[11px] font-semibold text-ink-2">
                                            <Icon className="w-3 h-3 text-ink-3" aria-hidden />
                                            {ch.label}
                                        </span>
                                    );
                                })}
                            </div>
                        )}

                        <div className="space-y-1.5">
                            {cal.phase !== "past" && (
                                <ProgressBar
                                    percent={cal.percent}
                                    tone="indigo"
                                    label={`Avancement du calendrier de la mission ${m.name}`}
                                />
                            )}
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px] font-semibold">
                                <span className="text-ink-2 tabular-nums">{cal.line}</span>
                                <span className="text-ink-4 tabular-nums">
                                    {formatDate(m.startDate)} → {formatDate(m.endDate)}
                                </span>
                            </div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

function TeamColumn({ data, now }: { data: ClientTeamData; now: Date }) {
    const { members, lastActivityAt, actionsLast7Days } = data;
    const live = !!lastActivityAt && now.getTime() - new Date(lastActivityAt).getTime() < LIVE_WINDOW_MS;

    return (
        <div className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3">
            {members.length === 0 ? (
                <p className="text-xs font-medium text-ink-3 py-2">
                    Votre équipe dédiée sera présentée ici dès son affectation à la mission.
                </p>
            ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3" aria-label="Équipe dédiée">
                    {members.map((p) => (
                        <li key={p.id} className="flex items-center gap-3 min-w-0">
                            <Initials name={p.name} strong={p.role !== "SDR"} />
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-ink truncate">{p.name}</p>
                                <p className="text-[11px] font-semibold text-ink-3">{ROLE_LABEL[p.role]}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {/* Proof of work: the team's last logged action, never a decorative "online" dot. */}
            <div className="mt-auto pt-3 border-t border-line-subtle flex items-start gap-2.5">
                <span className="relative flex w-2 h-2 mt-[5px] shrink-0" aria-hidden>
                    {live && <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />}
                    <span className={cn("relative w-2 h-2 rounded-full", live ? "bg-emerald-500" : "bg-slate-300")} />
                </span>
                <p className="text-xs font-semibold text-ink-2 leading-relaxed">
                    {lastActivityAt ? (
                        <>
                            {live ? "Équipe en action · " : "Dernière action enregistrée "}
                            <span className="text-ink">{lastActionPhrase(lastActivityAt, now)}</span>
                        </>
                    ) : (
                        "Aucune action enregistrée pour l'instant"
                    )}
                    {actionsLast7Days > 0 && (
                        <span className="block text-[11px] text-ink-3 font-medium">
                            {formatInt(actionsLast7Days)} action{actionsLast7Days > 1 ? "s" : ""} de prospection sur les 7 derniers jours
                        </span>
                    )}
                </p>
            </div>
        </div>
    );
}
