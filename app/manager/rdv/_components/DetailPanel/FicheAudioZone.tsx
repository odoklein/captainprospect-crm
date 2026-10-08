"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud, RefreshCw, Check, FileAudio } from "lucide-react";
import type { Meeting } from "../../_types";
import type { UseFicheRdvReturn } from "../../_hooks/useFicheRdv";
import {
  AUDIO_ACCEPT,
  AUDIO_FORMATS_LABEL,
  MAX_AUDIO_SIZE,
  MAX_AUDIO_SIZE_LABEL,
  isAcceptedAudioFile,
} from "@/lib/audio-upload";

interface FicheAudioZoneProps {
  meeting: Meeting;
  setSelectedMeeting: React.Dispatch<React.SetStateAction<Meeting | null>>;
  ficheState: UseFicheRdvReturn;
}

type Phase = "idle" | "uploading" | "transcribing";

interface UploadResponseData {
  callRecordingUrl?: string | null;
  callTranscription?: string | null;
  fiche?: Record<string, string> | null;
  transcriptionError?: string | null;
  ficheError?: string | null;
  storageError?: string | null;
}

function formatMb(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/**
 * Audio upload for the RDV: sends the file to /api/actions/[id]/upload-audio, which stores it,
 * transcribes it with OpenAI (French) and, if the fiche is still empty, generates it.
 * The resulting transcript lands in the "Génération IA" textarea so it can be edited / re-used.
 */
export function FicheAudioZone({ meeting, setSelectedMeeting, ficheState }: FicheAudioZoneProps) {
  const { ficheForm, setFicheForm, setFicheManualTranscript } = ficheState;

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const busy = phase !== "idle";
  const hasRecording = !!meeting.callRecordingUrl?.trim();
  const hasTranscription = !!meeting.callTranscription?.trim();

  // Elapsed-seconds counter while Voxtral is working (no server-side progress is available).
  useEffect(() => {
    if (phase !== "transcribing") return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Abort an in-flight upload if the panel switches RDV / unmounts.
  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
    };
  }, [meeting.id]);

  const ficheHasContent = Object.values(ficheForm).some((v) => typeof v === "string" && v.trim());

  const upload = useCallback(
    (file: File) => {
      setError(null);
      setNotice(null);

      if (!isAcceptedAudioFile(file.name, file.type)) {
        setError(`Format non pris en charge. Formats acceptés : ${AUDIO_FORMATS_LABEL}.`);
        return;
      }
      if (file.size === 0) {
        setError("Le fichier audio est vide.");
        return;
      }
      if (file.size > MAX_AUDIO_SIZE) {
        setError(`Fichier trop volumineux (${formatMb(file.size)}). Taille maximale : ${MAX_AUDIO_SIZE_LABEL}.`);
        return;
      }

      const meetingSnapshot = meeting;
      const keepFiche = ficheHasContent;
      const body = new FormData();
      body.append("file", file);
      // Never overwrite a fiche the manager already filled in: only transcribe in that case.
      if (keepFiche) body.append("skipFiche", "1");

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open("POST", `/api/actions/${meeting.id}/upload-audio`);
      xhr.responseType = "json";

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
      };
      xhr.upload.onload = () => setPhase("transcribing");

      const finish = () => {
        xhrRef.current = null;
        setPhase("idle");
        setProgress(0);
      };

      xhr.onerror = () => {
        finish();
        setError("Erreur réseau : impossible d'envoyer le fichier audio. Vérifiez votre connexion et réessayez.");
      };
      xhr.ontimeout = xhr.onerror;
      xhr.onabort = () => finish();

      xhr.onload = () => {
        const json = xhr.response as { success?: boolean; error?: string; data?: UploadResponseData } | null;
        finish();

        if (xhr.status === 413) {
          setError(`Fichier refusé par le serveur (trop volumineux, ${MAX_AUDIO_SIZE_LABEL} max).`);
          return;
        }
        if (!json || !json.success || !json.data) {
          setError(
            json?.error ||
              (xhr.status >= 500
                ? "Le serveur n'a pas pu traiter le fichier audio. Réessayez dans un instant."
                : "Échec de l'envoi du fichier audio."),
          );
          return;
        }

        const d = json.data;
        const now = new Date().toISOString();
        const updated: Meeting = {
          ...meetingSnapshot,
          callRecordingUrl: d.callRecordingUrl ?? meetingSnapshot.callRecordingUrl,
          callTranscription: d.callTranscription ?? meetingSnapshot.callTranscription,
          rdvFiche: d.fiche ?? meetingSnapshot.rdvFiche,
          rdvFicheUpdatedAt: d.fiche ? now : meetingSnapshot.rdvFicheUpdatedAt,
        };
        setSelectedMeeting((cur) => (cur && cur.id === updated.id ? { ...cur, ...updated } : cur));

        if (d.transcriptionError) {
          setError(`Transcription impossible : ${d.transcriptionError}`);
          return;
        }

        if (d.callTranscription) setFicheManualTranscript(d.callTranscription);
        if (d.fiche) {
          setFicheForm({
            contexte: d.fiche.contexte || "",
            besoinsProblemes: d.fiche.besoinsProblemes || "",
            solutionsEnPlace: d.fiche.solutionsEnPlace || "",
            objectionsFreins: d.fiche.objectionsFreins || "",
            notesImportantes: d.fiche.notesImportantes || "",
          });
        }

        const parts: string[] = [];
        if (d.fiche) {
          parts.push("Audio transcrit et fiche générée automatiquement.");
        } else if (d.ficheError) {
          parts.push(`Audio transcrit, mais la fiche n'a pas pu être générée : ${d.ficheError}. Cliquez sur « Générer IA » pour réessayer.`);
        } else if (keepFiche) {
          parts.push("Audio transcrit. Votre fiche n'a pas été modifiée : cliquez sur « Générer IA » pour la régénérer depuis la transcription.");
        } else {
          parts.push("Audio transcrit.");
        }
        if (d.storageError) parts.push(d.storageError);
        setNotice(parts.join(" "));
      };

      setFileName(file.name);
      setProgress(0);
      setPhase("uploading");
      xhr.send(body);
    },
    [meeting, ficheHasContent, setSelectedMeeting, setFicheForm, setFicheManualTranscript],
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) upload(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  return (
    <div className="rdv-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div className="rdv-eyebrow">Enregistrement</div>
          <div style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)", marginTop: 2 }}>
            Audio du rendez-vous
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink3)", marginTop: 2 }}>
            Importez l&apos;enregistrement : il est transcrit en français par OpenAI, puis la fiche peut être
            générée.
          </div>
        </div>
      </div>

      <input ref={inputRef} type="file" accept={AUDIO_ACCEPT} onChange={onPick} style={{ display: "none" }} />

      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-disabled={busy}
        aria-label="Importer un fichier audio"
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!busy && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "16px 12px",
          textAlign: "center",
          borderRadius: 10,
          cursor: busy ? "default" : "pointer",
          border: `1.5px dashed ${dragOver ? "var(--rose)" : "var(--line, var(--ink3))"}`,
          background: dragOver ? "color-mix(in oklab, var(--rose) 7%, var(--surface))" : "var(--surface2)",
          transition: "border-color .15s, background .15s",
        }}
      >
        {phase === "idle" && (
          <>
            <UploadCloud size={20} style={{ color: "var(--rose)" }} />
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>
              {hasRecording || hasTranscription
                ? "Remplacer l'audio : glissez un fichier ici ou cliquez"
                : "Glissez un fichier audio ici ou cliquez pour parcourir"}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink3)" }}>
              {AUDIO_FORMATS_LABEL} · {MAX_AUDIO_SIZE_LABEL} max
            </div>
          </>
        )}

        {phase === "uploading" && (
          <>
            <FileAudio size={20} style={{ color: "var(--rose)" }} />
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", wordBreak: "break-all" }}>
              Envoi de {fileName}…
            </div>
            <div className="rdv-progress" style={{ width: "100%", maxWidth: 260 }}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--ink3)", fontVariantNumeric: "tabular-nums" }}>{progress} %</div>
          </>
        )}

        {phase === "transcribing" && (
          <>
            <RefreshCw size={20} style={{ color: "var(--rose)", animation: "spin 1s linear infinite" }} />
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>
              Transcription en cours (Voxtral)…
            </div>
            <div style={{ fontSize: 11, color: "var(--ink3)", fontVariantNumeric: "tabular-nums" }}>
              {elapsed} s · cela peut prendre plusieurs minutes pour un long enregistrement
            </div>
          </>
        )}
      </div>

      {error && <div className="rdv-alert">{error}</div>}

      {notice && !error && (
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "flex-start",
            fontSize: 12,
            color: "var(--greenInk)",
            lineHeight: 1.45,
          }}
        >
          <Check size={13} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>{notice}</span>
        </div>
      )}

      {hasRecording && (
        <audio
          controls
          preload="none"
          src={`/api/actions/${meeting.id}/recording`}
          style={{ width: "100%", height: 38 }}
        />
      )}
    </div>
  );
}
