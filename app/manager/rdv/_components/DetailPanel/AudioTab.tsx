"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  CalendarClock,
  Clock3,
  FileText,
  Link2,
  Loader2,
  PhoneCall,
  Radio,
  RefreshCw,
  Search,
  Unlink,
  Upload,
} from "lucide-react";
import type { Meeting } from "../../_types";
import type { UseFicheRdvReturn } from "../../_hooks/useFicheRdv";
import { useToast } from "@/components/ui";
import { AiMark } from "@/components/ui/AiMark";
import { AUDIO_ACCEPT, AUDIO_FORMATS_LABEL, MAX_AUDIO_SIZE, MAX_AUDIO_SIZE_LABEL, isAcceptedAudioFile } from "@/lib/audio-upload";
import { CallPlayer } from "./audio/CallPlayer";
import { SourceChain, type ChainStep } from "./audio/SourceChain";
import { CallSummaryCard, TranscriptCard } from "./audio/CallContent";
import { CallPicker } from "./audio/CallPicker";
import {
  ORIGIN_META,
  SOURCE_ORDER,
  formatDuration,
  originOfRecording,
  type AudioOrigin,
  type CallSourceKey,
  type CandidateCall,
  type SourceAttempt,
} from "./audio/call-model";
import "./audio/audio.css";

interface AudioTabProps {
  meeting: Meeting;
  updateMeeting: (id: string, data: Record<string, unknown>) => Promise<void>;
  setSelectedMeeting: (meeting: Meeting) => void;
  ficheState?: UseFicheRdvReturn;
  /** Switches the dossier to the « Fiche RDV » tab. */
  onOpenFiche?: () => void;
}

type Lookup =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "found"; source?: CallSourceKey; window?: string; attempts?: SourceAttempt[] }
  | { phase: "pending"; inProgress: boolean; polls: number }
  | { phase: "not_found"; attempts?: SourceAttempt[] }
  | { phase: "error"; message: string };

type FicheGen = "idle" | "generating" | "done" | "error";

/** While a softphone call is linked but its audio is not in yet, re-ask this often, this many times. */
const PENDING_POLL_MS = 8000;
const PENDING_MAX_POLLS = 40;

interface EnrichResponse {
  found: boolean;
  ficheGenerated: boolean;
  fiche?: Record<string, string> | null;
  pending?: { source: "twilio"; inProgress: boolean };
  source?: CallSourceKey;
  window?: string;
  attempts?: SourceAttempt[];
  callSummary?: string | null;
  callTranscription?: string | null;
  callRecordingUrl?: string | null;
  error?: string;
}

function ficheFilled(fiche: Meeting["rdvFiche"]): boolean {
  return !!fiche && Object.values(fiche).some((v) => typeof v === "string" && v.trim().length > 0);
}

function chainFrom(lookup: Lookup): Partial<Record<CallSourceKey, ChainStep>> {
  if (lookup.phase === "searching") return { vault: { state: "checking" }, twilio: { state: "waiting" }, allo: { state: "waiting" } };
  if (lookup.phase === "pending") {
    return {
      vault: { state: "skipped", detail: "Pas nécessaire" },
      twilio: { state: "pending", detail: lookup.inProgress ? "Appel en cours" : "Audio en traitement" },
      allo: { state: "skipped", detail: "Pas nécessaire" },
    };
  }
  if ((lookup.phase === "found" || lookup.phase === "not_found") && lookup.attempts?.length) {
    const steps: Partial<Record<CallSourceKey, ChainStep>> = {};
    for (const a of lookup.attempts) {
      steps[a.source] = {
        state: a.status,
        detail: a.status === "found" ? (a.window ? `Trouvé · ${a.window.toLowerCase()}` : undefined) : a.reason,
      };
    }
    // Sources after the one that answered were never asked.
    for (const s of SOURCE_ORDER) if (!steps[s]) steps[s] = { state: "skipped", detail: "Pas nécessaire" };
    return steps;
  }
  return {};
}

