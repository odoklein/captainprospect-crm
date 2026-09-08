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
} from "lucide-react";
import { downloadICS, proximityLabel } from "../../_lib/formatters";
import { DetailTab } from "./DetailTab";
import { FicheTab } from "./FicheTab";
import { FeedbackTab } from "./FeedbackTab";
import { AudioTab } from "./AudioTab";
import { HistoryTab } from "./HistoryTab";
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink2)", letterSpacing: "0.02em" }}>
              RDV {currentIndex >= 0 ? currentIndex + 1 : 1} / {meetings.length || 1}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                onClick={handlePrev}
                disabled={!hasPrev}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border2)",
                  borderRadius: 5,
                  padding: "3px 6px",
                  cursor: hasPrev ? "pointer" : "not-allowed",
                  opacity: hasPrev ? 1 : 0.35,
                  display: "flex",
                  alignItems: "center",
                  color: "var(--ink2)",
                }}
                title="RDV précédent (Touche ↑)"
              >
                <ChevronUp size={13} />
              </button>
              <button
                onClick={handleNext}
                disabled={!hasNext}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border2)",
                  borderRadius: 5,
                  padding: "3px 6px",
                  cursor: hasNext ? "pointer" : "not-allowed",
                  opacity: hasNext ? 1 : 0.35,
                  display: "flex",
                  alignItems: "center",
                  color: "var(--ink2)",
                }}
                title="RDV suivant (Touche ↓)"
              >
                <ChevronDown size={13} />
              </button>
            </div>
            <span style={{ fontSize: 10, color: "var(--ink4)", marginLeft: 4 }}>
              (Naviguer: ↑ ↓)
            </span>
          </div>

          <button
            onClick={closePanel}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--ink3)",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              fontWeight: 500,
            }}
            title="Fermer (Échap)"
          >
            <span style={{ fontSize: 10, opacity: 0.7 }}>Échap</span>
            <X size={15} />
          </button>
        </div>

        {/* Header content */}
        <div className="rdv-panel-header">
          {/* Contact Hero */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <Avatar name={contactName(selectedMeeting.contact)} size={46} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="rdv-serif" style={{ fontSize: 18, color: "var(--ink)", lineHeight: 1.2 }}>
                  {contactName(selectedMeeting.contact)}
                </span>
                {selectedMeeting.contact?.email && (
                  <button
                    onClick={() => navigator.clipboard.writeText(selectedMeeting.contact!.email!)}
                    style={{ background: "transparent", border: "none", color: "var(--ink3)", cursor: "pointer", padding: 2 }}
                    title="Copier l'email"
                  >
                    <Copy size={12} />
                  </button>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedMeeting.contact?.title ? `${selectedMeeting.contact.title} · ` : ""}
                <strong style={{ color: "var(--ink2)", fontWeight: 600 }}>{selectedMeeting.company?.name || "Société non renseignée"}</strong>
              </div>
            </div>
          </div>

          {/* Prominent SAS Confirmation Action Card */}
          {isPending && (
            <div
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.28)",
                borderRadius: 10,
                padding: "10px 14px",
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--amber)" }}>
                  <Clock size={14} /> EN ATTENTE DE VALIDATION SAS
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--amber)" }}>
                  Auto-confirmation sous 24h
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="rdv-btn rdv-btn-primary"
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    background: "var(--green)",
                    color: "#ffffff",
                    padding: "7px 14px",
                    fontWeight: 600,
                  }}
                  onClick={handleConfirm}
                >
                  <Check size={14} /> Confirmer le RDV
                </button>
                <button
                  className="rdv-btn rdv-btn-ghost"
                  style={{
                    padding: "7px 14px",
                    color: "var(--red)",
                    borderColor: "rgba(225,29,72,0.25)",
                  }}
                  onClick={handleCancel}
                >
                  <X size={14} /> Rejeter / Annuler
                </button>
              </div>
            </div>
          )}

          {isConfirmed && (
            <div
              style={{
                background: "rgba(5, 150, 105, 0.07)",
                border: "1px solid rgba(5, 150, 105, 0.22)",
                borderRadius: 10,
                padding: "8px 12px",
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--green)" }}>
                <CheckCircle2 size={15} />
                <span>RDV Confirmé & Validé</span>
                {selectedMeeting.confirmedAt && (
                  <span style={{ fontSize: 11, fontWeight: 400, color: "var(--ink3)" }}>
                    · {new Date(selectedMeeting.confirmedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <button
                onClick={handleCancel}
                style={{
                  fontSize: 11,
                  color: "var(--ink3)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Annuler
              </button>
            </div>
          )}

          {isCancelled && (
            <div
              style={{
                background: "rgba(225, 29, 72, 0.06)",
                border: "1px solid rgba(225, 29, 72, 0.2)",
                borderRadius: 10,
                padding: "8px 12px",
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--red)" }}>
                ✕ Rendez-vous Annulé
              </span>
              <button
                onClick={handleConfirm}
                className="rdv-btn rdv-btn-ghost"
                style={{ fontSize: 11, padding: "3px 8px", color: "var(--green)" }}
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
                className="rdv-btn rdv-btn-ghost"
                style={{ fontSize: 11, padding: "5px 10px", textDecoration: "none" }}
              >
                <Mail size={12} /> Email
              </a>
            )}
            {selectedMeeting.contact?.phone && (
              <a
                href={`tel:${selectedMeeting.contact.phone}`}
                className="rdv-btn rdv-btn-ghost"
                style={{ fontSize: 11, padding: "5px 10px", textDecoration: "none" }}
              >
                <Phone size={12} /> Appeler
              </a>
            )}
            {selectedMeeting.contact?.linkedin && (
              <a
                href={selectedMeeting.contact.linkedin}
                target="_blank"
                rel="noreferrer"
                className="rdv-btn rdv-btn-ghost"
                style={{ fontSize: 11, padding: "5px 10px", textDecoration: "none" }}
              >
                <Linkedin size={12} /> LinkedIn
              </a>
            )}
            {selectedMeeting.meetingJoinUrl && (
              <a
                href={selectedMeeting.meetingJoinUrl}
                target="_blank"
                rel="noreferrer"
                className="rdv-btn"
                style={{
                  fontSize: 11,
                  padding: "5px 10px",
                  textDecoration: "none",
                  background: "rgba(37, 99, 235, 0.09)",
                  color: "var(--blue)",
                  border: "1px solid rgba(37, 99, 235, 0.2)",
                  fontWeight: 600,
                }}
              >
                <Video size={12} /> Rejoindre Visio
              </a>
            )}
            {selectedMeeting.callbackDate && (
              <button
                className="rdv-btn rdv-btn-ghost"
                style={{ fontSize: 11, padding: "5px 10px" }}
                onClick={() => downloadICS(selectedMeeting)}
              >
                <CalendarPlus size={12} /> Export .ics
              </button>
            )}
          </div>

          {/* Segmented Tabs */}
          <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
            {TABS.map(({ key, label, Icon }) => {
              const hasIndicator =
                (key === "fiche" && hasFiche) ||
                (key === "feedback" && hasFeedback) ||
                (key === "audio" && hasAudio);

              return (
                <button
                  key={key}
                  className={`rdv-tab ${panelTab === key ? "active" : ""}`}
                  onClick={() => setPanelTab(key)}
                >
                  <Icon size={12} />
                  <span>{label}</span>
                  {hasIndicator && (
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: key === "audio" ? "var(--accent)" : "var(--green)",
                      }}
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
