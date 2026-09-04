"use client";

import { useState, useCallback, useRef } from "react";
import type { Meeting } from "../_types";

export type FicheAutoSaveStatus = "idle" | "saving" | "saved" | "error";

export interface FicheForm {
  contexte: string;
  besoinsProblemes: string;
  solutionsEnPlace: string;
  objectionsFreins: string;
  notesImportantes: string;
}

export interface UseFicheRdvReturn {
  ficheForm: FicheForm;
  setFicheForm: React.Dispatch<React.SetStateAction<FicheForm>>;
  ficheLoading: boolean;
  ficheError: string | null;
  setFicheError: (v: string | null) => void;
  ficheSaving: boolean;
  ficheSaved: boolean;
  ficheManualTranscript: string;
  setFicheManualTranscript: (v: string) => void;
  ficheAutoSaveStatus: FicheAutoSaveStatus;
  initFiche: (m: Meeting) => void;
  generateWithAI: (meeting: Meeting, onUpdate: (m: Meeting) => void) => Promise<void>;
  generateWithAIFromTranscription: (meeting: Meeting, transcription: string, onUpdate: (m: Meeting) => void) => Promise<void>;
  saveFiche: (meeting: Meeting, onUpdate: (m: Meeting) => void) => Promise<void>;
  triggerAutoSave: (meetingId: string, form: FicheForm) => void;
}