export function AudioTab({ meeting, updateMeeting, setSelectedMeeting, ficheState, onOpenFiche }: AudioTabProps) {
  const recordingUrl = meeting.callRecordingUrl?.trim() ?? "";
  const transcription = meeting.callTranscription?.trim() ?? "";
  const summary = meeting.callSummary?.trim() ?? "";
  const hasCall = !!(recordingUrl || transcription || summary);

  const { success, error: showError } = useToast();
  const [lookup, setLookup] = useState<Lookup>(hasCall ? { phase: "found" } : { phase: "searching" });
  /** Origin of the attached call when the stored URL doesn't tell (summary-only calls). */
  const [knownOrigin, setKnownOrigin] = useState<AudioOrigin | null>(null);
  const [ficheGen, setFicheGen] = useState<FicheGen>("idle");
  const [showPicker, setShowPicker] = useState(false);
  const [linking, setLinking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const meetingRef = useRef(meeting);
  meetingRef.current = meeting;

  const origin: AudioOrigin | null = originOfRecording(recordingUrl) ?? knownOrigin;

  /** Writes call data onto the open RDV (and the fiche, when the server generated one). */
  const applyCallData = useCallback(
    (d: { callSummary?: string | null; callTranscription?: string | null; callRecordingUrl?: string | null; fiche?: Record<string, string> | null }) => {
      const m = meetingRef.current;
      const updated: Meeting = {
        ...m,
        callSummary: d.callSummary ?? m.callSummary,
        callTranscription: d.callTranscription ?? m.callTranscription,
        callRecordingUrl: d.callRecordingUrl ?? m.callRecordingUrl,
        ...(d.fiche ? { rdvFiche: d.fiche, rdvFicheUpdatedAt: new Date().toISOString() } : {}),
      };
      setSelectedMeeting(updated);
      return updated;
    },
    [setSelectedMeeting],
  );

  /** Fills an empty fiche from the transcription, client-side (keeps the fiche form in sync). */
  const generateFiche = useCallback(
    (m: Meeting, text: string) => {
      if (!ficheState?.generateWithAIFromTranscription || ficheFilled(m.rdvFiche) || !text.trim()) return;
      setFicheGen("generating");
      ficheState
        .generateWithAIFromTranscription(m, text, (next) => {
          setSelectedMeeting(next);
          setFicheGen("done");
        })
        .catch(() => setFicheGen("error"));
    },
    [ficheState, setSelectedMeeting],
  );

  const runLookup = useCallback(
    async (opts?: { quiet?: boolean; polls?: number }) => {
      if (!opts?.quiet) setLookup({ phase: "searching" });
      try {
        const res = await fetch(`/api/manager/rdv/${meeting.id}/enrich`, { method: "POST" });
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "Recherche impossible");
        const d = json.data as EnrichResponse;
        if (meetingRef.current.id !== meeting.id) return;
        if (d.found) {
          const updated = applyCallData(d);
          if (d.source) setKnownOrigin(d.source);
          setLookup({ phase: "found", source: d.source, window: d.window, attempts: d.attempts });
          if (d.ficheGenerated) setFicheGen("done");
          else if (d.callTranscription) generateFiche(updated, d.callTranscription);
          if (opts?.quiet) success("Appel arrivé", "L'enregistrement de l'appel est maintenant rattaché au RDV.");
        } else if (d.pending) {
          setKnownOrigin("twilio");
          setLookup({ phase: "pending", inProgress: d.pending.inProgress, polls: opts?.polls ?? 0 });
        } else if (d.error && !d.attempts) {
          setLookup({ phase: "error", message: d.error });
        } else {
          setLookup({ phase: "not_found", attempts: d.attempts });
        }
      } catch (e) {
        setLookup({ phase: "error", message: e instanceof Error ? e.message : "Recherche impossible" });
      }
    },
    [meeting.id, applyCallData, generateFiche, success],
  );

  // First open of an RDV without call data: look for it right away. (The dossier mounts
  // this tab with key={meeting.id}, so each RDV starts from a fresh state.)
  useEffect(() => {
    if (!hasCall) void runLookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Softphone call linked, audio on its way: keep asking until it lands.
  useEffect(() => {
    if (lookup.phase !== "pending" || lookup.polls >= PENDING_MAX_POLLS) return;
    const t = setTimeout(() => void runLookup({ quiet: true, polls: lookup.polls + 1 }), PENDING_POLL_MS);
    return () => clearTimeout(t);
  }, [lookup, runLookup]);

  // ── Manual link ──────────────────────────────────────────────────────────
  const linkCall = useCallback(
    async (call: CandidateCall) => {
      setLinking(true);
      try {
        const data = {
          callRecordingUrl: call.recordingUrl,
          callSummary: call.summary,
          callTranscription: call.transcription,
        };
        await updateMeeting(meeting.id, data);
        const updated = applyCallData(data);
        setKnownOrigin(call.source);
        setShowPicker(false);
        setLookup({ phase: "found", source: call.source });
        success("Appel lié", `L'appel ${ORIGIN_META[call.source].label} est rattaché au RDV.`);
        if (call.transcription) generateFiche(updated, call.transcription);
      } catch {
        showError("Erreur", "Impossible de lier l'appel au RDV.");
      } finally {
        setLinking(false);
      }
    },
    [meeting.id, updateMeeting, applyCallData, generateFiche, success, showError],
  );

  const detachCall = useCallback(async () => {
    if (!window.confirm("Détacher cet appel du RDV ? L'audio, le résumé et la transcription seront retirés (la fiche RDV est conservée).")) return;
    try {
      await updateMeeting(meeting.id, { callRecordingUrl: null, callSummary: null, callTranscription: null });
      setSelectedMeeting({ ...meetingRef.current, callRecordingUrl: null, callSummary: null, callTranscription: null });
      setKnownOrigin(null);
      setLookup({ phase: "idle" });
      setShowPicker(true);
    } catch {
      showError("Erreur", "Impossible de détacher l'appel.");
    }
  }, [meeting.id, updateMeeting, setSelectedMeeting, showError]);

  // ── Upload ───────────────────────────────────────────────────────────────
  const uploadFile = useCallback(
    async (file: File) => {
      if (!isAcceptedAudioFile(file.name, file.type)) {
        showError("Fichier invalide", `Formats acceptés : ${AUDIO_FORMATS_LABEL}.`);
        return;
      }
      if (file.size > MAX_AUDIO_SIZE) {
        showError("Fichier trop volumineux", `Taille maximale : ${MAX_AUDIO_SIZE_LABEL}.`);
        return;
      }
      setUploading(true);
      try {
        const body = new FormData();
        body.append("file", file);
        if (ficheFilled(meetingRef.current.rdvFiche)) body.append("skipFiche", "1");
        const res = await fetch(`/api/actions/${meeting.id}/upload-audio`, { method: "POST", body });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          showError("Échec de l'import", json?.error ?? "Impossible d'analyser le fichier audio.");
          return;
        }
        const d = json.data;
        if (d.storageError) showError("Stockage", d.storageError);
        applyCallData({ callRecordingUrl: d.callRecordingUrl, callTranscription: d.callTranscription, fiche: d.fiche });
        setKnownOrigin("upload");
        setShowPicker(false);
        setLookup({ phase: "found" });
        if (d.transcriptionError) showError("Transcription impossible", d.transcriptionError);
        else if (d.ficheError) {
          setFicheGen("error");
          showError("Fiche non générée", d.ficheError);
        } else if (d.fiche) {
          setFicheGen("done");
          success("Audio analysé", "Transcription faite et fiche RDV remplie.");
        } else success("Audio importé", "Enregistrement et transcription rattachés au RDV.");
      } catch {
        showError("Erreur réseau", "Impossible d'envoyer le fichier audio.");
      } finally {
        setUploading(false);
      }
    },
    [meeting.id, applyCallData, success, showError],
  );

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void uploadFile(f);
  };

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (!uploading) setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f && !uploading) void uploadFile(f);
    },
  };

  const chain = chainFrom(lookup);
  const showChain = Object.keys(chain).length > 0 && !showPicker;
  const contactLabel = [meeting.contact?.firstName, meeting.contact?.lastName].filter(Boolean).join(" ") || meeting.company?.name || "rdv";
  const downloadName = `appel-${contactLabel.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.mp3`;
  const filled = ficheFilled(meeting.rdvFiche);

  return (
    <div className="rdv-audio">
      <input ref={fileInputRef} type="file" accept={AUDIO_ACCEPT} onChange={onPickFile} hidden />

      {showChain && (
        <section aria-live="polite">
          <div className="rdv-audio-section-head">
            <span className="rdv-eyebrow">Recherche de l&apos;appel du RDV</span>
            {(lookup.phase === "not_found" || lookup.phase === "error") && (
              <button type="button" className="rdv-btn rdv-btn-ghost rdv-btn-sm" onClick={() => void runLookup()}>
                <RefreshCw size={12} /> Relancer
              </button>
            )}
          </div>
          <SourceChain steps={chain} />
        </section>
      )}

      {/* ── Call linked from the softphone, audio on its way ── */}
      {lookup.phase === "pending" && !hasCall && (
        <section className="rdv-call-hero" aria-live="polite">
          <div className="rdv-call-hero-head">
            <div>
              <div className="rdv-call-hero-title">{lookup.inProgress ? "Appel en cours" : "Enregistrement en traitement"}</div>
              <div className="rdv-call-hero-meta">
                <span className="rdv-origin" data-origin="twilio" data-on-dark="true">Twilio</span>
                <span>Rattaché au RDV automatiquement</span>
              </div>
            </div>
          </div>
          <div className="rdv-call-hero-note">
            {lookup.polls < PENDING_MAX_POLLS ? (
              <Loader2 size={16} className="rdv-spin" style={{ flexShrink: 0 }} />
            ) : (
              <Radio size={16} style={{ flexShrink: 0 }} />
            )}
            <span>
              {lookup.polls < PENDING_MAX_POLLS
                ? "L'audio, la transcription et la fiche RDV arrivent ici dès la fin de l'appel — inutile de recharger."
                : "L'enregistrement tarde à arriver. Relancez la recherche dans un instant."}
            </span>
          </div>
        </section>
      )}

      {/* ── The call of the RDV ── */}
      {hasCall && !showPicker && (
        <section className="rdv-call-hero" aria-label="Appel du RDV">
          <div className="rdv-call-hero-head">
            <div style={{ minWidth: 0 }}>
              <div className="rdv-call-hero-title">Appel de prise de RDV</div>
              <div className="rdv-call-hero-meta">
                {origin && (
                  <span className="rdv-origin" data-origin={origin} data-on-dark="true" title={ORIGIN_META[origin].hint}>
                    {ORIGIN_META[origin].label}
                  </span>
                )}
                {meeting.duration ? (
                  <span><Clock3 size={12} /> {formatDuration(meeting.duration)}</span>
                ) : null}
                <span>
                  <CalendarClock size={12} /> RDV pris le{" "}
                  {new Date(meeting.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                {meeting.sdr?.name && <span>par {meeting.sdr.name}</span>}
              </div>
            </div>
          </div>
          {recordingUrl ? (
            <CallPlayer
              key={recordingUrl}
              src={`/api/actions/${meeting.id}/recording?v=${encodeURIComponent(recordingUrl.slice(-24))}`}
              downloadName={downloadName}
            />
          ) : (
            <div className="rdv-call-hero-note">
              <AudioLines size={16} style={{ flexShrink: 0 }} />
              <span>Pas d&apos;enregistrement audio pour cet appel — le résumé et la transcription sont ci-dessous.</span>
            </div>
          )}
        </section>
      )}

      {/* ── Fiche: what the call produced ── */}
      {hasCall && !showPicker && (transcription || filled) && (
        <div
          className="rdv-fiche-strip"
          data-tone={ficheGen === "generating" ? "busy" : ficheGen === "error" ? "error" : filled ? "ok" : undefined}
          aria-live="polite"
        >
          {ficheGen === "generating" ? (
            <>
              <AiMark className="w-3.5 h-3.5" />
              <span>Rédaction de la fiche RDV depuis la conversation…</span>
              <Loader2 size={13} className="rdv-spin" />
            </>
          ) : filled ? (
            <>
              <FileText size={14} />
              <span>{ficheGen === "done" ? "Fiche RDV remplie automatiquement depuis l'appel." : "La fiche RDV est remplie."}</span>
              {onOpenFiche && (
                <button type="button" className="rdv-link-btn" onClick={onOpenFiche}>
                  Ouvrir la fiche <ArrowRight size={11} style={{ verticalAlign: -1 }} />
                </button>
              )}
            </>
          ) : (
            <>
              <AiMark className="w-3.5 h-3.5" />
              <span>{ficheGen === "error" ? "La fiche n'a pas pu être générée." : "La fiche RDV est vide."}</span>
              <button
                type="button"
                className="rdv-btn rdv-btn-ai rdv-btn-sm"
                onClick={() => generateFiche(meeting, transcription)}
                disabled={!ficheState?.generateWithAIFromTranscription}
              >
                Remplir depuis l&apos;appel
              </button>
            </>
          )}
        </div>
      )}

      {hasCall && !showPicker && summary && <CallSummaryCard summary={summary} />}
      {hasCall && !showPicker && transcription && <TranscriptCard transcription={transcription} />}

      {hasCall && !showPicker && (
        <div className="rdv-audio-actions">
          <button type="button" className="rdv-btn rdv-btn-ghost rdv-btn-sm" onClick={detachCall}>
            <Unlink size={12} /> Détacher
          </button>
          <button type="button" className="rdv-btn rdv-btn-ghost rdv-btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 size={12} className="rdv-spin" /> : <Upload size={12} />} Importer un audio
          </button>
          <button type="button" className="rdv-btn rdv-btn-ghost rdv-btn-sm" onClick={() => setShowPicker(true)}>
            <Link2 size={12} /> Changer d&apos;appel
          </button>
        </div>
      )}

      {/* ── No call: pick one, or drop the file ── */}
      {!hasCall && !showPicker && (lookup.phase === "not_found" || lookup.phase === "error" || lookup.phase === "idle") && (
        <div className="rdv-audio-empty" data-drag={dragOver} {...dropProps}>
          <div className="rdv-audio-empty-icon">
            {uploading ? <Loader2 size={20} className="rdv-spin" /> : <PhoneCall size={20} />}
          </div>
          <h4>
            {uploading
              ? "Analyse de l'audio…"
              : lookup.phase === "error"
                ? "La recherche automatique a échoué"
                : lookup.phase === "not_found"
                  ? "Appel introuvable automatiquement"
                  : "Aucun appel rattaché"}
          </h4>
          <p className="rdv-audio-muted" style={{ maxWidth: 360, margin: "0 auto" }}>
            {uploading
              ? "Transcription en français puis rédaction de la fiche RDV (jusqu'à une minute)."
              : lookup.phase === "error"
                ? lookup.message
                : "Choisissez l'appel dans la liste des appels du prospect, ou déposez le fichier audio ici."}
          </p>
          {!uploading && (
            <div className="rdv-audio-empty-actions">
              <button type="button" className="rdv-btn rdv-btn-primary" onClick={() => setShowPicker(true)}>
                <Search size={13} /> Choisir l&apos;appel
              </button>
              <button type="button" className="rdv-btn rdv-btn-ghost" onClick={() => fileInputRef.current?.click()}>
                <Upload size={13} /> Importer un fichier
              </button>
            </div>
          )}
          {!uploading && (
            <p className="rdv-audio-muted" style={{ marginTop: 10, fontSize: 10.5 }}>
              {AUDIO_FORMATS_LABEL} · {MAX_AUDIO_SIZE_LABEL} max
            </p>
          )}
        </div>
      )}

      {showPicker && (
        <CallPicker meetingId={meeting.id} linking={linking} onLink={linkCall} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
}
