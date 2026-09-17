import { Loader2, XCircle } from "lucide-react";
import { Button, Modal, Select } from "@/components/ui";
import { MEETING_CANCELLATION_REASONS } from "@/lib/constants/meetingCancellationReasons";

interface CancelMeetingModalProps {
    isOpen: boolean;
    reason: string;
    onReasonChange: (value: string) => void;
    note: string;
    onNoteChange: (value: string) => void;
    submitting: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export function CancelMeetingModal({ isOpen, reason, onReasonChange, note, onNoteChange, submitting, onClose, onConfirm }: CancelMeetingModalProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Annuler le rendez-vous" size="sm">
            <div className="space-y-4">
                <p className="text-slate-600 text-sm">
                    Indiquez la raison de l&apos;annulation. Le contact redevient disponible dans la file de prospection.
                </p>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Raison d&apos;annulation *</label>
                    <Select
                        value={reason}
                        onChange={onReasonChange}
                        options={[
                            { value: "", label: "Choisir une raison..." },
                            ...MEETING_CANCELLATION_REASONS.map((r) => ({ value: r.code, label: r.label })),
                        ]}
                        className="w-full border border-slate-200 rounded-xl"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Note (optionnel)</label>
                    <textarea
                        value={note}
                        onChange={(e) => onNoteChange(e.target.value)}
                        placeholder="Précision..."
                        className="w-full min-h-[80px] px-3 py-2 border border-slate-200 rounded-xl text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        rows={2}
                    />
                </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-slate-100">
                <Button variant="ghost" onClick={onClose}>
                    Fermer
                </Button>
                <Button
                    variant="secondary"
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={onConfirm}
                    disabled={!reason.trim() || submitting}
                >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Confirmer l&apos;annulation
                </Button>
            </div>
        </Modal>
    );
}
