"use client";

import { useMemo, useState } from "react";
import type { Meeting } from "../../_types";
import { Modal } from "@/components/ui";
import { ORIGIN_META, type CallSourceKey, type SourceAttempt } from "../DetailPanel/audio/call-model";
import "../DetailPanel/audio/audio.css";
import { Loader2, Mic, RefreshCw } from "lucide-react";

interface SyncRdvAudiosModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetings: Meeting[];
  selectedIds: Set<string>;
  onSynced: () => Promise<void> | void;
}

type ScopeMode = "selected" | "visible";

interface PreviewItem {
  actionId: string;
  contactName: string;
  companyName: string;
  phonesTried: string[];
  existing: {
    hasSummary: boolean;
    hasTranscription: boolean;
    hasRecording: boolean;
  };
  match: {
    source: CallSourceKey;
    windowLabel: string;
    hasSummary: boolean;
    hasTranscription: boolean;
    hasRecording: boolean;
    syncPayload: {
      summary: string | null;
      transcription: string | null;
      recordingUrl: string | null;
    };
  } | null;
  searchWays: string[];
  sourceAttempts: SourceAttempt[];
}

const ATTEMPT_LABEL: Record<SourceAttempt["status"], string> = {
  found: "trouvé",
  empty: "aucun appel",
  skipped: "non interrogé",
  error: "indisponible",
};

function attemptsText(attempts: SourceAttempt[]): string {
  return attempts
    .map((a) => `${ORIGIN_META[a.source].label} : ${a.status === "skipped" && a.reason ? a.reason.toLowerCase() : ATTEMPT_LABEL[a.status]}`)
    .join(" → ");
}

