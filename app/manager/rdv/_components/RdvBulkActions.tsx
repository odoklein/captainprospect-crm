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
    <div
      style={{
        borderRadius: 16,
        padding: "10px 12px 10px 20px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        zIndex: 40,
        animation: "slideUp 0.3s cubic-bezier(0.16,1,0.3,1)",
      }}
      className="bulk-action-bar"
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
        <span className="rdv-count" style={{ background: "var(--rose)", color: "var(--ds-accent-fg)", fontSize: 11, padding: "2px 8px" }}>
          {selectedMeetings.length}
        </span>
        selectionne{selectedMeetings.length > 1 ? "s" : ""}
      </span>
      <div style={{ width: 1, height: 24, background: "var(--ds-inverse-line)", margin: "0 4px" }} />
      <button className="rdv-btn rdv-btn-confirm" onClick={onConfirm} disabled={confirming}>
        <Check size={13} /> {confirming ? "Confirmation..." : "Confirmer"}
      </button>
      <button
        className="rdv-btn"
        style={{ background: "var(--ds-inverse-raised)", color: "var(--ds-inverse-ink)", borderColor: "var(--ds-inverse-line)" }}
        onClick={onCancelMeetings}
        disabled={cancelling}
      >
        <XCircle size={13} /> {cancelling ? "Annulation..." : "Annuler"}
      </button>
      <button
        className="rdv-btn"
        style={{ background: "var(--ds-inverse-raised)", color: "var(--ds-inverse-ink)", borderColor: "var(--ds-inverse-line)" }}
        onClick={() => downloadCSV(selectedMeetings, "selection")}
      >
        <Download size={13} /> Exporter CSV
      </button>
      <button className="rdv-btn rdv-btn-danger" onClick={onDeleteRequest}>
        <Trash2 size={13} /> Supprimer
      </button>
      <button
        type="button"
        className="rdv-icon-btn"
        style={{ width: 30, height: 30, background: "transparent", borderColor: "var(--ds-inverse-line)", color: "var(--ds-inverse-ink-2)" }}
        onClick={onClearSelection}
        title="Vider la sélection"
        aria-label="Vider la sélection"
      >
        <X size={14} />
      </button>
    </div>
  );
}
