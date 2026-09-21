"use client";

/**
 * ============================================================
 * ABSENCE — signaler / réaffecter / stand by, depuis la fiche RDV
 * ============================================================
 * Clients have 48h to flag a no-show from their portal. Past that, a manager
 * raises it by hand — and the place to do that is here, on the RDV itself,
 * rather than in a separate backlog space where the RDV has to be found again.
 *
 * Flagging also answers the question that always follows it: *who picks this
 * back up?* The SDR who booked it is often not the one who should call, so the
 * form asks, and the reassignment happens in the same write.
 *
 * All three actions go through /api/manager/rdv-absences, the same endpoint the
 * absences backlog uses, so a RDV flagged here behaves identically everywhere.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, PauseCircle, PlayCircle, RefreshCw, UserX } from "lucide-react";
import { Modal, ModalFooter, useToast } from "@/components/ui";
import type { Meeting } from "../../_types";

interface SdrOption {
    id: string;
    name: string;
    email: string;
}

const RECONTACT_OPTS = [
    { value: "YES", label: "Oui, à recontacter" },
    { value: "MAYBE", label: "Peut-être" },
    { value: "NO", label: "Non, clôturer" },
] as const;

interface NoShowActionsProps {
    meeting: Meeting;
    /** Refresh the row in the list behind the panel without a full reload. */
    onUpdated: (patch: Partial<Meeting>) => void;
}