export function SyncRdvAudiosModal({
  isOpen,
  onClose,
  meetings,
  selectedIds,
  onSynced,
}: SyncRdvAudiosModalProps) {
  const [scope, setScope] = useState<ScopeMode>("selected");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [selectedToSync, setSelectedToSync] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("");

  const selectedActionIds = useMemo(
    () => meetings.filter((m) => selectedIds.has(m.id)).map((m) => m.id),
    [meetings, selectedIds],
  );
  const visibleActionIds = useMemo(() => meetings.map((m) => m.id), [meetings]);
  const normalizedPhoneFilter = phoneFilter.replace(/\D/g, "");
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (scope === "selected" && !selectedIds.has(m.id)) return false;

      const rawDate = m.callbackDate || m.createdAt;
      if ((dateFrom || dateTo) && !rawDate) return false;
      if (rawDate) {
        const meetingDate = new Date(rawDate);
        if (Number.isNaN(meetingDate.getTime())) return false;
        if (dateFrom && meetingDate < new Date(`${dateFrom}T00:00:00`)) return false;
        if (dateTo && meetingDate > new Date(`${dateTo}T23:59:59.999`)) return false;
      }

      if (normalizedPhoneFilter) {
        const phones = [m.meetingPhone, m.contact?.phone, m.company?.phone]
          .filter((p): p is string => !!p)
          .map((p) => p.replace(/\D/g, ""));
        return phones.some((p) => p.includes(normalizedPhoneFilter));
      }

      return true;
    });
  }, [dateFrom, dateTo, meetings, normalizedPhoneFilter, scope, selectedIds]);

  const targetIds = filteredMeetings.map((m) => m.id);

  const runPreview = async () => {
    setError(null);
    setResult(null);
    if (targetIds.length === 0) {
      setError("Aucun RDV à analyser pour ce mode.");
      return;
    }
    setLoadingPreview(true);
    try {
      const res = await fetch("/api/manager/rdv/audio-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionIds: targetIds,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          phone: phoneFilter.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Impossible de prévisualiser.");
        setPreview([]);
        setSelectedToSync(new Set());
        return;
      }
      const items: PreviewItem[] = json.data.items ?? [];
      setPreview(items);
      setSelectedToSync(new Set(items.filter((i) => !!i.match).map((i) => i.actionId)));
      setResult(`${json.data.matchedCount ?? 0} appel(s) trouvé(s) — Call Vault, puis Twilio, puis Allo.`);
    } catch {
      setError("Erreur réseau lors de la prévisualisation.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const runSync = async () => {
    setError(null);
    if (selectedToSync.size === 0) {
      setError("Aucune ligne sélectionnée pour la synchronisation.");
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch("/api/manager/rdv/audio-sync", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: preview
            .filter((p) => selectedToSync.has(p.actionId))
            .map((p) => ({
              actionId: p.actionId,
              summary: p.match?.syncPayload.summary ?? null,
              transcription: p.match?.syncPayload.transcription ?? null,
              recordingUrl: p.match?.syncPayload.recordingUrl ?? null,
            })),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Synchronisation impossible.");
        return;
      }
      setResult(
        `Sync terminée: ${json.data.synced} enrichi(s), ${json.data.noMatch} sans match, ${json.data.noPhone} sans numéro.`,
      );
      await onSynced();
    } catch {
      setError("Erreur réseau pendant la synchronisation.");
    } finally {
      setSyncing(false);
    }
  };

  const toggleRow = (id: string) => {
    setSelectedToSync((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sync audios RDV"
      description="Affiche seulement trouvé / non trouvé + les stratégies de recherche essayées."
      size="xl"
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="rdv-btn"
            onClick={() => setScope("selected")}
            style={{
              background: scope === "selected" ? "var(--accentLight)" : "var(--surface2)",
              color: scope === "selected" ? "var(--accent)" : "var(--ink3)",
            }}
          >
            RDV sélectionnés ({selectedActionIds.length})
          </button>
          <button
            className="rdv-btn"
            onClick={() => setScope("visible")}
            style={{
              background: scope === "visible" ? "var(--accentLight)" : "var(--surface2)",
              color: scope === "visible" ? "var(--accent)" : "var(--ink3)",
            }}
          >
            RDV visibles ({visibleActionIds.length})
          </button>
          <span style={{ fontSize: 12, color: "var(--ink3)" }}>
            {targetIds.length} RDV a analyser apres filtres
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 11, color: "var(--ink3)", fontWeight: 600 }}>
            Date debut
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", background: "var(--surface)", color: "var(--ink)" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 11, color: "var(--ink3)", fontWeight: 600 }}>
            Date fin
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", background: "var(--surface)", color: "var(--ink)" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 11, color: "var(--ink3)", fontWeight: 600 }}>
            Numero
            <input
              type="tel"
              value={phoneFilter}
              onChange={(e) => setPhoneFilter(e.target.value)}
              placeholder="Ex: 06 12 34 56 78"
              style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", background: "var(--surface)", color: "var(--ink)" }}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="rdv-btn rdv-btn-ghost" onClick={runPreview} disabled={loadingPreview || syncing}>
            {loadingPreview ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Prévisualiser
          </button>
        </div>

        {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
        {result && <div style={{ color: "var(--green)", fontSize: 12 }}>{result}</div>}

        <div className="rdv-scrollbar" style={{ maxHeight: 420, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "var(--surface2)" }}>
              <tr>
                <th style={{ textAlign: "left", padding: 10, fontSize: 11 }}>Sync</th>
                <th style={{ textAlign: "left", padding: 10, fontSize: 11 }}>RDV</th>
                <th style={{ textAlign: "left", padding: 10, fontSize: 11 }}>Téléphones testés</th>
                <th style={{ textAlign: "left", padding: 10, fontSize: 11 }}>Résultat recherche</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.actionId} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: 10 }}>
                    <input
                      type="checkbox"
                      checked={selectedToSync.has(row.actionId)}
                      disabled={!row.match}
                      onChange={() => toggleRow(row.actionId)}
                    />
                  </td>
                  <td style={{ padding: 10, fontSize: 12 }}>
                    <div style={{ fontWeight: 600 }}>{row.contactName}</div>
                    <div style={{ color: "var(--ink3)" }}>{row.companyName}</div>
                  </td>
                  <td style={{ padding: 10, fontSize: 11, color: "var(--ink3)" }}>
                    {row.phonesTried.join(" · ") || "—"}
                  </td>
                  <td style={{ padding: 10, fontSize: 11 }}>
                    {row.match ? (
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ color: "var(--ink2)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                          <span className="rdv-origin" data-origin={row.match.source}>{ORIGIN_META[row.match.source].label}</span>
                          <span>{row.match.windowLabel.toLowerCase()}</span>
                        </div>
                        <div style={{ color: "var(--ink3)" }}>
                          audio : {row.match.hasRecording ? "oui" : "non"} · transcription : {row.match.hasTranscription ? "oui" : "non"} · résumé :{" "}
                          {row.match.hasSummary ? "oui" : "non"}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 4 }}>
                        <span style={{ color: "var(--red)", fontWeight: 600 }}>NON TROUVÉ</span>
                        <div style={{ color: "var(--ink3)" }}>{attemptsText(row.sourceAttempts) || "—"}</div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {preview.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 16, fontSize: 12, color: "var(--ink3)" }}>
                    Cliquez sur &quot;Previsualiser&quot; pour analyser les RDV.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <button className="rdv-btn rdv-btn-ghost" onClick={onClose} disabled={syncing}>
            Fermer
          </button>
          <button className="rdv-btn" onClick={runSync} disabled={syncing || selectedToSync.size === 0}>
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />} Confirmer la sync ({selectedToSync.size})
          </button>
        </div>
      </div>
    </Modal>
  );
}

