"use client";

import type { Meeting, PanelTab } from "../../_types";
import {
  statusBg,
  statusColor,
  statusLabel,
  meetingStatus,
  confirmationBg,
  confirmationColor,
  confirmationLabel,
  meetingTypeIcon,
  meetingTypeLabel,
  categoryBg,
  categoryColor,
  categoryLabel,
} from "../../_lib/formatters";
import type { ConfirmationFilter } from "../../_types";
import { Avatar } from "../shared/Avatar";
import {
  X,
  Check,
  Mail,
  Phone,
  Linkedin,
  FileText,
  ThumbsUp,
  Mic,
  History,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Clock,
  CheckCircle2,
  Video,
  Copy,
  ExternalLink,
  CalendarClock,
  XCircle,
} from "lucide-react";
import { downloadICS, proximityLabel } from "../../_lib/formatters";
import { DetailTab } from "./DetailTab";
import { FicheTab } from "./FicheTab";
import { FeedbackTab } from "./FeedbackTab";
import { AudioTab } from "./AudioTab";
import { HistoryTab } from "./HistoryTab";
import { NoShowActions } from "./NoShowActions";
import type { UseDetailPanelReturn } from "../../_hooks/useDetailPanel";
import type { UseFicheRdvReturn } from "../../_hooks/useFicheRdv";
import type { UseFeedbackReturn } from "../../_hooks/useFeedback";
import { contactName } from "../../_lib/formatters";

interface DetailPanelProps {
  panelState: UseDetailPanelReturn;
  ficheState: UseFicheRdvReturn;
  feedbackState: UseFeedbackReturn;
  updateMeeting: (id: string, data: Record<string, unknown>) => Promise<void>;
  onOpenEditContact: () => void;
  onOpenEditCompany: () => void;
  onOpenLinkContact: () => void;
  updateLocalMeeting: (id: string, patch: Partial<Meeting>) => void;
  meetings?: Meeting[];
}

const TABS: { key: PanelTab; label: string; Icon: typeof FileText }[] = [
  { key: "detail", label: "Détail", Icon: FileText },
  { key: "fiche", label: "Fiche RDV", Icon: FileText },
  { key: "feedback", label: "Feedback", Icon: ThumbsUp },
  { key: "audio", label: "Audio & IA", Icon: Mic },
  { key: "history", label: "Historique", Icon: History },
];

