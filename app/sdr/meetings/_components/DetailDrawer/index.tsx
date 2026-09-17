import { Check, FileText, History, Loader2, MessageSquare, Save, X } from "lucide-react";
import { Button, Drawer } from "@/components/ui";
import { formatScheduledDate, getAvatarColor, getInitials, getRdvStatus } from "../../_lib/formatters";
import { StatusBadge } from "../StatusBadge";
import { DetailTab } from "./DetailTab";
import { NoteTab } from "./NoteTab";
import { HistoryTab } from "./HistoryTab";
import type { Meeting } from "../../_types";
import type { SdrDetailDrawerState } from "../../_hooks/useSdrDetailDrawer";

interface DetailDrawerProps {
    meeting: Meeting;
    drawer: SdrDetailDrawerState;
    isSaving: boolean;
    isCancelling: boolean;
    onClose: () => void;
    onSave: () => void;
    onOpenReschedule: (meeting: Meeting) => void;
    onOpenCancel: (meeting: Meeting) => void;
}

export function DetailDrawer({ meeting, drawer, isSaving, isCancelling, onClose, onSave, onOpenReschedule, onOpenCancel }: DetailDrawerProps) {
    const { editNote, setEditNote, setEditResult, editMeetingType, editMeetingCategory, savingError, detailDrawerTab, setDetailDrawerTab } = drawer;

    return (
        <Drawer
            isOpen
            onClose={onClose}
            title="Fiche du rendez-vous"
            description={formatScheduledDate(meeting)}
            size="xl"
            headerCentered
            footer={
                <div className="flex items-center justify-between gap-4 w-full">
                    <Button variant="ghost" onClick={onClose}>
                        Annuler
                    </Button>
                    {savingError && (
                        <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg flex-1">{savingError}</p>
                    )}
                    <Button onClick={onSave} disabled={isSaving} className="gap-2 ml-auto">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Enregistrer
                    </Button>
                </div>
            }
        >
            <div className="space-y-5">
                {/* Header summary block, aligned with the manager /rdv panel */}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                                style={{ backgroundColor: getAvatarColor(meeting) }}
                            >
                                {getInitials(meeting)}
                            </div>
                            <div>
                                <p className="font-semibold text-slate-900">
                                    {meeting.contact.firstName} {meeting.contact.lastName}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {meeting.contact.title || "—"} · {meeting.contact.company.name}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                className="rdv-btn"
                                style={{ fontSize: 12, padding: "6px 10px", background: "var(--greenLight)", color: "var(--green)", border: "1px solid rgba(5,150,105,0.2)" }}
                                onClick={() => setEditResult("MEETING_BOOKED")}
                            >
                                <Check size={13} /> Confirmer
                            </button>
                            <button
                                type="button"
                                className="rdv-btn"
                                style={{ fontSize: 12, padding: "6px 10px", background: "var(--redLight)", color: "var(--red)", border: "1px solid rgba(220,38,38,0.2)" }}
                                onClick={() => onOpenCancel(meeting)}
                            >
                                <X size={13} /> Annuler
                            </button>
                        </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatusBadge status={getRdvStatus(meeting)} />
                        <span className="rdv-pill" style={{ background: "var(--surface2)", color: "var(--ink2)", padding: "4px 12px" }}>
                            {editMeetingType || meeting.meetingType || "Type non défini"}
                        </span>
                        <span className="rdv-pill" style={{ background: "var(--surface2)", color: "var(--ink2)", padding: "4px 12px" }}>
                            {editMeetingCategory || meeting.meetingCategory || "Catégorie non définie"}
                        </span>
                    </div>
                </div>

                {/* Tabs, matching the manager drawer's own tab bar visual language */}
                <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)" }}>
                    {[
                        { key: "detail" as const, label: "Détail", Icon: FileText },
                        { key: "note" as const, label: "Note interne", Icon: MessageSquare },
                        { key: "history" as const, label: "Historique", Icon: History },
                    ].map(({ key, label, Icon }) => (
                        <button
                            key={key}
                            className={`rdv-tab ${detailDrawerTab === key ? "active" : ""}`}
                            onClick={() => setDetailDrawerTab(key)}
                        >
                            <Icon size={13} style={{ display: "inline", marginRight: 5, verticalAlign: -2 }} />
                            {label}
                        </button>
                    ))}
                </div>

                {detailDrawerTab === "detail" && (
                    <DetailTab
                        meeting={meeting}
                        drawer={drawer}
                        isCancelling={isCancelling}
                        onOpenReschedule={onOpenReschedule}
                        onOpenCancel={onOpenCancel}
                    />
                )}

                {detailDrawerTab === "note" && <NoteTab note={editNote} onChange={setEditNote} />}

                {detailDrawerTab === "history" && <HistoryTab meeting={meeting} />}
            </div>
        </Drawer>
    );
}
