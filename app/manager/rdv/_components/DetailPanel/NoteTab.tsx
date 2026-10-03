"use client";

import type { Meeting } from "../../_types";
import type { UseNoteAutosaveReturn } from "../../_hooks/useNoteAutosave";
import { Check } from "lucide-react";

interface NoteTabProps {
  meeting: Meeting;
  noteState: UseNoteAutosaveReturn;
  updateMeeting: (id: string, data: Record<string, unknown>) => Promise<void>;
}

export function NoteTab({ meeting, noteState, updateMeeting }: NoteTabProps) {
  const { managerNote, setManagerNote, noteStatus, triggerSave } = noteState;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Note interne manager</span>
        {noteStatus === "saving" && (
          <span style={{ fontSize: 12, color: "var(--amber)", fontWeight: 500 }}>Enregistrement…</span>
        )}
        {noteStatus === "saved" && (
          <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 4 }}><Check size={12} />Sauvegardé</span>
        )}
        {noteStatus === "error" && (
          <span style={{ fontSize: 12, color: "var(--red)", fontWeight: 500 }}>Erreur de sauvegarde</span>
        )}
      </div>
      <textarea
        className="rdv-input"
        style={{ width: "100%", minHeight: 240, resize: "vertical" }}
        value={managerNote}
        onChange={(e) => {
          setManagerNote(e.target.value);
          triggerSave(meeting.id, e.target.value, updateMeeting);
        }}
        placeholder="Ajouter une note interne (non visible par le client)…"
      />
    </div>
  );
}
