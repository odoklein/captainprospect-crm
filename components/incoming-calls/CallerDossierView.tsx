"use client";

import { format, formatDistanceToNowStrict } from "date-fns";
import { fr } from "date-fns/locale";
import {
    AlertOctagon,
    ArrowDownLeft,
    ArrowUpRight,
    Building2,
    CalendarCheck,
    CalendarClock,
    CheckCircle2,
    History,
    Linkedin,
    Mail,
    PhoneIncoming,
    Sparkles,
    UserRound,
    Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CallerCandidate, CallerDossier, PhoneHistoryCall } from "@/lib/incoming-calls/caller-lookup";
import { formatDuration, formatPhone, initials, type IncomingCall } from "./useIncomingCalls";

export interface PhoneHistoryState {
    loading: boolean;
    available: boolean;
    calls: PhoneHistoryCall[];
}

function ago(iso: string | null | undefined): string {
    if (!iso) return "";
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: fr });
}

function when(iso: string | null | undefined): string {
    if (!iso) return "—";
    return format(new Date(iso), "d MMM yyyy 'à' HH:mm", { locale: fr });
}

const RESULT_TONE: Record<string, string> = {
    MEETING_BOOKED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    INTERESTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PROJET_A_SUIVRE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    CALLBACK_REQUESTED: "bg-amber-50 text-amber-800 border-amber-200",
    RAPPEL: "bg-amber-50 text-amber-800 border-amber-200",
    RELANCE: "bg-amber-50 text-amber-800 border-amber-200",
    MEETING_CANCELLED: "bg-rose-50 text-rose-700 border-rose-200",
    REFUS: "bg-rose-50 text-rose-700 border-rose-200",
    REFUS_ARGU: "bg-rose-50 text-rose-700 border-rose-200",
    REFUS_CATEGORIQUE: "bg-rose-50 text-rose-700 border-rose-200",
    NOT_INTERESTED: "bg-rose-50 text-rose-700 border-rose-200",
    DISQUALIFIED: "bg-rose-50 text-rose-700 border-rose-200",
};

function ResultBadge({ result, label }: { result: string; label: string }) {
    return (
        <span
            className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap",
                RESULT_TONE[result] ?? "bg-slate-50 text-slate-600 border-slate-200",
            )}
        >
            {label}
        </span>
    );
}

// ============================================
// "DÉJÀ APPELÉ ?" VERDICT
// ============================================

type Verdict = { tone: "mine" | "team" | "new" | "unknown"; title: string; detail: string };

export function computeVerdict(
    dossier: CallerDossier | null,
    history: PhoneHistoryState,
): Verdict {
    const myDials = history.calls.filter((c) => c.onMyLine && c.direction === "OUTBOUND");
    const myActions = dossier?.stats.myActions ?? 0;

    if (myActions > 0 || myDials.length > 0) {
        const last = [dossier?.stats.lastMyActionAt, myDials[0]?.startedAt]
            .filter((d): d is string => Boolean(d))
            .sort()
            .pop();
        const parts = [
            myDials.length ? `${myDials.length} appel${myDials.length > 1 ? "s" : ""} depuis votre ligne` : null,
            myActions ? `${myActions} action${myActions > 1 ? "s" : ""} loggée${myActions > 1 ? "s" : ""}` : null,
            last ? `dernier ${ago(last)}` : null,
        ].filter(Boolean);
        return { tone: "mine", title: "Oui — vous avez déjà appelé ce contact", detail: parts.join(" · ") };
    }

    const teamActions = dossier?.stats.totalActions ?? 0;
    const otherLineCalls = history.calls.filter((c) => !c.onMyLine);
    if (teamActions > 0 || otherLineCalls.length > 0) {
        const names = dossier?.stats.otherSdrNames ?? [];
        const by = names.length ? `par ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}` : "par un collègue";
        const last = dossier?.lastAction?.createdAt ?? otherLineCalls[0]?.startedAt ?? null;
        return {
            tone: "team",
            title: "Pas par vous — déjà contacté par l'équipe",
            detail: [by, last ? `dernier contact ${ago(last)}` : null].filter(Boolean).join(" · "),
        };
    }

    if (!dossier) {
        return {
            tone: "unknown",
            title: "Numéro inconnu du CRM",
            detail: history.loading ? "Recherche dans l'historique d'appels…" : "Aucune fiche ni appel enregistré avec ce numéro",
        };
    }
    return { tone: "new", title: "Jamais contacté", detail: "Aucune action ni appel enregistré pour cette fiche" };
}

