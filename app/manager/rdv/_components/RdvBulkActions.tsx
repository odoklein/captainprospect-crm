"use client";

import type { Meeting } from "../_types";
import { downloadCSV } from "../_lib/csv-export";
import { Check, Download, Trash2, X, XCircle } from "lucide-react";

interface RdvBulkActionsProps {
  selectedMeetings: Meeting[];
  confirming: boolean;
  cancelling: boolean;
  onConfirm: () => void;
  onCancelMeetings: () => void;
  onDeleteRequest: () => void;
  onClearSelection: () => void;
}

export function RdvBulkActions({
  selectedMeetings,
  confirming,
  cancelling,
  onConfirm,
  onCancelMeetings,
  onDeleteRequest,
  onClearSelection,
}: RdvBulkActionsProps) {
  if (selectedMeetings.length === 0) return null;

  return (
    <div className="bulk-action-bar" role="group" aria-label="Actions sur la sélection">
      <span className="rdv-selection-count" role="status">
        <span className="rdv-count">{selectedMeetings.length}</span>
        {selectedMeetings.length === 1 ? "RDV sélectionné" : "RDV sélectionnés"}
      </span>
      <button type="button" className="rdv-btn rdv-btn-confirm" onClick={onConfirm} disabled={confirming}>
        <Check size={13} aria-hidden /> {confirming ? "Confirmation…" : "Confirmer"}
      </button>
      <button
        type="button"
        className="rdv-btn rdv-selection-secondary"
        onClick={onCancelMeetings}
        disabled={cancelling}
      >
        <XCircle size={13} aria-hidden /> {cancelling ? "Annulation…" : "Annuler"}
      </button>
      <button
        type="button"
        className="rdv-btn rdv-selection-secondary"
        onClick={() => downloadCSV(selectedMeetings, "selection")}
      >
        <Download size={13} aria-hidden /> Exporter CSV
      </button>
      <button type="button" className="rdv-btn rdv-btn-danger" onClick={onDeleteRequest}>
        <Trash2 size={13} aria-hidden /> Supprimer
      </button>
      <button
        type="button"
        className="rdv-icon-btn rdv-selection-secondary"
        onClick={onClearSelection}
        title="Vider la sélection"
        aria-label="Vider la sélection"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
