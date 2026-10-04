"use client";

import { useState } from "react";
import type { Meeting } from "../../_types";
import type { UseFicheRdvReturn } from "../../_hooks/useFicheRdv";
import { Check, RefreshCw, Copy, CheckCheck, AlertCircle } from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";
import { FicheAudioZone } from "./FicheAudioZone";

interface FicheTabProps {
  meeting: Meeting;
  setSelectedMeeting: React.Dispatch<React.SetStateAction<Meeting | null>>;
  ficheState: UseFicheRdvReturn;
}

const FICHE_FIELDS = [
  ["contexte", "Contexte", "Situation de l'entreprise et origine du rendez-vous"],
  ["besoinsProblemes", "Besoins / Problèmes identifiés", "Ce que le prospect cherche à résoudre"],
  ["solutionsEnPlace", "Solutions en place", "Outils, prestataires ou process actuels"],
  ["objectionsFreins", "Objections / Freins", "Réserves exprimées, budget, timing, décideurs"],
  ["notesImportantes", "Notes importantes", "À transmettre au commercial avant le RDV"],
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

  const filledCount = FICHE_FIELDS.filter(([field]) => !!ficheForm[field]?.trim()).length;
  const complete = filledCount === FICHE_FIELDS.length;
  const showSaved = ficheAutoSaveStatus === "saved" || (ficheSaved && ficheAutoSaveStatus === "idle");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header: title, completion, actions */}
      <div className="rdv-card rdv-fiche-head">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="rdv-eyebrow">Fiche qualification</div>
            <div className="rdv-serif" style={{ fontSize: 17, color: "var(--ink)", marginTop: 2 }}>
              Fiche RDV
            </div>
            {meeting.rdvFicheUpdatedAt && (
              <div style={{ fontSize: 11.5, color: "var(--ink3)", marginTop: 3 }}>
                Dernière mise à jour : {new Date(meeting.rdvFicheUpdatedAt).toLocaleString("fr-FR")}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {ficheAutoSaveStatus === "saving" && (
              <span className="rdv-save-state">
                <RefreshCw size={11} style={{ animation: "spin 1s linear infinite" }} /> Enregistrement…
              </span>
            )}
            {showSaved && (
              <span className="rdv-save-state" data-tone="ok">
                <Check size={11} /> Sauvegardé
              </span>
            )}
            {ficheAutoSaveStatus === "error" && (
              <span className="rdv-save-state" data-tone="error">
                <AlertCircle size={11} /> Erreur
              </span>
            )}

            <button
              className="rdv-btn rdv-btn-ghost rdv-btn-sm"
              onClick={handleCopyAll}
              title="Copier toute la fiche formatée"
            >
              {copiedFiche ? <CheckCheck size={12} style={{ color: "var(--green)" }} /> : <Copy size={12} />}
              <span>{copiedFiche ? "Copié" : "Copier"}</span>
            </button>

            <button
              className="rdv-btn rdv-btn-primary rdv-btn-sm"
              disabled={ficheSaving}
              onClick={() => saveFiche(meeting, (updated) => setSelectedMeeting(updated))}
            >
              <Check size={12} /> {ficheSaving ? "Enregistrement…" : "Sauvegarder"}
            </button>
          </div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink2)" }}>
              {complete ? "Fiche complète" : "Complétude"}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: complete ? "var(--greenInk)" : "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
              {filledCount} / {FICHE_FIELDS.length}
            </span>
          </div>
          <div className="rdv-progress" data-complete={complete}>
            <span style={{ width: `${(filledCount / FICHE_FIELDS.length) * 100}%` }} />
          </div>
        </div>
      </div>

      {ficheError && <div className="rdv-alert">{ficheError}</div>}

      <FicheAudioZone meeting={meeting} setSelectedMeeting={setSelectedMeeting} ficheState={ficheState} />

      {/* AI generation from a transcript (uploaded audio or pasted text) */}
      <div className="rdv-ai-zone">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                display: "grid",
                placeContent: "center",
                background: "var(--surface)",
                color: "var(--rose)",
                border: "1px solid color-mix(in oklab, var(--rose) 25%, transparent)",
                flexShrink: 0,
              }}
            >
              <AiMark size={14} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)" }}>Génération IA</div>
              <div style={{ fontSize: 11.5, color: "var(--ink3)" }}>Transcription de l’audio ou texte collé, utilisée pour remplir la fiche</div>
            </div>
          </div>
          <button
            className="rdv-btn rdv-btn-ai rdv-btn-sm"
            disabled={ficheLoading}
            onClick={() => generateWithAI(meeting, (updated) => setSelectedMeeting(updated))}
          >
            {ficheLoading ? (
              <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <AiMark size={12} />
            )}
            Générer IA
          </button>
        </div>
        <textarea
          className="rdv-input"
          style={{ width: "100%", minHeight: 96, resize: "vertical", fontSize: 12.5, lineHeight: 1.55 }}
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
          placeholder="La transcription de l’audio apparaît ici. Vous pouvez aussi coller une transcription complète (Agent/Prospect)…"
        />
      </div>

      {/* Qualification sections */}
      <div className="rdv-card" style={{ overflow: "hidden" }}>
        {FICHE_FIELDS.map(([field, label, hint], index) => {
          const filled = !!ficheForm[field]?.trim();
          return (
            <div key={field} className="rdv-fiche-section" data-filled={filled}>
              <span className="rdv-fiche-index" aria-hidden="true">
                {filled ? <Check size={13} strokeWidth={2.5} /> : index + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <label htmlFor={`fiche-${field}`} className="rdv-fiche-label" style={{ display: "block" }}>
                  {label}
                </label>
                <div className="rdv-fiche-hint">{hint}</div>
                <textarea
                  id={`fiche-${field}`}
                  className="rdv-input rdv-fiche-textarea"
                  value={ficheForm[field]}
                  onChange={(e) => {
                    const updated = { ...ficheForm, [field]: e.target.value };
                    setFicheForm(updated);
                    triggerAutoSave(meeting.id, updated);
                  }}
                  placeholder={`Saisir ${label.toLowerCase()}…`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
