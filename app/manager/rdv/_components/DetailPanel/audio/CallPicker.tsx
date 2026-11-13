"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  CalendarClock,
  FileText,
  Link2,
  Loader2,
  MessagesSquare,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  ORIGIN_META,
  SOURCE_ORDER,
  formatCallDate,
  formatDuration,
  formatPhone,
  hoursFrom,
  type CallSourceKey,
  type CandidateCall,
  type PhoneSourceInfo,
  type SourceListStatus,
} from "./call-model";

/** A call this close to the moment the RDV was logged is almost certainly the booking call. */
const NEAR_BOOKING_HOURS = 36;

interface PickerData {
  calls: CandidateCall[];
  phoneSources: PhoneSourceInfo[];
  sources: SourceListStatus[];
  rdvCreatedAt: string | null;
}

function hasContent(c: CandidateCall): boolean {
  return Boolean(c.recordingUrl || c.transcription || c.summary);
}

/** The call to preselect: the one already linked, else the closest call with content to the booking. */
function suggestedCall(calls: CandidateCall[], rdvCreatedAt: string | null): CandidateCall | null {
  const linked = calls.find((c) => c.linkedToRdv && hasContent(c));
  if (linked) return linked;
  let best: { call: CandidateCall; h: number } | null = null;
  for (const c of calls) {
    if (!hasContent(c) || c.inProgress) continue;
    const h = hoursFrom(c.startedAt, rdvCreatedAt);
    if (h == null || h > NEAR_BOOKING_HOURS) continue;
    if (!best || h < best.h) best = { call: c, h };
  }
  return best?.call ?? null;
}

function dayKey(iso: string | null): string {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
}