const VERDICT_STYLE: Record<Verdict["tone"], { box: string; icon: typeof CheckCircle2; iconClass: string }> = {
    mine: { box: "bg-emerald-50 border-emerald-200 text-emerald-900", icon: CheckCircle2, iconClass: "text-emerald-600" },
    team: { box: "bg-amber-50 border-amber-200 text-amber-900", icon: Users, iconClass: "text-amber-600" },
    new: { box: "bg-sky-50 border-sky-200 text-sky-900", icon: Sparkles, iconClass: "text-sky-600" },
    unknown: { box: "bg-slate-50 border-slate-200 text-slate-800", icon: UserRound, iconClass: "text-slate-500" },
};

// ============================================
// VIEW
// ============================================

export function CallerDossierView({
    call,
    candidates,
    selection,
    dossier,
    dossierLoading,
    history,
    onSelectCandidate,
}: {
    call: IncomingCall;
    candidates: CallerCandidate[] | null;
    selection: { companyId: string; contactId: string | null } | null;
    dossier: CallerDossier | null;
    dossierLoading: boolean;
    history: PhoneHistoryState;
    onSelectCandidate: (c: CallerCandidate) => void;
}) {
    const verdict = computeVerdict(dossier, history);
    const vs = VERDICT_STYLE[verdict.tone];
    const VerdictIcon = vs.icon;

    const name = dossier?.contact
        ? [dossier.contact.firstName, dossier.contact.lastName].filter(Boolean).join(" ") || "Contact sans nom"
        : dossier
          ? dossier.company.name
          : call.alloPersonName || "Numéro inconnu";
    const subtitle = dossier?.contact
        ? [dossier.contact.title, dossier.company.name].filter(Boolean).join(" · ")
        : dossier
          ? "Standard / numéro de la société"
          : call.alloCompanyName || "Aucune fiche CRM ne correspond à ce numéro";

    return (
        <div className="space-y-5">
            {/* Identity */}
            <div className="flex items-start gap-4">
                <div
                    className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-lg font-bold",
                        dossier ? "bg-[#7C5CFC]/10 text-[#5B3FD9]" : "bg-slate-100 text-slate-500",
                    )}
                >
                    {dossier && !dossier.contact ? <Building2 className="w-6 h-6" /> : initials(dossier ? name : call.alloPersonName)}
                </div>
                <div className="min-w-0 flex-1">
                    {dossierLoading && !dossier ? (
                        <div className="space-y-2 pt-1">
                            <div className="h-5 w-48 rounded bg-slate-100 animate-pulse" />
                            <div className="h-3.5 w-64 rounded bg-slate-100 animate-pulse" />
                        </div>
                    ) : (
                        <>
                            <h2 id="incoming-call-title" className="text-xl font-bold text-[#12122A] leading-tight truncate">
                                {name}
                            </h2>
                            <p className="text-[13px] text-[#5A5A7A] mt-0.5 truncate">{subtitle}</p>
                        </>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {dossier?.mission && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#7C5CFC]/10 text-[#5B3FD9] text-[11px] font-semibold">
                                {dossier.mission.name}
                                {dossier.mission.clientName ? ` · ${dossier.mission.clientName}` : ""}
                            </span>
                        )}
                        {dossier?.listName && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-medium">
                                Liste : {dossier.listName}
                            </span>
                        )}
                        {dossier?.contact?.email && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px]">
                                <Mail className="w-3 h-3" /> {dossier.contact.email}
                            </span>
                        )}
                        {dossier?.contact?.linkedin && (
                            <a
                                href={dossier.contact.linkedin}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 text-[11px] hover:bg-sky-100"
                            >
                                <Linkedin className="w-3 h-3" /> LinkedIn
                            </a>
                        )}
                        {!dossier && call.alloPersonName && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px]">
                                Connu dans Allo
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Do-not-contact */}
            {dossier?.exclusion && (
                <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                    <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                        <p className="text-[13px] font-bold text-rose-800">Ne plus contacter</p>
                        <p className="text-[12px] text-rose-700 mt-0.5">
                            {dossier.exclusion.reason} — depuis le {when(dossier.exclusion.createdAt)}
                        </p>
                    </div>
                </div>
            )}

            {/* Several CRM records share the number */}
            {candidates && candidates.length > 1 && (
                <div className="rounded-xl border border-[#E8EBF0] p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#8B8BA7] mb-2">
                        {candidates.length} fiches correspondent à ce numéro — laquelle vous appelle ?
                    </p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                        {candidates.map((c) => {
                            const selected =
                                selection?.companyId === c.companyId && (selection?.contactId ?? null) === c.contactId;
                            return (
                                <button
                                    key={`${c.companyId}:${c.contactId ?? "co"}`}
                                    type="button"
                                    onClick={() => onSelectCandidate(c)}
                                    className={cn(
                                        "text-left rounded-lg border px-3 py-2 transition-colors",
                                        selected
                                            ? "border-[#7C5CFC] bg-[#7C5CFC]/5"
                                            : "border-[#E8EBF0] hover:border-[#C5C8D4] hover:bg-slate-50",
                                    )}
                                >
                                    <p className="text-[12px] font-semibold text-[#12122A] truncate">
                                        {c.callerName ?? `${c.companyName} (standard)`}
                                    </p>
                                    <p className="text-[11px] text-[#8B8BA7] truncate">
                                        {[c.callerName ? c.companyName : null, c.missionName].filter(Boolean).join(" · ")}
                                    </p>
                                    {(c.myActionCount > 0 || c.excluded || !c.missionActive) && (
                                        <p className="text-[10px] mt-0.5 font-semibold flex flex-wrap gap-x-2">
                                            {c.myActionCount > 0 && <span className="text-emerald-600">Vous l&apos;avez appelé</span>}
                                            {c.excluded && <span className="text-rose-600">Exclu</span>}
                                            {!c.missionActive && <span className="text-slate-400">Mission inactive</span>}
                                        </p>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Verdict */}
            <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", vs.box)}>
                <VerdictIcon className={cn("w-5 h-5 shrink-0 mt-0.5", vs.iconClass)} />
                <div className="min-w-0">
                    <p className="text-[14px] font-bold">{verdict.title}</p>
                    {verdict.detail && <p className="text-[12px] opacity-80 mt-0.5">{verdict.detail}</p>}
                    {dossier && dossier.previousInbound.count > 0 && (
                        <p className="text-[12px] opacity-80 mt-0.5">
                            <PhoneIncoming className="inline w-3 h-3 mr-1" />
                            A déjà rappelé {dossier.previousInbound.count} fois (dernier {ago(dossier.previousInbound.lastAt)})
                        </p>
                    )}
                </div>
            </div>

            {/* Status tiles */}
            {dossier && (
                <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-[#E8EBF0] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8B8BA7]">Dernier statut</p>
                        {dossier.lastAction ? (
                            <>
                                <div className="mt-1.5">
                                    <ResultBadge result={dossier.lastAction.result} label={dossier.lastAction.resultLabel} />
                                </div>
                                <p className="text-[11px] text-[#5A5A7A] mt-1.5">
                                    {ago(dossier.lastAction.createdAt)}
                                    {dossier.lastAction.sdrName ? ` · ${dossier.lastAction.isMine ? "vous" : dossier.lastAction.sdrName}` : ""}
                                </p>
                            </>
                        ) : (
                            <p className="text-[12px] text-[#8B8BA7] mt-1.5">Aucune action</p>
                        )}
                    </div>
                    <div
                        className={cn(
                            "rounded-xl border p-3",
                            dossier.callback?.overdue ? "border-amber-300 bg-amber-50" : "border-[#E8EBF0]",
                        )}
                    >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8B8BA7] flex items-center gap-1">
                            <CalendarClock className="w-3 h-3" /> Rappel prévu
                        </p>
                        {dossier.callback ? (
                            <>
                                <p className="text-[13px] font-semibold text-[#12122A] mt-1.5">{when(dossier.callback.date)}</p>
                                <p className={cn("text-[11px] mt-0.5", dossier.callback.overdue ? "text-amber-700 font-semibold" : "text-[#5A5A7A]")}>
                                    {dossier.callback.overdue ? "En retard — il vous rappelle" : ago(dossier.callback.date)}
                                </p>
                            </>
                        ) : (
                            <p className="text-[12px] text-[#8B8BA7] mt-1.5">Aucun</p>
                        )}
                    </div>
                    <div
                        className={cn(
                            "rounded-xl border p-3",
                            dossier.meeting && !dossier.meeting.cancelled ? "border-emerald-200 bg-emerald-50/60" : "border-[#E8EBF0]",
                        )}
                    >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8B8BA7] flex items-center gap-1">
                            <CalendarCheck className="w-3 h-3" /> Rendez-vous
                        </p>
                        {dossier.meeting ? (
                            <>
                                <p className="text-[13px] font-semibold text-[#12122A] mt-1.5">
                                    {dossier.meeting.date ? when(dossier.meeting.date) : "Date non renseignée"}
                                </p>
                                <p className={cn("text-[11px] mt-0.5", dossier.meeting.cancelled ? "text-rose-600 font-semibold" : "text-[#5A5A7A]")}>
                                    {dossier.meeting.cancelled
                                        ? "Annulé par la suite"
                                        : `Pris ${ago(dossier.meeting.bookedAt)}${dossier.meeting.sdrName ? ` par ${dossier.meeting.sdrName}` : ""}`}
                                </p>
                            </>
                        ) : (
                            <p className="text-[12px] text-[#8B8BA7] mt-1.5">Aucun</p>
                        )}
                    </div>
                </div>
            )}

            {/* Summary of this very call, once Allo sent it */}
            {call.summary && (
                <div className="rounded-xl border border-[#7C5CFC]/20 bg-[#7C5CFC]/5 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#5B3FD9] mb-1">Résumé Allo de cet appel</p>
                    <p className="text-[12px] text-[#12122A] whitespace-pre-line">{call.summary}</p>
                </div>
            )}

            {/* CRM history */}
            {dossier && dossier.actions.length > 0 && (
                <section>
                    <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8B8BA7] mb-2">
                        <History className="w-3.5 h-3.5" /> Historique CRM
                        <span className="font-medium normal-case tracking-normal">
                            ({dossier.stats.totalActions} action{dossier.stats.totalActions > 1 ? "s" : ""})
                        </span>
                    </h3>
                    <ol className="relative border-l border-[#E8EBF0] ml-1.5 space-y-3">
                        {dossier.actions.map((a) => (
                            <li key={a.id} className="pl-4 relative">
                                <span
                                    className={cn(
                                        "absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white",
                                        a.isMine ? "bg-[#7C5CFC]" : "bg-slate-300",
                                    )}
                                />
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <ResultBadge result={a.result} label={a.resultLabel} />
                                    <span className="text-[11px] text-[#5A5A7A]">
                                        {when(a.createdAt)} · {a.isMine ? "Vous" : a.sdrName ?? "—"}
                                        {a.durationSec ? ` · ${formatDuration(a.durationSec)}` : ""}
                                    </span>
                                    {a.missionName && dossier.mission?.name !== a.missionName && (
                                        <span className="text-[10px] text-[#8B8BA7]">({a.missionName})</span>
                                    )}
                                </div>
                                {a.note && <p className="text-[12px] text-[#12122A] mt-1 line-clamp-3 whitespace-pre-line">{a.note}</p>}
                                {a.callSummary && !a.note && (
                                    <p className="text-[12px] text-[#5A5A7A] mt-1 line-clamp-2 italic">{a.callSummary}</p>
                                )}
                            </li>
                        ))}
                    </ol>
                </section>
            )}

            {/* Allo call history (call-vault) */}
            <section>
                <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8B8BA7] mb-2">
                    <PhoneIncoming className="w-3.5 h-3.5" /> Appels Allo avec {formatPhone(call.fromNumber)}
                    <span className="font-medium normal-case tracking-normal">(6 derniers mois)</span>
                </h3>
                {history.loading ? (
                    <div className="space-y-2">
                        {[0, 1].map((i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-50 animate-pulse" />
                        ))}
                    </div>
                ) : !history.available ? (
                    <p className="text-[12px] text-[#8B8BA7]">Historique téléphonique indisponible (call-vault non joignable).</p>
                ) : history.calls.length === 0 ? (
                    <p className="text-[12px] text-[#8B8BA7]">Aucun appel synchronisé avec ce numéro.</p>
                ) : (
                    <ul className="divide-y divide-[#F1F2F6] rounded-xl border border-[#E8EBF0]">
                        {history.calls.slice(0, 6).map((c) => (
                            <li key={c.callId} className="px-3 py-2 flex items-start gap-2.5">
                                {c.direction === "OUTBOUND" ? (
                                    <ArrowUpRight className="w-4 h-4 text-[#7C5CFC] mt-0.5 shrink-0" />
                                ) : (
                                    <ArrowDownLeft className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-[12px] text-[#12122A]">
                                        <span className="font-semibold">{c.direction === "OUTBOUND" ? "Sortant" : "Entrant"}</span>
                                        {" · "}
                                        {when(c.startedAt)} · {formatDuration(c.durationSec)}
                                        <span
                                            className={cn(
                                                "ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold",
                                                c.onMyLine ? "bg-[#7C5CFC]/10 text-[#5B3FD9]" : "bg-slate-100 text-slate-500",
                                            )}
                                        >
                                            {c.onMyLine ? "Votre ligne" : "Autre ligne"}
                                        </span>
                                    </p>
                                    {c.summary && <p className="text-[11px] text-[#5A5A7A] mt-0.5 line-clamp-2">{c.summary}</p>}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
