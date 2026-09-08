"use client";

import { useState } from "react";
import type { Meeting } from "../../_types";
import type { UseFicheRdvReturn } from "../../_hooks/useFicheRdv";
import { FileText, Check, RefreshCw, Copy, CheckCheck, Sparkles } from "lucide-react";

interface FicheTabProps {
  meeting: Meeting;
  setSelectedMeeting: React.Dispatch<React.SetStateAction<Meeting | null>>;
  ficheState: UseFicheRdvReturn;
}

const FICHE_FIELDS = [
  ["contexte", "Contexte"],
  ["besoinsProblemes", "Besoins / Problèmes identifiés"],
  ["solutionsEnPlace", "Solutions en place"],
  ["objectionsFreins", "Objections / Freins"],
  ["notesImportantes", "Notes importantes"],
] as const;

export function FicheTab({ meeting, setSelectedMeeting, ficheState }: FicheTabProps) {
  const [copiedFiche, setCopiedFiche] = useState(false);

  const {
    ficheForm,
    setFicheForm,
    ficheLoading,
    ficheError,
    ficheSaving,
    ficheSaved,
    ficheManualTranscript,
    setFicheManualTranscript,
    ficheAutoSaveStatus,
    generateWithAI,
    saveFiche,
    triggerAutoSave,
  } = ficheState;

  const handleCopyAll = () => {
    const text = FICHE_FIELDS.map(([field, label]) => `**${label}** :\n${ficheForm[field]?.trim() || "—"}`).join("\n\n");
    navigator.clipboard.writeText(text);
    setCopiedFiche(true);
    setTimeout(() => setCopiedFiche(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Fiche Qualification RDV</div>
          <button
            className="rdv-btn rdv-btn-ghost"
            style={{ fontSize: 11, padding: "3px 8px" }}
            onClick={handleCopyAll}
            title="Copier toute la fiche formatée"
          >
            {copiedFiche ? <CheckCheck size={12} style={{ color: "var(--green)" }} /> : <Copy size={12} />}
            <span>{copiedFiche ? "Copié !" : "Copier"}</span>
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {ficheAutoSaveStatus === "saving" && <span style={{ fontSize: 11, color: "var(--ink3)", fontWeight: 500 }}>Enregistrement…</span>}
          {ficheAutoSaveStatus === "saved" && <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 500 }}>Sauvegardé ✓</span>}
          {ficheAutoSaveStatus === "error" && <span style={{ fontSize: 11, color: "var(--red)", fontWeight: 500 }}>Erreur</span>}
          {ficheSaved && ficheAutoSaveStatus === "idle" && <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 500 }}>Sauvegardé ✓</span>}

          <button
            className="rdv-btn"
            style={{
              fontSize: 11,
              padding: "5px 10px",
              background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
              color: "#ffffff",
              boxShadow: "0 2px 6px rgba(79, 70, 229, 0.25)",
            }}
            disabled={ficheLoading}
            onClick={() => generateWithAI(meeting, (updated) => setSelectedMeeting(updated))}
          >
            {ficheLoading ? (
              <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <Sparkles size={12} />
            )}
            Générer IA
          </button>

          <button
            className="rdv-btn rdv-btn-primary"
            style={{ fontSize: 11, padding: "5px 10px" }}
            disabled={ficheSaving}
            onClick={() => saveFiche(meeting, (updated) => setSelectedMeeting(updated))}
          >
            <Check size={12} /> {ficheSaving ? "Enregistrement…" : "Sauvegarder"}
          </button>
        </div>
      </div>

      {meeting.rdvFicheUpdatedAt && (
        <div style={{ fontSize: 12, color: "var(--ink3)" }}>
          Dernière mise à jour : {new Date(meeting.rdvFicheUpdatedAt).toLocaleString("fr-FR")}
        </div>
      )}

      {ficheError && (
        <div style={{ background: "var(--redLight)", border: "1px solid rgba(220,38,38,0.18)", color: "var(--red)", padding: "10px 12px", borderRadius: 12, fontSize: 12 }}>
          {ficheError}
        </div>
      )}

      <div>
        <div style={{ fontSize: 12, color: "var(--ink3)", fontWeight: 600, marginBottom: 8 }}>
          Transcription (à coller pour génération IA)
        </div>
        <textarea
          className="rdv-input"
          style={{ width: "100%", minHeight: 100, resize: "vertical" }}
          value={ficheManualTranscript}
          onChange={(e) => setFicheManualTranscript(e.target.value)}
          onKeyDown={(e) => {
            // Keep paste shortcut local to this field and avoid global hotkey interception.
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
              e.stopPropagation();
            }
          }}
          onPaste={(e) => {
            // Some global listeners can interfere with paste; prevent bubbling from this textarea.
            e.stopPropagation();
          }}
          placeholder="Collez ici la transcription complète (Agent/Prospect)…"
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {FICHE_FIELDS.map(([field, label]) => (
          <div key={field} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "var(--surface)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "var(--ink3)", textTransform: "uppercase", marginBottom: 8 }}>
              {label}
            </div>
            <textarea
              className="rdv-input"
              style={{ width: "100%", minHeight: 80, resize: "vertical", border: "1px solid var(--border2)", borderRadius: 8, fontSize: 13, lineHeight: 1.6, padding: "8px 10px", background: "var(--surface2)" }}
              value={ficheForm[field]}
              onChange={(e) => {
                const updated = { ...ficheForm, [field]: e.target.value };
                setFicheForm(updated);
                triggerAutoSave(meeting.id, updated);
              }}
              placeholder={`Saisir ${label.toLowerCase()}…`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