function dayLabel(key: string): string {
  if (key === "unknown") return "Date inconnue";
  const today = new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
  if (key === today) return "Aujourd'hui";
  if (key === yesterday) return "Hier";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

const CALL_STATUS_FR: Record<string, string> = {
  COMPLETED: "terminé",
  ANSWERED: "décroché",
  NO_ANSWER: "sans réponse",
  MISSED: "manqué",
  BUSY: "occupé",
  FAILED: "échec",
  CANCELED: "annulé",
  CANCELLED: "annulé",
  VOICEMAIL: "messagerie",
  IN_PROGRESS: "en cours",
  RINGING: "sonnerie",
  INITIATED: "initié",
};

function callStatusLabel(status: string | null): string | null {
  if (!status) return null;
  return CALL_STATUS_FR[status.toUpperCase()] ?? status.toLowerCase().replace(/_/g, " ");
}

function sourceChipLabel(s: SourceListStatus): string {
  if (s.status === "not_asked") return "non interrogé";
  if (s.status === "skipped") return s.reason ?? "non configuré";
  if (s.status === "error") return "indisponible";
  return String(s.count);
}

export function CallPicker({
  meetingId,
  linking,
  onLink,
  onClose,
}: {
  meetingId: string;
  linking: boolean;
  onLink: (call: CandidateCall) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<PickerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAllo, setLoadingAllo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<CallSourceKey | "all">("all");
  const [phoneFilter, setPhoneFilter] = useState<string>("all");
  const [nearOnly, setNearOnly] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(
    async (withAllo: boolean) => {
      if (withAllo) setLoadingAllo(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/manager/rdv/${meetingId}/calls${withAllo ? "?allo=1" : ""}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "Chargement impossible");
        const d = json.data as PickerData;
        setData(d);
        const suggestion = suggestedCall(d.calls, d.rdvCreatedAt);
        setSelectedId((cur) => (cur && d.calls.some((c) => c.id === cur) ? cur : suggestion?.id ?? null));
        if (!withAllo) {
          const near = d.calls.some((c) => (hoursFrom(c.startedAt, d.rdvCreatedAt) ?? Infinity) <= NEAR_BOOKING_HOURS);
          setNearOnly(near && d.calls.length > 4);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chargement impossible");
      } finally {
        setLoading(false);
        setLoadingAllo(false);
      }
    },
    [meetingId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const suggestion = useMemo(() => (data ? suggestedCall(data.calls, data.rdvCreatedAt) : null), [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase().replace(/\s+/g, "");
    return data.calls.filter((c) => {
      if (sourceFilter !== "all" && c.source !== sourceFilter) return false;
      if (phoneFilter !== "all" && !c.matchedPhones.includes(phoneFilter)) return false;
      if (nearOnly && (hoursFrom(c.startedAt, data.rdvCreatedAt) ?? Infinity) > NEAR_BOOKING_HOURS && !c.linkedToRdv) return false;
      if (!q) return true;
      const blob = [c.from, c.to, c.summary ?? "", c.transcription?.slice(0, 2000) ?? "", c.status ?? ""].join(" ").toLowerCase();
      return blob.replace(/\s+/g, "").includes(q) || blob.includes(query.trim().toLowerCase());
    });
  }, [data, sourceFilter, phoneFilter, nearOnly, query]);

  const groups = useMemo(() => {
    const map = new Map<string, CandidateCall[]>();
    for (const c of filtered) {
      const k = dayKey(c.startedAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return [...map.entries()];
  }, [filtered]);

  const selected = data?.calls.find((c) => c.id === selectedId) ?? null;

  return (
    <section className="rdv-picker" aria-label="Choisir l'appel du RDV">
      <div className="rdv-picker-head">
        <div className="rdv-audio-section-head" style={{ marginBottom: 0 }}>
          <span className="rdv-audio-section-title">
            <Link2 size={14} /> Choisir l&apos;appel de ce RDV
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" className="rdv-icon-btn" onClick={() => load(false)} disabled={loading} title="Actualiser" aria-label="Actualiser la liste">
              <RefreshCw size={13} className={loading ? "rdv-spin" : undefined} />
            </button>
            <button type="button" className="rdv-icon-btn" onClick={onClose} title="Fermer" aria-label="Fermer">
              <X size={13} />
            </button>
          </div>
        </div>
        <p className="rdv-audio-muted" style={{ margin: "4px 0 0" }}>
          Appels des 90 derniers jours sur les numéros du contact, de la société et du RDV.
        </p>
        {data && (
          <div className="rdv-picker-sources" role="group" aria-label="Filtrer par source">
            <button type="button" className="rdv-picker-source" aria-pressed={sourceFilter === "all"} onClick={() => setSourceFilter("all")}>
              Toutes <span className="rdv-picker-source-count">{data.calls.length}</span>
            </button>
            {SOURCE_ORDER.map((source) => {
              const s = data.sources.find((x) => x.source === source)!;
              // Allo is read on demand (slow, rate-limited): its chip is the button that asks it.
              const askable = source === "allo" && (s.status === "not_asked" || s.status === "error");
              if (askable) {
                return (
                  <button
                    key={source}
                    type="button"
                    className="rdv-picker-source"
                    data-ask="true"
                    onClick={() => load(true)}
                    disabled={loadingAllo}
                    title="Lire les appels Allo de ce prospect (7 jours avant la prise du RDV)"
                  >
                    {loadingAllo ? <Loader2 size={11} className="rdv-spin" /> : <Search size={11} />}
                    {s.status === "error" ? "Réessayer Allo" : "Chercher dans Allo"}
                  </button>
                );
              }
              return (
                <button
                  key={source}
                  type="button"
                  className="rdv-picker-source"
                  aria-pressed={sourceFilter === source}
                  disabled={s.status !== "ok"}
                  onClick={() => setSourceFilter(source)}
                  title={s.reason ?? ORIGIN_META[source].hint}
                >
                  <span className="rdv-origin" data-origin={source} style={{ padding: 0, background: "transparent" }} />
                  {ORIGIN_META[source].label}
                  <span className="rdv-picker-source-count">{sourceChipLabel(s)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {data && data.calls.length > 0 && (
        <div className="rdv-picker-filters">
          <label className="rdv-transcript-search">
            <Search size={13} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Numéro, mot du résumé…"
              aria-label="Filtrer les appels"
            />
          </label>
          {data.rdvCreatedAt && (
            <button
              type="button"
              className="rdv-picker-toggle"
              aria-pressed={nearOnly}
              onClick={() => setNearOnly((v) => !v)}
              title="Appels passés à ±36 h de la prise du RDV"
            >
              <CalendarClock size={12} /> Autour de la prise du RDV
            </button>
          )}
          {data.phoneSources.length > 1 && (
            <select
              className="rdv-picker-toggle"
              value={phoneFilter}
              onChange={(e) => setPhoneFilter(e.target.value)}
              aria-label="Filtrer par numéro"
            >
              <option value="all">Tous les numéros</option>
              {data.phoneSources.map((p) => (
                <option key={`${p.key}-${p.phone}`} value={p.key}>
                  {p.label} · {formatPhone(p.phone)} ({p.callCount})
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="rdv-picker-list rdv-scrollbar" role="radiogroup" aria-label="Appels candidats">
        {loading ? (
          <div className="rdv-picker-empty">
            <Loader2 size={20} className="rdv-spin" style={{ color: "var(--accent)" }} />
            <p className="rdv-audio-muted" style={{ marginTop: 8 }}>Lecture de Call Vault et de Twilio…</p>
          </div>
        ) : error ? (
          <div className="rdv-picker-empty">
            <p className="rdv-alert" style={{ display: "inline-block" }}>{error}</p>
          </div>
        ) : !data || data.calls.length === 0 ? (
          <div className="rdv-picker-empty">
            <PhoneOff size={22} style={{ color: "var(--ink4)" }} />
            <h4 style={{ margin: "8px 0 4px", fontSize: 13, color: "var(--ink)" }}>Aucun appel trouvé</h4>
            <p className="rdv-audio-muted">
              Aucune source n&apos;a d&apos;appel avec les numéros de ce prospect. Vérifiez le numéro du contact, ou importez le fichier audio.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rdv-picker-empty">
            <p className="rdv-audio-muted">Aucun appel ne correspond aux filtres.</p>
            <button
              type="button"
              className="rdv-btn rdv-btn-ghost rdv-btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => {
                setNearOnly(false);
                setQuery("");
                setSourceFilter("all");
                setPhoneFilter("all");
              }}
            >
              Effacer les filtres
            </button>
          </div>
        ) : (
          groups.map(([key, calls]) => (
            <div key={key} style={{ display: "contents" }}>
              <div className="rdv-picker-day">{dayLabel(key)}</div>
              {calls.map((c) => {
                const isSelected = c.id === selectedId;
                const near = (hoursFrom(c.startedAt, data.rdvCreatedAt) ?? Infinity) <= NEAR_BOOKING_HOURS;
                const remote = c.direction === "OUTBOUND" ? c.to : c.from;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className="rdv-call-row"
                    onClick={() => setSelectedId(c.id)}
                    onDoubleClick={() => hasContent(c) && onLink(c)}
                  >
                    <span className="rdv-call-row-dir" aria-hidden="true">
                      {c.direction === "OUTBOUND" ? <PhoneOutgoing size={14} /> : <PhoneIncoming size={14} />}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="rdv-call-row-title">
                        {formatCallDate(c.startedAt)}
                        <span className="rdv-origin" data-origin={c.source}>{ORIGIN_META[c.source].label}</span>
                        {c.linkedToRdv && <span className="rdv-flag" data-tone="green">Rattaché au RDV</span>}
                        {suggestion?.id === c.id && !c.linkedToRdv && <span className="rdv-flag" data-tone="blue">Suggéré</span>}
                        {near && !c.linkedToRdv && suggestion?.id !== c.id && <span className="rdv-flag">Prise du RDV</span>}
                        {c.inProgress && <span className="rdv-flag" data-tone="rose">En cours</span>}
                      </span>
                      <span className="rdv-call-row-sub">
                        <span>{c.direction === "OUTBOUND" ? "Sortant" : "Entrant"} · {formatPhone(remote)}</span>
                        {c.durationSec > 0 && <span>{formatDuration(c.durationSec)}</span>}
                        {callStatusLabel(c.status) && <span>{callStatusLabel(c.status)}</span>}
                      </span>
                      {c.summary && <span className="rdv-call-row-summary">{c.summary}</span>}
                      {!c.summary && c.transcription && (
                        <span className="rdv-call-row-summary" style={{ fontStyle: "italic" }}>« {c.transcription.slice(0, 280)} »</span>
                      )}
                    </span>
                    <span className="rdv-call-row-assets" aria-label="Contenu disponible">
                      <span data-on={!!c.recordingUrl} title={c.recordingUrl ? "Enregistrement" : "Pas d'enregistrement"}><AudioLines size={13} /></span>
                      <span data-on={!!c.transcription} title={c.transcription ? "Transcription" : "Pas de transcription"}><MessagesSquare size={13} /></span>
                      <span data-on={!!c.summary} title={c.summary ? "Résumé" : "Pas de résumé"}><FileText size={13} /></span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {data && data.calls.length > 0 && (
        <div className="rdv-picker-foot">
          <span className="rdv-audio-muted">
            {selected
              ? hasContent(selected)
                ? selected.transcription
                  ? <><Sparkles size={11} style={{ verticalAlign: -1 }} /> La fiche RDV sera remplie depuis cet appel si elle est vide.</>
                  : "Cet appel n'a pas de transcription : la fiche ne pourra pas être générée."
                : "Cet appel n'a ni audio, ni transcription, ni résumé."
              : "Sélectionnez l'appel où le RDV a été pris."}
          </span>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button type="button" className="rdv-btn rdv-btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button
              type="button"
              className="rdv-btn rdv-btn-primary"
              disabled={!selected || !hasContent(selected) || linking}
              onClick={() => selected && onLink(selected)}
            >
              {linking ? <Loader2 size={13} className="rdv-spin" /> : <Link2 size={13} />}
              {linking ? "Liaison…" : "Lier cet appel"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