export function useFicheRdv(
  updateMeeting: (id: string, data: Record<string, unknown>) => Promise<void>
): UseFicheRdvReturn {
  const [ficheForm, setFicheForm] = useState<FicheForm>({
    contexte: "",
    besoinsProblemes: "",
    solutionsEnPlace: "",
    objectionsFreins: "",
    notesImportantes: "",
  });
  const [ficheLoading, setFicheLoading] = useState(false);
  const [ficheError, setFicheError] = useState<string | null>(null);
  const [ficheSaving, setFicheSaving] = useState(false);
  const [ficheSaved, setFicheSaved] = useState(false);
  const [ficheManualTranscript, setFicheManualTranscript] = useState("");
  const [ficheAutoSaveStatus, setFicheAutoSaveStatus] = useState<FicheAutoSaveStatus>("idle");
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initFiche = useCallback((m: Meeting) => {
    setFicheForm({
      contexte: (m.rdvFiche?.contexte as string) || "",
      besoinsProblemes: (m.rdvFiche?.besoinsProblemes as string) || "",
      solutionsEnPlace: (m.rdvFiche?.solutionsEnPlace as string) || "",
      objectionsFreins: (m.rdvFiche?.objectionsFreins as string) || "",
      notesImportantes: (m.rdvFiche?.notesImportantes as string) || "",
    });
    setFicheLoading(false);
    setFicheError(null);
    setFicheManualTranscript("");
    setFicheSaved(false);
  }, []);

  const generateWithAI = useCallback(
    async (meeting: Meeting, onUpdate: (m: Meeting) => void) => {
      const transcription = ficheManualTranscript.trim();
      if (!transcription || transcription.length < 5) {
        setFicheError(
          "Veuillez coller ou saisir une transcription (au moins 5 caractères), puis relancez."
        );
        return;
      }
      setFicheLoading(true);
      setFicheError(null);
      try {
        const res = await fetch("/api/ai/mistral/rdv-fiche", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcription }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          const errorMsg =
            res.status === 429
              ? "Trop de requêtes vers l'IA (limite temporaire atteinte). Veuillez patienter quelques secondes avant de réessayer."
              : (json?.error || "Impossible de générer la fiche.");
          setFicheError(errorMsg);
          return;
        }
        const fiche = json.data?.fiche;
        setFicheForm({
          contexte: fiche?.contexte || "",
          besoinsProblemes: fiche?.besoinsProblemes || "",
          solutionsEnPlace: fiche?.solutionsEnPlace || "",
          objectionsFreins: fiche?.objectionsFreins || "",
          notesImportantes: fiche?.notesImportantes || "",
        });
        await updateMeeting(meeting.id, { rdvFiche: fiche });
        onUpdate({ ...meeting, rdvFiche: fiche, rdvFicheUpdatedAt: new Date().toISOString() });
        setFicheSaved(true);
        setTimeout(() => setFicheSaved(false), 3000);
      } catch (e) {
        console.error(e);
        setFicheError("Erreur réseau lors de la génération.");
      } finally {
        setFicheLoading(false);
      }
    },
    [ficheManualTranscript, updateMeeting]
  );

  const saveFiche = useCallback(
    async (meeting: Meeting, onUpdate: (m: Meeting) => void) => {
      setFicheSaving(true);
      setFicheError(null);
      try {
        const fiche = { ...ficheForm };
        await updateMeeting(meeting.id, { rdvFiche: fiche });
        onUpdate({ ...meeting, rdvFiche: fiche, rdvFicheUpdatedAt: new Date().toISOString() });
        setFicheSaved(true);
        setTimeout(() => setFicheSaved(false), 3000);
      } catch (e) {
        console.error(e);
        setFicheError("Erreur lors de la sauvegarde.");
      } finally {
        setFicheSaving(false);
      }
    },
    [ficheForm, updateMeeting]
  );

  const generateWithAIFromTranscription = useCallback(
    async (meeting: Meeting, transcription: string, onUpdate: (m: Meeting) => void) => {
      const clean = (transcription || "").trim();
      if (!clean || clean.length < 5) {
        setFicheError("Transcription trop courte pour générer une fiche (minimum 5 caractères).");
        return;
      }
      setFicheLoading(true);
      setFicheError(null);
      try {
        const res = await fetch("/api/ai/mistral/rdv-fiche", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcription: clean }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          const errorMsg =
            res.status === 429
              ? "Trop de requêtes vers l'IA (limite temporaire atteinte). Veuillez patienter quelques secondes avant de réessayer."
              : (json?.error || "Impossible de générer la fiche.");
          setFicheError(errorMsg);
          return;
        }
        const fiche = json.data?.fiche;
        setFicheForm({
          contexte: fiche?.contexte || "",
          besoinsProblemes: fiche?.besoinsProblemes || "",
          solutionsEnPlace: fiche?.solutionsEnPlace || "",
          objectionsFreins: fiche?.objectionsFreins || "",
          notesImportantes: fiche?.notesImportantes || "",
        });
        await updateMeeting(meeting.id, { rdvFiche: fiche });
        onUpdate({ ...meeting, rdvFiche: fiche, rdvFicheUpdatedAt: new Date().toISOString() });
        setFicheSaved(true);
        setTimeout(() => setFicheSaved(false), 3000);
      } catch (e) {
        console.error(e);
        setFicheError("Erreur réseau lors de la génération.");
      } finally {
        setFicheLoading(false);
      }
    },
    [updateMeeting],
  );

  const triggerAutoSave = useCallback(
    (meetingId: string, form: FicheForm) => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      setFicheAutoSaveStatus("saving");
      autoSaveTimeoutRef.current = setTimeout(async () => {
        try {
          await updateMeeting(meetingId, { rdvFiche: form });
          setFicheAutoSaveStatus("saved");
          setTimeout(() => setFicheAutoSaveStatus("idle"), 2000);
        } catch {
          setFicheAutoSaveStatus("error");
        }
      }, 1500);
    },
    [updateMeeting]
  );

  return {
    ficheForm,
    setFicheForm,
    ficheLoading,
    ficheError,
    setFicheError,
    ficheSaving,
    ficheSaved,
    ficheManualTranscript,
    setFicheManualTranscript,
    ficheAutoSaveStatus,
    initFiche,
    generateWithAI,
    generateWithAIFromTranscription,
    saveFiche,
    triggerAutoSave,
  };
}
