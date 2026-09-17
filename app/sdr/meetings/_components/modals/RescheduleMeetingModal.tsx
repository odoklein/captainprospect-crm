import { CalendarClock, Loader2 } from "lucide-react";
import { Button, DateTimePicker, Modal } from "@/components/ui";

interface RescheduleMeetingModalProps {
    isOpen: boolean;
    dateValue: string;
    onDateChange: (value: string) => void;
    note: string;
    onNoteChange: (value: string) => void;
    submitting: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export function RescheduleMeetingModal({ isOpen, dateValue, onDateChange, note, onNoteChange, submitting, onClose, onConfirm }: RescheduleMeetingModalProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Reprogrammer le RDV" size="sm">
            <div className="space-y-4">
                <div>
                    <DateTimePicker
                        label="Nouvelle date et heure *"
                        value={dateValue}
                        onChange={onDateChange}
                        placeholder="Choisir date et heure…"
                        min={new Date().toISOString().slice(0, 16)}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Note (optionnel)</label>
                    <textarea
                        value={note}
                        onChange={(e) => onNoteChange(e.target.value)}
                        placeholder="Ex: RDV reporté au..."
                        className="w-full min-h-[60px] px-3 py-2 border border-slate-200 rounded-xl text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        rows={2}
                    />
                </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-slate-100">
                <Button variant="ghost" onClick={onClose}>
                    Fermer
                </Button>
                <Button onClick={onConfirm} disabled={!dateValue || submitting} className="gap-2">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                    Enregistrer la nouvelle date
                </Button>
            </div>
        </Modal>
    );
}