export function NoShowActions({ meeting, onUpdated }: NoShowActionsProps) {
    const { success, error: showError } = useToast();

    const feedback = meeting.feedback;
    const isNoShow = feedback?.outcome === "NO_SHOW";
    const isStandBy = isNoShow && !!feedback?.standByAt;
    const isCancelled = meeting.result === "MEETING_CANCELLED";

    const [formOpen, setFormOpen] = useState(false);
    const [recontact, setRecontact] = useState<string>("YES");
    const [note, setNote] = useState("");
    const [sdrId, setSdrId] = useState("");
    const [sdrs, setSdrs] = useState<SdrOption[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isParking, setIsParking] = useState(false);

    // The SDR list is only needed once the form is open, so it is fetched then.
    useEffect(() => {
        if (!formOpen || sdrs.length > 0) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/manager/rdv-absences?scope=sdrs");
                const json = await res.json();
                if (!cancelled && json.success) setSdrs(json.data.sdrs ?? []);
            } catch {
                /* the select simply stays on "conserver le télépro initial" */
            }
        })();
        return () => { cancelled = true; };
    }, [formOpen, sdrs.length]);

    const openForm = useCallback(() => {
        setRecontact(feedback?.recontact ?? "YES");
        setNote(feedback?.note ?? "");
        setSdrId("");
        setFormOpen(true);
    }, [feedback]);

    async function submit() {
        setIsSubmitting(true);
        try {
            const res = await fetch("/api/manager/rdv-absences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    actionId: meeting.id,
                    recontactRequested: recontact,
                    note: note.trim() || undefined,
                    reassignSdrId: sdrId || undefined,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Échec");

            onUpdated({
                feedback: {
                    outcome: "NO_SHOW",
                    recontact,
                    note: note.trim() || null,
                    standByAt: null,
                    standByReason: null,
                    reportedAt: new Date().toISOString(),
                },
            });
            success(
                isNoShow ? "Absence mise à jour" : "RDV signalé absent",
                sdrId
                    ? "Le contact remonte en haut de la file d'appels du SDR choisi."
                    : "Le contact remonte en haut de la file d'appels du télépro.",
            );
            setFormOpen(false);
        } catch (err) {
            showError(err instanceof Error ? err.message : "Échec du signalement");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function setStandBy(standBy: boolean) {
        setIsParking(true);
        try {
            const res = await fetch("/api/manager/rdv-absences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ actionId: meeting.id, standBy }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Échec");

            onUpdated({
                feedback: {
                    outcome: feedback?.outcome ?? "NO_SHOW",
                    recontact: feedback?.recontact ?? "YES",
                    note: feedback?.note ?? null,
                    standByAt: standBy ? new Date().toISOString() : null,
                    standByReason: standBy ? feedback?.standByReason ?? null : null,
                },
            });
            success(
                standBy ? "RDV mis en stand by" : "RDV réactivé",
                standBy
                    ? "Il sort du tableau des absents côté SDR et de la file d'appels."
                    : "Il revient dans les absents à traiter, côté SDR aussi.",
            );
        } catch (err) {
            showError(err instanceof Error ? err.message : "Échec");
        } finally {
            setIsParking(false);
        }
    }

    // A replaced or cancelled RDV is already closed: nothing to flag on it.
    if (isCancelled && !isNoShow) return null;

    return (
        <>
            {!isNoShow && (
                <button
                    className="rdv-btn rdv-btn-ghost"
                    style={{
                        width: "100%",
                        justifyContent: "center",
                        marginBottom: 14,
                        padding: "8px 14px",
                        color: "var(--red)",
                        borderColor: "rgba(225,29,72,0.25)",
                        fontWeight: 600,
                    }}
                    onClick={openForm}
                    title="Le contact ne s'est pas présenté : le remonter au télépro"
                >
                    <UserX size={14} /> Signaler absent
                </button>
            )}

            {isNoShow && (
                <div
                    style={{
                        background: isStandBy ? "var(--surface2)" : "rgba(225, 29, 72, 0.06)",
                        border: `1px solid ${isStandBy ? "var(--border)" : "rgba(225,29,72,0.22)"}`,
                        borderRadius: 10,
                        padding: "10px 12px",
                        marginBottom: 14,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {isStandBy ? <PauseCircle size={15} color="var(--ink3)" /> : <UserX size={15} color="var(--red)" />}
                        <span style={{ fontSize: 12, fontWeight: 700, color: isStandBy ? "var(--ink2)" : "var(--red)" }}>
                            {isStandBy ? "Absent — en stand by" : "Contact absent"}
                        </span>
                        {feedback?.reportedAt && (
                            <span style={{ fontSize: 11, color: "var(--ink3)" }}>
                                · signalé le {new Date(feedback.reportedAt).toLocaleDateString("fr-FR", {
                                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                                })}
                            </span>
                        )}
                    </div>

                    {feedback?.note && (
                        <p style={{
                            margin: "8px 0 0",
                            fontSize: 12,
                            fontStyle: "italic",
                            color: "var(--ink2)",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            borderLeft: "2px solid var(--border2)",
                            paddingLeft: 8,
                        }}>
                            &ldquo;{feedback.note}&rdquo;
                        </p>
                    )}
                    {isStandBy && feedback?.standByReason && (
                        <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ink3)" }}>
                            Stand by : {feedback.standByReason}
                        </p>
                    )}

                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        <button
                            className="rdv-btn rdv-btn-ghost"
                            style={{ padding: "6px 12px", fontSize: 12 }}
                            onClick={openForm}
                            title="Changer le SDR qui reprend ce contact, ou préciser le motif"
                        >
                            <RefreshCw size={13} /> Réaffecter / préciser
                        </button>
                        {isStandBy ? (
                            <button
                                className="rdv-btn rdv-btn-ghost"
                                style={{ padding: "6px 12px", fontSize: 12 }}
                                onClick={() => setStandBy(false)}
                                disabled={isParking}
                                title="Le remettre dans les listes SDR"
                            >
                                {isParking ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
                                Réactiver
                            </button>
                        ) : (
                            <button
                                className="rdv-btn rdv-btn-ghost"
                                style={{ padding: "6px 12px", fontSize: 12 }}
                                onClick={() => setStandBy(true)}
                                disabled={isParking}
                                title="Le laisser de côté : il sort des listes SDR sans être clôturé"
                            >
                                {isParking ? <Loader2 size={13} className="animate-spin" /> : <PauseCircle size={13} />}
                                Mettre en stand by
                            </button>
                        )}
                    </div>
                </div>
            )}

            <Modal
                isOpen={formOpen}
                onClose={() => (isSubmitting ? undefined : setFormOpen(false))}
                title={isNoShow ? "Réaffecter cette absence" : "Signaler un contact absent"}
            >
                <div className="space-y-4">
                    <p className="text-sm text-slate-600">
                        Le RDV sera enregistré comme <strong>absent</strong> et le contact remontera tout en
                        haut de la file d&apos;appels du télépro, avec le tag rouge <strong>RDV ABSENT</strong>.
                    </p>

                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">
                            Le prospect est-il à recontacter ?
                        </label>
                        <div className="flex gap-2 flex-wrap">
                            {RECONTACT_OPTS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setRecontact(opt.value)}
                                    className={
                                        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors "
                                        + (recontact === opt.value
                                            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                                    }
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">
                            Précision (optionnel)
                        </label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={3}
                            maxLength={1000}
                            placeholder="Ce que le client a dit, le contexte…"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">
                            Qui reprend ce contact ?
                        </label>
                        <select
                            value={sdrId}
                            onChange={(e) => setSdrId(e.target.value)}
                            className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                        >
                            <option value="">
                                Conserver le télépro initial{meeting.sdr?.name ? ` (${meeting.sdr.name})` : ""}
                            </option>
                            {sdrs.map((s) => (
                                <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-slate-500">
                            Utile quand le booker d&apos;origine n&apos;est plus sur la mission.
                        </p>
                    </div>

                    <ModalFooter>
                        <button
                            className="rdv-btn rdv-btn-ghost"
                            onClick={() => setFormOpen(false)}
                            disabled={isSubmitting}
                        >
                            Annuler
                        </button>
                        <button
                            className="rdv-btn rdv-btn-primary"
                            style={{ background: "var(--red)", color: "#fff" }}
                            onClick={submit}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <UserX size={14} />}
                            {isNoShow ? "Enregistrer" : "Confirmer le signalement"}
                        </button>
                    </ModalFooter>
                </div>
            </Modal>
        </>
    );
}