export function DetailPanel({
  panelState,
  ficheState,
  feedbackState,
  updateMeeting,
  onOpenEditContact,
  onOpenEditCompany,
  onOpenLinkContact,
  updateLocalMeeting,
  meetings = [],
}: DetailPanelProps) {
  const { selectedMeeting, setSelectedMeeting, panelOpen, panelTab, setPanelTab, closePanel } = panelState;

  if (!selectedMeeting) return null;

  const status = meetingStatus(selectedMeeting);
  const isPending = selectedMeeting.confirmationStatus === "PENDING";
  const isConfirmed = selectedMeeting.confirmationStatus === "CONFIRMED";
  const isCancelled = selectedMeeting.confirmationStatus === "CANCELLED";

  const currentIndex = meetings.findIndex((m) => m.id === selectedMeeting.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < meetings.length - 1;

  const handlePrev = () => {
    if (hasPrev) {
      panelState.openPanel(meetings[currentIndex - 1], meetings);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      panelState.openPanel(meetings[currentIndex + 1], meetings);
    }
  };

  const handleConfirm = () => {
    updateMeeting(selectedMeeting.id, { confirmationStatus: "CONFIRMED" });
    const confirmedAt = new Date().toISOString();
    updateLocalMeeting(selectedMeeting.id, { confirmationStatus: "CONFIRMED", confirmedAt });
    setSelectedMeeting({ ...selectedMeeting, confirmationStatus: "CONFIRMED", confirmedAt });
  };

  const handleCancel = () => {
    updateMeeting(selectedMeeting.id, { confirmationStatus: "CANCELLED" });
    updateLocalMeeting(selectedMeeting.id, {
      confirmationStatus: "CANCELLED",
      confirmedAt: null,
      confirmedById: null,
    });
    setSelectedMeeting({ ...selectedMeeting, confirmationStatus: "CANCELLED", confirmedAt: null, confirmedById: null });
  };

  /**
   * The RDV was re-booked: close this one as cancelled with the "replaced"
   * reason. That is what removes it from the no-show boards — flagging it
   * absent was previously the only exit, which misreported what happened.
   */
  const handleReplaced = () => {
    updateMeeting(selectedMeeting.id, {
      result: "MEETING_CANCELLED",
      cancellationReason: "replaced",
    });
    updateLocalMeeting(selectedMeeting.id, {
      result: "MEETING_CANCELLED",
      cancellationReason: "replaced",
    });
    setSelectedMeeting({
      ...selectedMeeting,
      result: "MEETING_CANCELLED",
      cancellationReason: "replaced",
    });
  };

  const isReplaced =
    selectedMeeting.result === "MEETING_CANCELLED" &&
    selectedMeeting.cancellationReason === "replaced";

  /** Undo a mis-click: back to a booked, confirmed RDV. */
  const handleUndoReplaced = () => {
    const patch = {
      result: "MEETING_BOOKED",
      cancellationReason: null,
      confirmationStatus: "CONFIRMED",
    };
    updateMeeting(selectedMeeting.id, patch);
    const confirmedAt = new Date().toISOString();
    updateLocalMeeting(selectedMeeting.id, {
      result: "MEETING_BOOKED",
      cancellationReason: null,
      confirmationStatus: "CONFIRMED",
      confirmedAt,
    });
    setSelectedMeeting({
      ...selectedMeeting,
      result: "MEETING_BOOKED",
      cancellationReason: null,
      confirmationStatus: "CONFIRMED",
      confirmedAt,
    });
  };

  const hasAudio = !!selectedMeeting.callRecordingUrl?.trim();
  const hasFiche = !!(
    selectedMeeting.rdvFiche?.contexte ||
    selectedMeeting.rdvFiche?.besoinsProblemes ||
    selectedMeeting.rdvFiche?.notesImportantes
  );
  const hasFeedback = !!selectedMeeting.feedback?.outcome;

  return (
    <>
      {/* Dimmed backdrop - click outside to dismiss */}
      <div
        className={`rdv-panel-backdrop ${panelOpen ? "open" : ""}`}
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className={`rdv-panel ${panelOpen ? "open" : ""}`}>
        {/* Navigation Bar */}
        <div className="rdv-panel-nav">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ds-inverse-ink-2)" }}>
              Dossier RDV
            </span>
            <span style={{ fontSize: 12, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
              {currentIndex >= 0 ? currentIndex + 1 : 1} / {meetings.length || 1}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                type="button"
                className="rdv-icon-btn"
                onClick={handlePrev}
                disabled={!hasPrev}
                title="RDV précédent (Touche ↑)"
                aria-label="RDV précédent"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                className="rdv-icon-btn"
                onClick={handleNext}
                disabled={!hasNext}
                title="RDV suivant (Touche ↓)"
                aria-label="RDV suivant"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <span style={{ display: "inline-flex", gap: 3 }}>
              <span className="rdv-kbd">↑</span>
              <span className="rdv-kbd">↓</span>
            </span>
          </div>

          <button
            type="button"
            className="rdv-icon-btn"
            onClick={closePanel}
            style={{ width: "auto", padding: "0 8px", gap: 6 }}
            title="Fermer (Échap)"
          >
            <span className="rdv-kbd" style={{ border: "none", padding: 0 }}>Échap</span>
            <X size={14} />
          </button>
        </div>

        {/* Header content */}
        <div className="rdv-panel-header">
          {/* Contact Hero */}
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
            <Avatar name={contactName(selectedMeeting.contact)} size={48} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="rdv-serif" style={{ fontSize: 20, color: "var(--ink)", lineHeight: 1.2 }}>
                  {contactName(selectedMeeting.contact)}
                </span>
                {selectedMeeting.contact?.email && (
                  <button
                    type="button"
                    className="rdv-icon-btn"
                    style={{ width: 22, height: 22, border: "none", background: "transparent" }}
                    onClick={() => navigator.clipboard.writeText(selectedMeeting.contact!.email!)}
                    title="Copier l'email"
                  >
                    <Copy size={12} />
                  </button>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedMeeting.contact?.title ? `${selectedMeeting.contact.title} · ` : ""}
                <strong style={{ color: "var(--ink2)", fontWeight: 600 }}>{selectedMeeting.company?.name || "Société non renseignée"}</strong>
              </div>
            </div>
            {selectedMeeting.confirmationStatus && (
              <span
                className={`status-badge ${isPending ? "status-badge-pending-pulse" : ""}`}
                style={{
                  background: confirmationBg(selectedMeeting.confirmationStatus as ConfirmationFilter),
                  color: confirmationColor(selectedMeeting.confirmationStatus as ConfirmationFilter),
                  flexShrink: 0,
                }}
              >
                {confirmationLabel(selectedMeeting.confirmationStatus as ConfirmationFilter)}
              </span>
            )}
          </div>

          {/* Absence — flagging a late no-show happens here, on the RDV itself,
              and answers "who picks it back up?" in the same move. Above the SAS
              cards because an absence outranks a confirmation question. */}
          {!isReplaced && (
            <NoShowActions
              meeting={selectedMeeting}
              onUpdated={(patch) => {
                updateLocalMeeting(selectedMeeting.id, patch);
                setSelectedMeeting({ ...selectedMeeting, ...patch });
              }}
            />
          )}

          {/* Prominent SAS Confirmation Action Card */}
          {isReplaced && (
            <div className="rdv-banner" data-tone="pending" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div className="rdv-banner-title">
                <CalendarClock size={15} />
                <span>RDV replacé — un nouveau rendez-vous le remplace</span>
              </div>
              <button
                onClick={handleUndoReplaced}
                className="rdv-btn rdv-btn-ghost rdv-btn-sm"
                title="Annuler le marquage et remettre le RDV en confirmé"
              >
                <Check size={11} /> Rétablir
              </button>
            </div>
          )}

          {isPending && !isReplaced && (
            <div className="rdv-banner" data-tone="pending" style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                <div className="rdv-banner-title" style={{ letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 11 }}>
                  <Clock size={14} /> En attente de validation SAS
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 600 }}>
                  Auto-confirmation sous 24h
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="rdv-btn rdv-btn-confirm"
                  style={{ flex: 1, justifyContent: "center", padding: "8px 14px", fontWeight: 650 }}
                  onClick={handleConfirm}
                >
                  <Check size={14} /> Confirmer le RDV
                </button>
                <button
                  className="rdv-btn rdv-btn-danger"
                  style={{ padding: "8px 14px" }}
                  onClick={handleCancel}
                >
                  <X size={14} /> Rejeter / Annuler
                </button>
                <button
                  className="rdv-btn rdv-btn-ghost"
                  style={{ padding: "8px 14px" }}
                  onClick={handleReplaced}
                  title="Le RDV a été replacé : un nouveau RDV le remplace"
                >
                  <CalendarClock size={14} /> RDV replacé
                </button>
              </div>
            </div>
          )}

          {isConfirmed && !isReplaced && (
            <div className="rdv-banner" data-tone="confirmed" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div className="rdv-banner-title">
                <CheckCircle2 size={15} />
                <span>RDV Confirmé & Validé</span>
                {selectedMeeting.confirmedAt && (
                  <span style={{ fontSize: 11, fontWeight: 400, color: "var(--ink3)" }}>
                    · {new Date(selectedMeeting.confirmedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  className="rdv-link-btn"
                  onClick={handleReplaced}
                  title="Le RDV a été replacé : un nouveau RDV le remplace"
                >
                  RDV replacé
                </button>
                <button type="button" className="rdv-link-btn" onClick={handleCancel}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          {isCancelled && !isReplaced && (
            <div className="rdv-banner" data-tone="cancelled" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span className="rdv-banner-title">
                <XCircle size={14} />
                {isReplaced ? "Rendez-vous replacé" : "Rendez-vous annulé"}
              </span>
              <button
                onClick={handleConfirm}
                className="rdv-btn rdv-btn-ghost rdv-btn-sm"
                style={{ color: "var(--greenInk)" }}
              >
                <Check size={11} /> Re-confirmer
              </button>
            </div>
          )}

          {/* Quick contact actions toolbar */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {selectedMeeting.contact?.email && (
              <a
                href={`mailto:${selectedMeeting.contact.email}`}
                className="rdv-btn rdv-btn-ghost rdv-btn-sm"
                style={{ textDecoration: "none" }}
              >
                <Mail size={12} /> Email
              </a>
            )}
            {selectedMeeting.contact?.phone && (
              <a
                href={`tel:${selectedMeeting.contact.phone}`}
                className="rdv-btn rdv-btn-ghost rdv-btn-sm"
                style={{ textDecoration: "none" }}
              >
                <Phone size={12} /> Appeler
              </a>
            )}
            {selectedMeeting.contact?.linkedin && (
              <a
                href={selectedMeeting.contact.linkedin}
                target="_blank"
                rel="noreferrer"
                className="rdv-btn rdv-btn-ghost rdv-btn-sm"
                style={{ textDecoration: "none" }}
              >
                <Linkedin size={12} /> LinkedIn
              </a>
            )}
            {selectedMeeting.meetingJoinUrl && (
              <a
                href={selectedMeeting.meetingJoinUrl}
                target="_blank"
                rel="noreferrer"
                className="rdv-btn rdv-btn-primary rdv-btn-sm"
                style={{ textDecoration: "none" }}
              >
                <Video size={12} /> Rejoindre Visio
              </a>
            )}
            {selectedMeeting.callbackDate && (
              <button
                className="rdv-btn rdv-btn-ghost rdv-btn-sm"
                onClick={() => downloadICS(selectedMeeting)}
              >
                <CalendarPlus size={12} /> Export .ics
              </button>
            )}
          </div>

          {/* Segmented Tabs */}
          <div className="rdv-tabs rdv-scrollbar" role="tablist">
            {TABS.map(({ key, label, Icon }) => {
              const hasIndicator =
                (key === "fiche" && hasFiche) ||
                (key === "feedback" && hasFeedback) ||
                (key === "audio" && hasAudio);

              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={panelTab === key}
                  className={`rdv-tab ${panelTab === key ? "active" : ""}`}
                  onClick={() => setPanelTab(key)}
                >
                  <Icon size={13} />
                  <span>{label}</span>
                  {hasIndicator && (
                    <span
                      className="rdv-tab-dot"
                      style={key === "audio" ? { background: "var(--rose)" } : undefined}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Drawer Body Tab Content */}
        <div className="rdv-panel-body rdv-scrollbar">
          {panelTab === "detail" && (
            <DetailTab
              meeting={selectedMeeting}
              setSelectedMeeting={setSelectedMeeting}
              editMode={panelState.detailEditMode}
              setEditMode={panelState.setDetailEditMode}
              detailForm={panelState.detailForm}
              setDetailForm={panelState.setDetailForm}
              detailSaving={panelState.detailSaving}
              setDetailSaving={panelState.setDetailSaving}
              updateMeeting={updateMeeting}
              updateLocalMeeting={updateLocalMeeting}
              onOpenEditContact={onOpenEditContact}
              onOpenEditCompany={onOpenEditCompany}
              onOpenLinkContact={onOpenLinkContact}
            />
          )}
          {panelTab === "fiche" && (
            <FicheTab
              meeting={selectedMeeting}
              setSelectedMeeting={setSelectedMeeting}
              ficheState={ficheState}
            />
          )}
          {panelTab === "feedback" && (
            <FeedbackTab
              meeting={selectedMeeting}
              feedbackState={feedbackState}
              updateMeeting={updateMeeting}
            />
          )}
          {panelTab === "audio" && (
            <AudioTab
              meeting={selectedMeeting}
              updateMeeting={updateMeeting}
              setSelectedMeeting={setSelectedMeeting}
              ficheState={ficheState}
            />
          )}
          {panelTab === "history" && (
            <HistoryTab meeting={selectedMeeting} />
          )}
        </div>
      </div>
    </>
  );
}
