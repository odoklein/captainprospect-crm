"use client";

import { useCallback, useState } from "react";
import { ContextMenu, useContextMenu, useToast } from "@/components/ui";
import { Eye, CalendarClock, XCircle, Trash2 } from "lucide-react";
import { useRdvKeyboardNavigation } from "@/lib/rdv/hooks/useRdvKeyboardNavigation";
import { currentMonthPeriod, useSdrMeetingsQuery } from "../_hooks/useSdrMeetingsQuery";
import { SdrMonthPicker } from "./SdrMonthPicker";
import { useSdrMeetingMutations } from "../_hooks/useSdrMeetingMutations";
import { useSdrMeetingFilters } from "../_hooks/useSdrMeetingFilters";
import { useSdrDetailDrawer } from "../_hooks/useSdrDetailDrawer";
import { SdrMeetingsHeader } from "./SdrMeetingsHeader";
import { AbsentRdvBanner } from "./AbsentRdvBanner";
import { SdrStatTiles } from "./SdrStatTiles";
import { SdrFilterPills } from "./SdrFilterPills";
import { MeetingList } from "./MeetingList";
import { DetailDrawer } from "./DetailDrawer";
import { CancelMeetingModal } from "./modals/CancelMeetingModal";
import { RescheduleMeetingModal } from "./modals/RescheduleMeetingModal";
import { DeleteMeetingConfirmDialog } from "./modals/DeleteMeetingConfirmDialog";
import { SdrImportRdvModal } from "./ImportRdvModal";
import { toLocalDatetimeInput } from "../_lib/formatters";
import type { Meeting } from "../_types";
import "../../../manager/rdv/_components/rdv-shell.css";

