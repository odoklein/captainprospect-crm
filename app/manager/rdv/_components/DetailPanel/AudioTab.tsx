"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  PhoneCall,
  Mic2,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Headphones,
  Wand2,
  Search,
  Phone,
  PhoneOff,
  Copy,
  Upload,
} from "lucide-react";
import type { Meeting } from "../../_types";
import type { UseFicheRdvReturn } from "../../_hooks/useFicheRdv";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";

interface AudioTabProps {
  meeting: Meeting;
  updateMeeting: (id: string, data: Record<string, unknown>) => Promise<void>;
  setSelectedMeeting: (meeting: Meeting) => void;
  ficheState?: UseFicheRdvReturn;
}

type AutoSearchStatus = "idle" | "searching" | "found" | "not_found" | "error";
type FicheGenStatus = "idle" | "generating" | "done" | "error";

// ─── Small helpers ──────────────────────────────────────────────────────────

function parisCalendarDayKey(d: Date): string {
  return d.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
}

function parisDayKeyNow(): string {
  return parisCalendarDayKey(new Date());
}

function parisDayKeyYesterday(): string {
  return new Date(Date.now() - 86400000).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
}

function formatParisDateTime(d: Date): string {
  return d.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelForParisDayKey(key: string): string {
  const t = parisDayKeyNow();
  const y = parisDayKeyYesterday();
  if (key === t) return "Aujourd'hui";
  if (key === y) return "Hier";
  if (key === "unknown") return "Date inconnue";
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return key;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function stripSpaces(s: string): string {
  return s.replace(/\s+/g, "");
}

type NormalizedCall = {
  id: string;
  displayFrom: string;
  displayTo: string;
  duration: number;
  direction: "INBOUND" | "OUTBOUND";
  outcome?: string;
  summaryText: string;
  transcriptPreview: string | null;
  startedAt: Date | null;
  parisDay: string | null;
  sources: string[];
};

function normalizeCall(raw: unknown): NormalizedCall | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r.id != null ? String(r.id) : "";
  if (!id) return null;
  const ts = r.start_time ?? r.start_date ?? r.created_at;
  let startedAt: Date | null = null;
  if (ts != null && ts !== "") {
    if (typeof ts === "number") startedAt = new Date(ts > 1e12 ? ts : ts * 1000);
    else startedAt = new Date(String(ts));
    if (Number.isNaN(startedAt.getTime())) startedAt = null;
  }
  const transcript = Array.isArray(r.transcript)
    ? (r.transcript as Array<{ source?: string; text?: string }>)
    : [];
  let transcriptPreview: string | null = null;
  if (transcript.length > 0) {
    transcriptPreview = transcript.map((e) => (typeof e.text === "string" ? e.text.trim() : "")).find(Boolean) ?? null;
  } else if (typeof r.transcription === "string" && r.transcription.trim()) {
    transcriptPreview = r.transcription.trim();
  }
  const dir = String(r.direction ?? r.type ?? "OUTBOUND").toUpperCase();
  const duration =
    typeof r.duration === "number"
      ? r.duration
      : typeof r.length_in_minutes === "number"
        ? Math.round(r.length_in_minutes * 60)
        : 0;
  const summaryRaw = typeof r.summary === "string" ? r.summary : typeof r.call_summary === "string" ? r.call_summary : "";
  return {
    id,
    displayFrom: String(r.from ?? r.from_number ?? ""),
    displayTo: String(r.to ?? r.to_number ?? ""),
    duration,
    direction: dir === "INBOUND" ? "INBOUND" : "OUTBOUND",
    outcome: typeof r.outcome === "string" ? r.outcome : undefined,
    summaryText: summaryRaw.trim(),
    transcriptPreview,
    startedAt,
    parisDay: startedAt ? parisCalendarDayKey(startedAt) : null,
    sources: Array.isArray(r._matchedSources) ? (r._matchedSources as string[]) : [],
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface StatusBannerProps {
  icon: React.ReactNode;
  colorClass: string;
  title: string;
  description?: string;
}

function StatusBanner({ icon, colorClass, title, description }: StatusBannerProps) {
  return (
    <div className={cn("flex items-start gap-3 px-4 py-3 rounded-2xl border", colorClass)}>
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div>
        <p className="text-xs font-bold">{title}</p>
        {description && <p className="text-[11px] mt-0.5 opacity-80 leading-snug">{description}</p>}
      </div>
    </div>
  );
}

interface InlineCallPickerProps {
  meetingId: string;
  phoneSources: Array<{ key: string; label: string; phone: string; rawPhone: string; callCount: number }>;
  allCalls: NormalizedCall[];
  loading: boolean;
  selectedId: string | null;
  onSelectId: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  dayFilter: "all" | "today" | "yesterday";
  onDayFilterChange: (v: "all" | "today" | "yesterday") => void;
  activeSource: string;
  onActiveSourceChange: (v: string) => void;
}

function InlineCallPicker({
  phoneSources,
  allCalls,
  loading,
  selectedId,
  onSelectId,
  search,
  onSearchChange,
  dayFilter,
  onDayFilterChange,
  activeSource,
  onActiveSourceChange,
}: InlineCallPickerProps) {
  const todayK = parisDayKeyNow();
  const yestK = parisDayKeyYesterday();

  const filtered = allCalls.filter((c) => {
    if (activeSource !== "all" && !c.sources.includes(activeSource)) return false;
    if (dayFilter === "today" && c.parisDay !== todayK) return false;
    if (dayFilter === "yesterday" && c.parisDay !== yestK) return false;
    if (!search) return true;
    const q = stripSpaces(search).toLowerCase();
    const blob = [c.displayFrom, c.displayTo, c.summaryText, c.outcome ?? "", c.transcriptPreview ?? ""].join(" ").toLowerCase();
    return blob.includes(q);
  });

  const groupedByDay = (() => {
    const map = new Map<string, NormalizedCall[]>();
    for (const c of filtered) {
      const key = c.parisDay ?? "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    const keys = [...map.keys()].filter((k) => k !== "unknown").sort((a, b) => b.localeCompare(a));
    const unknown = map.get("unknown");
    return { orderedKeys: unknown?.length ? [...keys, "unknown"] : keys, map };
  })();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        <span className="text-sm text-slate-500 font-medium">Chargement des appels Allo…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Phone source tabs */}
      {phoneSources.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onActiveSourceChange("all")}
            className={cn(
              "text-[11px] font-semibold rounded-full px-2.5 py-1 border transition-all",
              activeSource === "all"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/50",
            )}
          >
            Tous ({allCalls.length})
          </button>
          {phoneSources.map((s) => (
            <button
              key={s.key}
              onClick={() => onActiveSourceChange(s.key)}
              className={cn(
                "text-[11px] font-semibold rounded-full px-2.5 py-1 border transition-all",
                activeSource === s.key
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/50",
              )}
            >
              {s.label} · <span className="font-mono">{s.phone.startsWith("+33") ? "0" + s.phone.slice(3) : s.phone}</span>
              {s.callCount > 0 && <span className="ml-1 opacity-70">({s.callCount})</span>}
            </button>
          ))}
        </div>
      )}

      {/* Search + day filters */}
      {allCalls.length > 0 && (
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filtrer par heure, numéro, résumé…"
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
            />
          </div>
          <div className="flex gap-1.5">
            {(["all", "today", "yesterday"] as const).map((d) => (
              <button
                key={d}
                onClick={() => onDayFilterChange(d)}
                className={cn(
                  "text-[10px] font-semibold rounded-full px-2 py-0.5 border transition-all",
                  dayFilter === d
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300",
                )}
              >
                {d === "all" ? "Tous" : d === "today" ? "Aujourd'hui" : "Hier"}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-slate-400 self-center">
              {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      {/* Call list */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5 rdv-scrollbar">
        {allCalls.length === 0 ? (
          <div className="text-center py-10 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
            <PhoneOff className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">Aucun appel trouvé</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-snug">
              Aucun appel correspondant sur vos lignes Allo configurées.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 rounded-2xl border border-amber-100 bg-amber-50/40">
            <p className="text-sm font-medium text-amber-800">Aucun appel ne correspond aux filtres</p>
            <p className="text-xs text-amber-700/70 mt-1">Élargissez la recherche.</p>
          </div>
        ) : (
          groupedByDay.orderedKeys.map((dayKey) => {
            const dayCalls = groupedByDay.map.get(dayKey) ?? [];
            if (!dayCalls.length) return null;
            return (
              <div key={dayKey}>
                <div className="flex items-center gap-1.5 sticky top-0 z-[1] bg-white/95 backdrop-blur-sm py-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {labelForParisDayKey(dayKey)}
                  </span>
                  <span className="text-[10px] text-slate-300">·</span>
                  <span className="text-[10px] text-slate-400">{dayCalls.length}</span>
                </div>
                <div className="space-y-1.5">
                  {dayCalls.map((call) => {
                    const dMin = Math.floor(call.duration / 60);
                    const dSec = call.duration % 60;
                    const isSelected = call.id === selectedId;
                    return (
                      <button
                        key={call.id}
                        type="button"
                        onClick={() => onSelectId(call.id)}
                        className={cn(
                          "w-full text-left rounded-xl border transition-all",
                          isSelected
                            ? "border-indigo-500 bg-indigo-50/80 ring-2 ring-indigo-400/30 shadow-md"
                            : "border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm",
                        )}
                      >
                        <div className="p-2.5 flex gap-2">
                          <div
                            className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
                              call.direction === "OUTBOUND" ? "bg-indigo-100 text-indigo-600" : "bg-emerald-100 text-emerald-600",
                            )}
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                              <span className="text-[11px] font-bold text-slate-800">
                                {call.direction === "OUTBOUND" ? "Sortant" : "Entrant"}
                              </span>
                              {call.startedAt && (
                                <span className="text-[11px] text-slate-500">{formatParisDateTime(call.startedAt)}</span>
                              )}
                              {call.duration > 0 && (
                                <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {dMin > 0 ? `${dMin}m ` : ""}{dSec}s
                                </span>
                              )}
                              {call.outcome && (
                                <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60">
                                  {call.outcome}
                                </span>
                              )}
                              {call.sources.length > 0 && (
                                <span className="text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-violet-100 text-violet-700">
                                  {call.sources.join(" · ")}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                              <span>{call.displayFrom || "—"}</span>
                              <span className="text-slate-300">→</span>
                              <span>{call.displayTo || "—"}</span>
                            </div>
                            {call.summaryText && (
                              <p className="text-[10px] text-slate-600 leading-snug line-clamp-1 bg-slate-50 rounded px-1.5 py-1">
                                {call.summaryText}
                              </p>
                            )}
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0 self-start mt-0.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Main AudioTab ───────────────────────────────────────────────────────────

export function AudioTab({ meeting, updateMeeting, setSelectedMeeting, ficheState }: AudioTabProps) {
  const hasRecording = !!meeting.callRecordingUrl?.trim();
  const hasTranscription = !!meeting.callTranscription?.trim();
  const hasSummary = !!meeting.callSummary?.trim();
  const transcription = meeting.callTranscription?.trim() ?? "";
  const summary = meeting.callSummary?.trim() ?? "";

  const { success, error: showError } = useToast();

  const [autoSearchStatus, setAutoSearchStatus] = useState<AutoSearchStatus>(
    hasRecording || hasTranscription ? "found" : "idle",
  );
  const [ficheGenStatus, setFicheGenStatus] = useState<FicheGenStatus>("idle");
  const [transcriptionExpanded, setTranscriptionExpanded] = useState(false);
  const [showManualSearch, setShowManualSearch] = useState(false);

  // Manual search state
  const [manualLoading, setManualLoading] = useState(false);
  const [manualCalls, setManualCalls] = useState<NormalizedCall[]>([]);
  const [rawCallsMap, setRawCallsMap] = useState<Map<string, Record<string, unknown>>>(new Map());
  const [phoneSources, setPhoneSources] = useState<Array<{ key: string; label: string; phone: string; rawPhone: string; callCount: number }>>([]);
  const [alloLineCount, setAlloLineCount] = useState<number | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [manualSearch, setManualSearch] = useState("");
  const [manualDayFilter, setManualDayFilter] = useState<"all" | "today" | "yesterday">("all");
  const [activeSource, setActiveSource] = useState<string>("all");

  // Manual audio upload state
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const autoSearchTriggeredRef = useRef(false);

  // Auto-search on mount when no audio
  useEffect(() => {
    if (autoSearchTriggeredRef.current) return;
    if (hasRecording || hasTranscription) {
      setAutoSearchStatus("found");
      return;
    }
    autoSearchTriggeredRef.current = true;
    setAutoSearchStatus("searching");

    fetch(`/api/manager/rdv/${meeting.id}/enrich`, { method: "POST" })
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) { setAutoSearchStatus("error"); return; }
        const d = json.data;
        if (d?.found) {
          setAutoSearchStatus("found");
          const updated: Meeting = {
            ...meeting,
            callSummary: d.callSummary ?? meeting.callSummary,
            callTranscription: d.callTranscription ?? meeting.callTranscription,
            callRecordingUrl: d.callRecordingUrl ?? meeting.callRecordingUrl,
          };
          setSelectedMeeting(updated);

          if (d.ficheGenerated) {
            setFicheGenStatus("done");
          } else if (d.callTranscription && ficheState?.generateWithAIFromTranscription) {
            setFicheGenStatus("generating");
            ficheState
              .generateWithAIFromTranscription(updated, d.callTranscription, (m) => {
                setSelectedMeeting(m);
                setFicheGenStatus("done");
              })
              .catch(() => setFicheGenStatus("error"));
          }
        } else {
          setAutoSearchStatus("not_found");
        }
      })
      .catch(() => setAutoSearchStatus("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id]);

  // Open manual search panel
  const openManualSearch = useCallback(async () => {
    setShowManualSearch(true);
    if (manualCalls.length > 0) return; // already loaded
    setManualLoading(true);
    setManualCalls([]);
    setPhoneSources([]);
    setSelectedCallId(null);
    try {
      const res = await fetch(`/api/manager/rdv/${meeting.id}/calls`);
      const json = await res.json();
      if (json.success) {
        const rawList: Record<string, unknown>[] = json.data.calls ?? [];
        const normalized = rawList.map(normalizeCall).filter((c): c is NormalizedCall => c !== null);
        const rMap = new Map<string, Record<string, unknown>>();
        for (const raw of rawList) {
          const cid = raw.id != null ? String(raw.id) : "";
          if (cid) rMap.set(cid, raw);
        }
        setManualCalls(normalized);
        setRawCallsMap(rMap);
        setPhoneSources(json.data.phoneSources ?? []);
        setAlloLineCount(json.data.alloLineCount ?? null);
      } else {
        showError("Erreur Allo", json.error ?? "Impossible de charger les appels.");
        setShowManualSearch(false);
      }
    } catch {
      showError("Erreur réseau", "Impossible de contacter Allo.");
      setShowManualSearch(false);
    } finally {
      setManualLoading(false);
    }
  }, [meeting.id, manualCalls.length, showError]);

  const refreshManualSearch = useCallback(async () => {
    setManualLoading(true);
    setManualCalls([]);
    setRawCallsMap(new Map());
    setSelectedCallId(null);
    try {
      const res = await fetch(`/api/manager/rdv/${meeting.id}/calls`);
      const json = await res.json();
      if (json.success) {
        const rawList: Record<string, unknown>[] = json.data.calls ?? [];
        const normalized = rawList.map(normalizeCall).filter((c): c is NormalizedCall => c !== null);
        const rMap = new Map<string, Record<string, unknown>>();
        for (const raw of rawList) {
          const cid = raw.id != null ? String(raw.id) : "";
          if (cid) rMap.set(cid, raw);
        }
        setManualCalls(normalized);
        setRawCallsMap(rMap);
        setPhoneSources(json.data.phoneSources ?? []);
        setAlloLineCount(json.data.alloLineCount ?? null);
      } else {
        showError("Erreur Allo", json.error ?? "Erreur lors du rechargement.");
      }
    } catch {
      showError("Erreur réseau", "Impossible de contacter Allo.");
    } finally {
      setManualLoading(false);
    }
  }, [meeting.id, showError]);

  // Confirm selected call
  const linkSelectedCall = useCallback(async () => {
    if (!selectedCallId) return;
    const fullRaw = rawCallsMap.get(selectedCallId);
    if (!fullRaw) return;

    let recordingUrl: string | null = null;
    let summary: string | null = null;
    let transcription: string | null = null;

    recordingUrl = typeof fullRaw.recording_url === "string" && fullRaw.recording_url ? fullRaw.recording_url : null;
    summary = typeof fullRaw.summary === "string" && fullRaw.summary ? fullRaw.summary : typeof fullRaw.call_summary === "string" ? fullRaw.call_summary as string : null;
    if (Array.isArray(fullRaw.transcript) && fullRaw.transcript.length > 0) {
      transcription = (fullRaw.transcript as Array<{ source?: string; text?: string }>)
        .map((e) => `${e.source ?? "?"}: ${e.text ?? ""}`)
        .join("\n");
    } else if (typeof fullRaw.transcription === "string" && fullRaw.transcription) {
      transcription = fullRaw.transcription;
    }

    setLinking(true);
    try {
      await updateMeeting(meeting.id, { callRecordingUrl: recordingUrl, callSummary: summary, callTranscription: transcription });
      const updated: Meeting = {
        ...meeting,
        callRecordingUrl: recordingUrl ?? undefined,
        callSummary: summary ?? undefined,
        callTranscription: transcription ?? undefined,
      };
      setSelectedMeeting(updated);
      setShowManualSearch(false);
      setAutoSearchStatus("found");
      success("Audio lié", "L'appel a été lié au RDV avec succès.");

      // Auto-generate fiche from transcription
      if (transcription && ficheState?.generateWithAIFromTranscription) {
        setFicheGenStatus("generating");
        ficheState
          .generateWithAIFromTranscription(updated, transcription, (m) => {
            setSelectedMeeting(m);
            setFicheGenStatus("done");
          })
          .catch(() => setFicheGenStatus("error"));
      }
    } catch {
      showError("Erreur", "Impossible de lier l'appel au RDV.");
    } finally {
      setLinking(false);
    }
  }, [rawCallsMap, selectedCallId, meeting, updateMeeting, setSelectedMeeting, success, showError, ficheState]);

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-selecting the same file later
      if (!file) return;

      if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
        showError("Fichier invalide", "Veuillez sélectionner un fichier audio ou vidéo.");
        return;
      }
      
      const MAX_SIZE = 100 * 1024 * 1024; // 100 MB max for video uploads
      if (file.size > MAX_SIZE) {
        showError("Fichier trop volumineux", "La taille maximale autorisée est de 100 Mo.");
        return;
      }

      setUploading(true);
      let uploadFile = file;

      try {
        if (file.type.startsWith("video/") || file.size > 25 * 1024 * 1024) {
          // Dynamic import of FFmpeg to avoid SSR issues and keep initial bundle small
          const { FFmpeg } = await import('@ffmpeg/ffmpeg');
          const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
          
          const ffmpeg = new FFmpeg();
          ffmpeg.on('log', ({ message }) => console.log('[FFmpeg]', message));
          
          // Use toBlobURL to bypass Web Worker CORS issues with external CDNs
          const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
          await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
          });
          
          // Sanitize file name to avoid issues with spaces or special chars in ffmpeg args
          const safeName = `input.${file.name.split('.').pop() || 'mp4'}`;
          await ffmpeg.writeFile(safeName, await fetchFile(file));
          
          // Extract audio: remove video (-vn), force mp3 encoder (-acodec libmp3lame) at 128k
          const ret = await ffmpeg.exec(['-i', safeName, '-vn', '-acodec', 'libmp3lame', '-b:a', '128k', 'output.mp3']);
          if (ret !== 0) {
            throw new Error(`FFmpeg a échoué avec le code ${ret}. L'extraction audio n'a pas pu aboutir.`);
          }
          
          const audioData = await ffmpeg.readFile('output.mp3');
          if ((audioData as Uint8Array).length === 0) {
            throw new Error("Le fichier audio extrait est vide.");
          }

          uploadFile = new File([audioData], file.name.replace(/\.[^/.]+$/, "") + ".mp3", {
            type: "audio/mp3",
          });
        }

        const body = new FormData();
        body.append("file", uploadFile);
        const res = await fetch(`/api/actions/${meeting.id}/upload-audio`, {
          method: "POST",
          body,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          showError("Échec de l'upload", json?.error ?? "Impossible d'uploader le fichier audio.");
          return;
        }

        const d = json.data;
        const updated: Meeting = {
          ...meeting,
          callRecordingUrl: d.callRecordingUrl ?? meeting.callRecordingUrl,
        };
        setSelectedMeeting(updated);
        
        if (d.processingInBackground) {
          success("Upload réussi", "L'audio est en cours de traitement en arrière-plan.");
          setFicheGenStatus("generating");
          setAutoSearchStatus("found");
          setShowManualSearch(false);
        }

      } catch (err) {
        console.error(err);
        showError("Erreur", "Impossible de traiter ou d'envoyer le fichier audio.");
      } finally {
        setUploading(false);
      }
    },
    [meeting, setSelectedMeeting, success, showError],
  );

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      success("Copié", "Numéro copié dans le presse-papiers.");
    } catch {
      showError("Copie", "Impossible de copier.");
    }
  }, [success, showError]);

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*, video/*"
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* ─── Status banners ─── */}
      {uploading && (
        <StatusBanner
          icon={<Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
          colorClass="bg-blue-50 border-blue-100 text-blue-700"
          title="Analyse du fichier audio en cours…"
          description="Transcription en français puis génération de la fiche RDV (jusqu'à une minute)."
        />
      )}
      {autoSearchStatus === "searching" && (
        <StatusBanner
          icon={<Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
          colorClass="bg-blue-50 border-blue-100 text-blue-700"
          title="Recherche automatique en cours…"
          description="Recherche de l'enregistrement d'appel correspondant à ce RDV via Allo."
        />
      )}
      {autoSearchStatus === "found" && (hasRecording || hasTranscription) && (
        <StatusBanner
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          colorClass="bg-emerald-50 border-emerald-100 text-emerald-700"
          title="Audio trouvé et lié"
          description={ficheGenStatus === "done" ? "Fiche RDV générée automatiquement depuis la transcription." : "Enregistrement disponible ci-dessous."}
        />
      )}
      {autoSearchStatus === "not_found" && !showManualSearch && (
        <StatusBanner
          icon={<XCircle className="w-4 h-4 text-amber-600" />}
          colorClass="bg-amber-50 border-amber-100 text-amber-700"
          title="Aucun audio trouvé automatiquement"
          description="Vous pouvez lier un enregistrement manuellement via le bouton ci-dessous."
        />
      )}
      {autoSearchStatus === "error" && !showManualSearch && (
        <StatusBanner
          icon={<XCircle className="w-4 h-4 text-red-500" />}
          colorClass="bg-red-50 border-red-100 text-red-700"
          title="Erreur lors de la recherche automatique"
          description="Vérifiez la configuration Allo ou relancez manuellement."
        />
      )}

      {/* ─── Fiche generation status ─── */}
      {ficheGenStatus === "generating" && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-100 text-violet-700 text-xs font-medium">
          <Wand2 className="w-3.5 h-3.5 animate-pulse" />
          Génération de la fiche RDV depuis la transcription…
        </div>
      )}
      {ficheGenStatus === "done" && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Fiche RDV générée automatiquement · Consultez l&apos;onglet <strong className="ml-0.5">Fiche RDV</strong>
        </div>
      )}

      {/* ─── Audio player ─── */}
      {hasRecording && (
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <Headphones className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">Enregistrement</p>
              <p className="text-[10px] text-slate-500">Appel lié via Allo</p>
            </div>
          </div>
          <div className="p-4">
            <audio controls src={`/api/actions/${meeting.id}/recording`} className="w-full rounded-lg" style={{ height: 40 }} />
          </div>
        </div>
      )}

      {/* ─── Summary ─── */}
      {hasSummary && (
        <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/50 to-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-amber-100/60">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-xs font-bold text-slate-800">Résumé Allo</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-sm text-slate-700 leading-relaxed">{summary}</p>
          </div>
        </div>
      )}

      {/* ─── Transcription (collapsible) ─── */}
      {hasTranscription && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <button
            onClick={() => setTranscriptionExpanded(!transcriptionExpanded)}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Mic2 className="w-4 h-4 text-slate-500" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-xs font-bold text-slate-800">Transcription</p>
              <p className="text-[10px] text-slate-500">{transcription.length.toLocaleString("fr-FR")} caractères</p>
            </div>
            {transcriptionExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {transcriptionExpanded && (
            <div className="px-4 py-3 max-h-72 overflow-y-auto rdv-scrollbar">
              <pre className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">{transcription}</pre>
            </div>
          )}
        </div>
      )}

      {/* ─── Empty state / manual search trigger ─── */}
      {!hasRecording && !hasTranscription && autoSearchStatus !== "searching" && !showManualSearch && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <PhoneCall className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-1">Aucun audio disponible</p>
          <p className="text-xs text-slate-500 mb-5 max-w-xs mx-auto leading-snug">
            {autoSearchStatus === "not_found"
              ? "La recherche automatique n'a pas trouvé d'appel correspondant sur vos lignes Allo."
              : "Liez manuellement un enregistrement Allo à ce RDV."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={openManualSearch}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm shadow-indigo-200/60"
            >
              <Search className="w-4 h-4" />
              Rechercher l&apos;audio manuellement
            </button>
            <button
              onClick={triggerFileSelect}
              disabled={uploading}
              className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors border border-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? "Analyse en cours…" : "Uploader un fichier audio"}
            </button>
          </div>
        </div>
      )}

      {/* ─── Change audio buttons ─── */}
      {(hasRecording || hasTranscription) && !showManualSearch && (
        <div className="flex justify-end gap-2">
          <button
            onClick={triggerFileSelect}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition-colors bg-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            Uploader un audio
          </button>
          <button
            onClick={openManualSearch}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition-colors bg-white"
          >
            <RefreshCw className="w-3 h-3" />
            Changer l&apos;audio
          </button>
        </div>
      )}

      {/* ─── Manual search panel ─── */}
      {showManualSearch && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-bold text-slate-700">Recherche manuelle d&apos;un appel Allo</span>
              {alloLineCount != null && alloLineCount > 0 && (
                <span className="text-[10px] text-slate-400">
                  · {alloLineCount} ligne{alloLineCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={refreshManualSearch}
                disabled={manualLoading}
                className="text-[10px] text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg px-2 py-1 transition-colors flex items-center gap-1"
              >
                <RefreshCw className={cn("w-3 h-3", manualLoading && "animate-spin")} />
                Actualiser
              </button>
              <button
                onClick={() => setShowManualSearch(false)}
                className="text-[10px] text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg px-2 py-1 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>

          {/* Phone sources info */}
          {!manualLoading && phoneSources.length > 0 && (
            <div className="px-4 py-2.5 border-b border-slate-100 bg-indigo-50/40">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1.5">Numéros recherchés</p>
              <div className="flex flex-wrap gap-2">
                {phoneSources.map((s) => (
                  <div key={s.key} className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-slate-600">{s.label} :</span>
                    <span className="font-mono text-[10px] font-bold text-slate-800">
                      {s.phone.startsWith("+33") ? "0" + s.phone.slice(3) : s.phone}
                    </span>
                    <button
                      onClick={() => copyToClipboard(s.phone)}
                      className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                    <span className="text-[9px] text-slate-400">({s.callCount} appels)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Call picker */}
          <div className="p-4">
            <InlineCallPicker
              meetingId={meeting.id}
              phoneSources={phoneSources}
              allCalls={manualCalls}
              loading={manualLoading}
              selectedId={selectedCallId}
              onSelectId={setSelectedCallId}
              search={manualSearch}
              onSearchChange={setManualSearch}
              dayFilter={manualDayFilter}
              onDayFilterChange={setManualDayFilter}
              activeSource={activeSource}
              onActiveSourceChange={setActiveSource}
            />
          </div>

          {/* Footer actions */}
          {!manualLoading && manualCalls.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/30">
              <p className="text-[10px] text-slate-400">
                La sélection est enregistrée avec ce RDV pour traçabilité.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowManualSearch(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={linkSelectedCall}
                  disabled={!selectedCallId || linking}
                  className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors",
                    selectedCallId && !linking
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed",
                  )}
                >
                  {linking ? <Loader2 className="w-3 h-3 animate-spin" /> : <PhoneCall className="w-3 h-3" />}
                  {linking ? "Liaison…" : "Valider ce choix"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
