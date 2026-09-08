"use client";

import { memo, useEffect, useState } from "react";
import type { Meeting } from "../_types";
import { Skeleton } from "./shared/Skeleton";
import { EmptyState } from "./shared/EmptyState";
import { Avatar } from "./shared/Avatar";
import {
  contactName,
  meetingStatus,
  statusBg,
  statusColor,
  statusLabel,
  formatDateShort,
  meetingTypeIcon,
  confirmationBg,
  confirmationColor,
  confirmationLabel,
  hashColor,
  proximityLabel,
  formatDuration,
} from "../_lib/formatters";
import type { ConfirmationFilter } from "../_types";
import { Copy, Linkedin, RefreshCw, Check, X, Mic, ChevronUp, ChevronDown } from "lucide-react";
import type { SortField, SortDir } from "../_types";

interface MeetingListProps {
  meetings: Meeting[];
  loading: boolean;
  loadingMore: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpen: (m: Meeting) => void;
  onLoadMore: () => void;
  updateMeeting: (id: string, data: Record<string, unknown>) => Promise<void>;
  updateLocalMeeting: (id: string, patch: Partial<Meeting>) => void;
  sortBy?: SortField;
  sortDir?: SortDir;
  onSort?: (field: SortField) => void;
}

const MeetingRow = memo(function MeetingRow({
  meeting,
  selected,
  onToggleSelect,
  onOpen,
  updateMeeting,
  updateLocalMeeting,
}: {
  meeting: Meeting;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (m: Meeting) => void;
  updateMeeting: (id: string, data: Record<string, unknown>) => Promise<void>;
  updateLocalMeeting: (id: string, patch: Partial<Meeting>) => void;
}) {
  const status = meetingStatus(meeting);
  const date = formatDateShort(meeting.createdAt);
  const rdvDate = formatDateShort(meeting.callbackDate);
  const proximity = proximityLabel(meeting.callbackDate);
  const isPending = meeting.confirmationStatus === "PENDING";
  const [audioPopupOpen, setAudioPopupOpen] = useState(false);
  const hasAudio = !!meeting.callRecordingUrl?.trim();
  const transcription = meeting.callTranscription?.trim() ?? "";

  const handleInlineConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateMeeting(meeting.id, { confirmationStatus: "CONFIRMED" });
    updateLocalMeeting(meeting.id, {
      confirmationStatus: "CONFIRMED",
      confirmedAt: new Date().toISOString(),
    });
  };

  const handleInlineCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateMeeting(meeting.id, { confirmationStatus: "CANCELLED" });
    updateLocalMeeting(meeting.id, {
      confirmationStatus: "CANCELLED",
      confirmedAt: null,
      confirmedById: null,
    });
  };

  return (
    <div
      className={`rdv-row ${selected ? "selected" : ""}`}
      onClick={() => onOpen(meeting)}
    >
      <div style={{ width: 28 }} onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" className="rdv-checkbox" checked={selected} onChange={() => onToggleSelect(meeting.id)} />
      </div>

      {/* Created date */}
      <div style={{ width: 72, display: "flex", flexDirection: "column", gap: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", lineHeight: 1.1 }}>
          {date.day} {date.month}
        </div>
        <div style={{ fontSize: 10, color: "var(--ink4)", fontWeight: 500 }}>
          {date.time}
        </div>
      </div>

      {/* Scheduled meeting date */}
      <div style={{ width: 84, display: "flex", flexDirection: "column", gap: 1 }}>
        {meeting.callbackDate ? (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: proximity.color, lineHeight: 1.1 }}>
              {rdvDate.day} {rdvDate.month}
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: proximity.color, background: `${proximity.color}15`, borderRadius: 4, padding: "1px 5px", alignSelf: "flex-start" }}>
              {proximity.text}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 11, color: "var(--ink4)" }}>—</span>
        )}
      </div>

      {/* Contact */}
      <div style={{ flex: 2, minWidth: 140, display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
        <Avatar name={meeting.contact ? contactName(meeting.contact) : (meeting.company?.name ?? "—")} size={28} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {meeting.contact ? contactName(meeting.contact) : (meeting.company ? "Société seule" : "—")}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {meeting.contact?.title ?? (meeting.company ? meeting.company.name : "—")}
          </div>
        </div>
      </div>

      {/* Company */}
      <div style={{ flex: 2, minWidth: 120, display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: "var(--surface2)", border: "1px solid var(--border)", display: "grid", placeContent: "center", fontSize: 11, fontWeight: 700, color: "var(--ink3)", flexShrink: 0 }}>
          {(meeting.company?.name || "?")[0]}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {meeting.company?.name || "—"}
          </div>
          {meeting.company?.industry && (
            <span style={{ fontSize: 9, color: "var(--ink4)", fontWeight: 500 }}>
              {meeting.company.industry}
            </span>
          )}
        </div>
      </div>

      {/* Client */}
      <div style={{ flex: 1, minWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {meeting.client && (
          <span className="rdv-pill" style={{ background: `${hashColor(meeting.client.name)}12`, color: hashColor(meeting.client.name), fontWeight: 600, fontSize: 10 }}>
            {meeting.client.name}
          </span>
        )}
      </div>

      {/* SDR */}
      <div style={{ width: 95, display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
        <Avatar name={meeting.sdr.name} size={20} />
        <span style={{ fontSize: 11, color: "var(--ink2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meeting.sdr.name}
        </span>
      </div>

      {/* Commercial assigné */}
      <div style={{ width: 110, display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
        {meeting.interlocuteur ? (
          <>
            <Avatar
              name={[meeting.interlocuteur.firstName, meeting.interlocuteur.lastName].filter(Boolean).join(" ") || "Commercial"}
              size={20}
            />
            <span style={{ fontSize: 11, color: "var(--ink2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {[meeting.interlocuteur.firstName, meeting.interlocuteur.lastName].filter(Boolean).join(" ") || "Assigné"}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 10, color: "var(--ink4)", fontStyle: "italic" }}>Non assigné</span>
        )}
      </div>

      {/* Type */}
      <div style={{ width: 32, textAlign: "center", color: "var(--ink3)" }}>
        {meetingTypeIcon(meeting.meetingType)}
      </div>

      {/* Durée */}
      <div style={{ width: 45, textAlign: "center" }}>
        {meeting.duration ? (
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--ink3)", background: "var(--surface2)", padding: "2px 5px", borderRadius: 4 }}>
            {formatDuration(meeting.duration)}
          </span>
        ) : (
          <span style={{ color: "var(--ink4)", fontSize: 10 }}>—</span>
        )}
      </div>

      {/* SAS Confirmation Status */}
      <div style={{ width: 95, textAlign: "center" }}>
        {meeting.confirmationStatus ? (
          <span
            className={`status-badge ${isPending ? "status-badge-pending-pulse" : ""}`}
            style={{
              background: confirmationBg(meeting.confirmationStatus as ConfirmationFilter),
              color: confirmationColor(meeting.confirmationStatus as ConfirmationFilter),
              fontSize: 10,
              padding: "2px 7px",
            }}
          >
            {confirmationLabel(meeting.confirmationStatus as ConfirmationFilter)}
          </span>
        ) : (
          <span style={{ fontSize: 10, color: "var(--ink4)" }}>—</span>
        )}
      </div>

      {/* Audio icon */}
      <div style={{ width: 32, textAlign: "center", position: "relative" }}>
        {hasAudio ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAudioPopupOpen((prev) => !prev);
              }}
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: audioPopupOpen ? "rgba(79,70,229,0.12)" : "var(--surface2)",
                color: audioPopupOpen ? "var(--accent)" : "var(--ink3)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              title="Audio et transcription"
            >
              <Mic size={12} />
            </button>
            {audioPopupOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  width: 300,
                  zIndex: 30,
                  border: "1px solid var(--border2)",
                  borderRadius: 10,
                  background: "var(--surface)",
                  boxShadow: "0 10px 30px rgba(15,23,42,0.15)",
                  padding: 10,
                  textAlign: "left",
                }}
              >
                <audio controls src={`/api/actions/${meeting.id}/recording`} style={{ width: "100%", height: 32 }} />
                <div
                  className="rdv-scrollbar"
                  style={{
                    marginTop: 6,
                    maxHeight: 120,
                    overflowY: "auto",
                    fontSize: 11,
                    color: "var(--ink2)",
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {transcription || "Aucune transcription disponible."}
                </div>
              </div>
            )}
          </>
        ) : (
          <span style={{ fontSize: 10, color: "var(--ink4)" }}>—</span>
        )}
      </div>

      {/* Quick inline action buttons on hover */}
      <div style={{ width: 68, display: "flex", justifyContent: "flex-end" }}>
        <div className="rdv-row-actions" style={{ display: "flex", gap: 3 }}>
          {isPending && (
            <>
              <button
                onClick={handleInlineConfirm}
                style={{
                  background: "var(--greenLight)",
                  border: "1px solid rgba(5,150,105,0.25)",
                  color: "var(--green)",
                  cursor: "pointer",
                  padding: "3px 5px",
                  borderRadius: 5,
                  display: "flex",
                  alignItems: "center",
                }}
                title="Confirmer immédiatement"
              >
                <Check size={11} />
              </button>
              <button
                onClick={handleInlineCancel}
                style={{
                  background: "var(--redLight)",
                  border: "1px solid rgba(220,38,38,0.25)",
                  color: "var(--red)",
                  cursor: "pointer",
                  padding: "3px 5px",
                  borderRadius: 5,
                  display: "flex",
                  alignItems: "center",
                }}
                title="Annuler le RDV"
              >
                <X size={11} />
              </button>
            </>
          )}
          {meeting.contact?.email && (
            <button
              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(meeting.contact!.email!); }}
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--ink3)", cursor: "pointer", padding: "3px 5px", borderRadius: 5 }}
              title="Copier email"
            >
              <Copy size={11} />
            </button>
          )}
          {meeting.contact?.linkedin && (
            <a
              href={meeting.contact.linkedin}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: "var(--ink3)", padding: "3px 5px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 5, display: "flex" }}
              title="LinkedIn"
            >
              <Linkedin size={11} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
});

function SortHeader({ label, field, sortBy, sortDir, onSort, style }: {
  label: string; field: SortField; sortBy?: SortField; sortDir?: SortDir;
  onSort?: (f: SortField) => void; style?: React.CSSProperties;
}) {
  const active = sortBy === field;
  return (
    <button
      onClick={() => onSort?.(field)}
      style={{
        background: "none", border: "none", cursor: onSort ? "pointer" : "default",
        display: "flex", alignItems: "center", gap: 2, padding: 0,
        fontSize: 10, fontWeight: active ? 700 : 600,
        color: active ? "var(--accent)" : "var(--ink3)",
        textTransform: "uppercase", letterSpacing: "0.05em",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {label}
      {active ? (
        sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />
      ) : onSort ? (
        <ChevronDown size={10} style={{ opacity: 0.3 }} />
      ) : null}
    </button>
  );
}

export function MeetingList({
  meetings,
  loading,
  loadingMore,
  listRef,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onOpen,
  onLoadMore,
  updateMeeting,
  updateLocalMeeting,
  sortBy,
  sortDir,
  onSort,
}: MeetingListProps) {
  const scrollContainerRef = listRef as React.RefObject<HTMLDivElement>;

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
        onLoadMore();
      }
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollContainerRef, onLoadMore]);

  return (
    <div ref={scrollContainerRef} className="rdv-table-viewport rdv-scrollbar">
      <div className="rdv-table-content">
        <div className="rdv-list-header">
          <div style={{ width: 28 }}>
            <input
              type="checkbox"
              className="rdv-checkbox"
              checked={selectedIds.size > 0 && selectedIds.size === meetings.length}
              onChange={onToggleSelectAll}
            />
          </div>
          <div style={{ width: 72 }}>
            <SortHeader label="Créé le" field="createdAt" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          </div>
          <div style={{ width: 84 }}>
            <SortHeader label="Date RDV" field="callbackDate" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          </div>
          <div style={{ flex: 2, minWidth: 140 }}>
            <SortHeader label="Contact" field="contactName" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          </div>
          <div style={{ flex: 2, minWidth: 120 }}>
            <SortHeader label="Entreprise" field="companyName" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          </div>
          <div style={{ flex: 1, minWidth: 80, fontSize: 10, fontWeight: 600, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Client
          </div>
          <div style={{ width: 95 }}>
            <SortHeader label="SDR" field="sdrName" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          </div>
          <div style={{ width: 110, fontSize: 10, fontWeight: 600, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Commercial
          </div>
          <div style={{ width: 32, textAlign: "center", fontSize: 10, fontWeight: 600, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Type
          </div>
          <div style={{ width: 45, textAlign: "center" }}>
            <SortHeader label="Durée" field="duration" sortBy={sortBy} sortDir={sortDir} onSort={onSort} style={{ justifyContent: "center" }} />
          </div>
          <div style={{ width: 95, textAlign: "center", fontSize: 10, fontWeight: 600, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            SAS Validation
          </div>
          <div style={{ width: 32, textAlign: "center", fontSize: 10, fontWeight: 600, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Audio
          </div>
          <div style={{ width: 68 }} />
        </div>

        {loading ? (
          Array.from({ length: 14 }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 16px", gap: 10, borderBottom: "1px solid var(--border)", height: 54 }}>
              <Skeleton w={16} h={16} r={4} />
              <Skeleton w={60} h={26} r={6} />
              <Skeleton w={70} h={26} r={6} />
              <div style={{ flex: 2, display: "flex", alignItems: "center", gap: 8 }}>
                <Skeleton w={28} h={28} r={14} />
                <Skeleton w={110} h={20} r={4} />
              </div>
              <div style={{ flex: 2, display: "flex", alignItems: "center", gap: 8 }}>
                <Skeleton w={26} h={26} r={6} />
                <Skeleton w={90} h={18} r={4} />
              </div>
              <Skeleton w={60} h={18} r={4} />
              <Skeleton w={80} h={18} r={4} />
              <Skeleton w={90} h={18} r={4} />
              <Skeleton w={24} h={18} r={4} />
              <Skeleton w={35} h={18} r={4} />
              <Skeleton w={75} h={20} r={10} />
            </div>
          ))
        ) : meetings.length === 0 ? (
          <div style={{ padding: "48px 24px" }}>
            <EmptyState
              title="Aucun rendez-vous trouvé"
              description="Modifiez vos critères de recherche ou réinitialisez les filtres pour afficher des résultats."
            />
          </div>
        ) : (
          meetings.map((meeting) => (
            <MeetingRow
              key={meeting.id}
              meeting={meeting}
              selected={selectedIds.has(meeting.id)}
              onToggleSelect={onToggleSelect}
              onOpen={onOpen}
              updateMeeting={updateMeeting}
              updateLocalMeeting={updateLocalMeeting}
            />
          ))
        )}

        {loadingMore && (
          <div style={{ padding: "12px 20px", display: "flex", justifyContent: "center", alignItems: "center", gap: 8, color: "var(--ink3)", fontSize: 12 }}>
            <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> Chargement des RDV suivants…
          </div>
        )}
      </div>
    </div>
  );
}