export function SdrMeetingsShell() {
    // Default to RDVs booked this month: SDRs track (and are paid on) their monthly RDVs.
    const [period, setPeriod] = useState(currentMonthPeriod);
    const { data, isLoading } = useSdrMeetingsQuery(period);
    const meetings = data ?? [];
    const mutations = useSdrMeetingMutations();
    const filters = useSdrMeetingFilters(meetings);
    const drawer = useSdrDetailDrawer();
    const { success: showSuccess, error: showError } = useToast();

    const { position: contextMenuPosition, contextData: contextMenuMeeting, handleContextMenu, close: closeContextMenu } = useContextMenu();
    const contextMeeting = contextMenuMeeting as Meeting | null;

    const [cancelModalMeeting, setCancelModalMeeting] = useState<Meeting | null>(null);
    const [cancelReason, setCancelReason] = useState("");
    const [cancelNote, setCancelNote] = useState("");

    const [rescheduleMeeting, setRescheduleMeeting] = useState<Meeting | null>(null);
    const [rescheduleDateValue, setRescheduleDateValue] = useState("");
    const [rescheduleNote, setRescheduleNote] = useState("");

    const [deleteConfirmMeeting, setDeleteConfirmMeeting] = useState<Meeting | null>(null);
    const [importModalOpen, setImportModalOpen] = useState(false);

    const openCancelModal = (meeting: Meeting) => {
        setCancelModalMeeting(meeting);
        setCancelReason("");
        setCancelNote("");
    };

    const openRescheduleModal = (meeting: Meeting) => {
        setRescheduleMeeting(meeting);
        const base = meeting.callbackDate ? new Date(meeting.callbackDate) : new Date();
        setRescheduleDateValue(toLocalDatetimeInput(base));
        setRescheduleNote("");
    };

    const handleSaveMeeting = async () => {
        if (!drawer.selectedMeeting) return;
        drawer.setSavingError(null);
        const patch = {
            result: drawer.editResult,
            note: drawer.editNote || undefined,
            callbackDate: drawer.editCallbackDate ? new Date(drawer.editCallbackDate).toISOString() : null,
            meetingType: drawer.editMeetingType || null,
            meetingCategory: drawer.editMeetingCategory || null,
            meetingAddress: drawer.editMeetingAddress.trim() ? drawer.editMeetingAddress.trim() : null,
            meetingJoinUrl: drawer.editMeetingJoinUrl.trim() ? drawer.editMeetingJoinUrl.trim() : null,
            meetingPhone: drawer.editMeetingPhone.trim() ? drawer.editMeetingPhone.trim() : null,
        };
        try {
            await mutations.patchMeeting({ id: drawer.selectedMeeting.id, ...patch });
            drawer.setSelectedMeeting((prev) => (prev ? { ...prev, ...patch } : prev));
        } catch (err) {
            drawer.setSavingError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement");
        }
    };

    const handleConfirmCancel = async () => {
        if (!cancelModalMeeting || !cancelReason.trim()) return;
        try {
            await mutations.cancelMeeting({
                id: cancelModalMeeting.id,
                cancellationReason: cancelReason,
                note: cancelNote.trim() || undefined,
            });
            if (drawer.selectedMeeting?.id === cancelModalMeeting.id) {
                drawer.setSelectedMeeting((prev) =>
                    prev
                        ? { ...prev, result: "MEETING_CANCELLED", note: cancelNote.trim() || prev.note, cancellationReason: cancelReason }
                        : prev
                );
                drawer.setEditResult("MEETING_CANCELLED");
                drawer.setEditNote(cancelNote.trim() || drawer.editNote);
            }
            setCancelModalMeeting(null);
            showSuccess("RDV annulé");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erreur réseau";
            drawer.setSavingError(msg);
            showError(msg);
        }
    };

    const handleConfirmReschedule = async () => {
        if (!rescheduleMeeting || !rescheduleDateValue) return;
        try {
            const callbackDate = new Date(rescheduleDateValue).toISOString();
            await mutations.rescheduleMeeting({
                id: rescheduleMeeting.id,
                callbackDate,
                note: rescheduleNote.trim() ? rescheduleNote.trim() : rescheduleMeeting.note,
            });
            if (drawer.selectedMeeting?.id === rescheduleMeeting.id) {
                drawer.setSelectedMeeting((prev) => (prev ? { ...prev, callbackDate, note: rescheduleNote.trim() || prev.note } : prev));
                drawer.setEditCallbackDate(rescheduleDateValue);
            }
            setRescheduleMeeting(null);
            showSuccess("RDV reprogrammé");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erreur réseau";
            drawer.setSavingError(msg);
            showError(msg);
        }
    };

    const handleDeleteMeeting = async () => {
        if (!deleteConfirmMeeting) return;
        try {
            await mutations.deleteMeeting(deleteConfirmMeeting.id);
            if (drawer.selectedMeeting?.id === deleteConfirmMeeting.id) drawer.setSelectedMeeting(null);
            setDeleteConfirmMeeting(null);
            closeContextMenu();
            showSuccess("Rendez-vous supprimé");
        } catch (err) {
            showError(err instanceof Error ? err.message : "Erreur de connexion");
        }
    };

    const openPanel = useCallback((meeting: Meeting) => drawer.setSelectedMeeting(meeting), [drawer]);
    const closePanel = useCallback(() => drawer.setSelectedMeeting(null), [drawer]);

    useRdvKeyboardNavigation<Meeting>({
        panelOpen: !!drawer.selectedMeeting,
        selectedMeetingId: drawer.selectedMeeting?.id ?? null,
        meetings: filters.filteredMeetings,
        closePanel,
        openPanel,
    });

    const getContextMenuItems = (meeting: Meeting) => [
        {
            label: "Ouvrir",
            icon: <Eye className="w-4 h-4" />,
            onClick: () => drawer.setSelectedMeeting(meeting),
        },
        ...(meeting.result === "MEETING_BOOKED"
            ? [
                {
                    label: "Reprogrammer le RDV",
                    icon: <CalendarClock className="w-4 h-4" />,
                    onClick: () => openRescheduleModal(meeting),
                },
                {
                    label: "Annuler le RDV",
                    icon: <XCircle className="w-4 h-4" />,
                    onClick: () => openCancelModal(meeting),
                },
            ]
            : []),
        {
            label: "Supprimer",
            icon: <Trash2 className="w-4 h-4" />,
            onClick: () => setDeleteConfirmMeeting(meeting),
            variant: "danger" as const,
            divider: true,
        },
    ];

    return (
        <div className="min-h-full bg-[#F2F3F7] px-4 py-7 pb-20 sm:px-6 animate-fade-in">
            <div className="mx-auto max-w-7xl space-y-6">
                <SdrMeetingsHeader
                    query={filters.query}
                    onQueryChange={filters.setQuery}
                    onImport={() => setImportModalOpen(true)}
                />

                <AbsentRdvBanner absentMeetings={filters.absentMeetings} onOpen={drawer.setSelectedMeeting} />

                <div className="flex justify-end">
                    <SdrMonthPicker value={period} onChange={setPeriod} />
                </div>

                <SdrStatTiles stats={filters.stats} statusFilter={filters.statusFilter} onSelect={filters.setStatusFilter} />

                <SdrFilterPills statusFilter={filters.statusFilter} onSelect={filters.setStatusFilter} counts={filters.stats} />

                <MeetingList
                    meetings={filters.filteredMeetings}
                    isLoading={isLoading}
                    query={filters.query}
                    statusFilter={filters.statusFilter}
                    onOpen={drawer.setSelectedMeeting}
                    onReschedule={openRescheduleModal}
                    onCancel={openCancelModal}
                    onContextMenu={handleContextMenu}
                />
            </div>

            {drawer.selectedMeeting && (
                <DetailDrawer
                    meeting={drawer.selectedMeeting}
                    drawer={drawer}
                    isSaving={mutations.isSaving}
                    isCancelling={mutations.isCancelling}
                    onClose={() => drawer.setSelectedMeeting(null)}
                    onSave={handleSaveMeeting}
                    onOpenReschedule={openRescheduleModal}
                    onOpenCancel={openCancelModal}
                />
            )}

            <CancelMeetingModal
                isOpen={!!cancelModalMeeting}
                reason={cancelReason}
                onReasonChange={setCancelReason}
                note={cancelNote}
                onNoteChange={setCancelNote}
                submitting={mutations.isCancelling}
                onClose={() => { setCancelModalMeeting(null); setCancelReason(""); setCancelNote(""); }}
                onConfirm={handleConfirmCancel}
            />

            <RescheduleMeetingModal
                isOpen={!!rescheduleMeeting}
                dateValue={rescheduleDateValue}
                onDateChange={setRescheduleDateValue}
                note={rescheduleNote}
                onNoteChange={setRescheduleNote}
                submitting={mutations.isRescheduling}
                onClose={() => { setRescheduleMeeting(null); setRescheduleDateValue(""); setRescheduleNote(""); }}
                onConfirm={handleConfirmReschedule}
            />

            <DeleteMeetingConfirmDialog
                isOpen={!!deleteConfirmMeeting}
                isLoading={mutations.isDeleting}
                onClose={() => setDeleteConfirmMeeting(null)}
                onConfirm={handleDeleteMeeting}
            />

            <ContextMenu
                items={contextMeeting ? getContextMenuItems(contextMeeting) : []}
                position={contextMenuPosition}
                onClose={closeContextMenu}
            />

            <SdrImportRdvModal
                isOpen={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                onSuccess={() => {
                    mutations.invalidate();
                    showSuccess("RDV importés avec succès");
                }}
            />
        </div>
    );
}
