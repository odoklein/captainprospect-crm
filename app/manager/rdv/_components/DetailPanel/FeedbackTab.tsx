"use client";

import type { Meeting } from "../../_types";
import type { UseFeedbackReturn } from "../../_hooks/useFeedback";
import { ThumbsUp, ThumbsDown, Minus, UserX, Check, FileText } from "lucide-react";
import { useRouter } from "next/navigation";

interface FeedbackTabProps {
  meeting: Meeting;
  feedbackState: UseFeedbackReturn;
  updateMeeting: (id: string, data: Record<string, unknown>) => Promise<void>;
}

const OUTCOMES = [
  ["POSITIVE", "Positif", ThumbsUp, "var(--green)", "var(--greenLight)"],
  ["NEUTRAL", "Neutre", Minus, "var(--amber)", "var(--amberLight)"],
  ["NEGATIVE", "Négatif", ThumbsDown, "var(--red)", "var(--redLight)"],
  ["NO_SHOW", "Absent", UserX, "var(--ink3)", "var(--surface2)"],
] as const;

const RECONTACT = [
  ["YES", "Oui"],
  ["NO", "Non"],
  ["MAYBE", "À rediscuter"],
] as const;

export function FeedbackTab({ meeting, feedbackState, updateMeeting }: FeedbackTabProps) {
  const router = useRouter();
  const {
    feedbackOutcome,
    setFeedbackOutcome,
    feedbackRecontact,
    setFeedbackRecontact,
    feedbackNote,
    setFeedbackNote,
    saveFeedback,
  } = feedbackState;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 12 }}>Résultat du RDV</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {OUTCOMES.map(([key, label, Icon, color, bg]) => (
            <button
              key={key}
              onClick={() => setFeedbackOutcome(key)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: `1.5px solid ${feedbackOutcome === key ? color : "var(--border2)"}`,
                background: feedbackOutcome === key ? bg : "var(--surface)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "all 0.12s",
              }}
            >
              <Icon size={16} style={{ color }} />
              <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 10 }}>Recontact</div>
        <div style={{ display: "flex", gap: 8 }}>
          {RECONTACT.map(([key, label]) => (
            <button
              key={key}
              className="rdv-pill"
              onClick={() => setFeedbackRecontact(key)}
              style={{
                cursor: "pointer",
                padding: "8px 18px",
                fontSize: 13,
                background: feedbackRecontact === key ? "var(--accentLight)" : "var(--surface2)",
                color: feedbackRecontact === key ? "var(--accent)" : "var(--ink3)",
                border: `1px solid ${feedbackRecontact === key ? "var(--accent)" : "transparent"}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 10 }}>Commentaire</div>
        <textarea
          className="rdv-input"
          style={{ width: "100%", minHeight: 120, resize: "vertical" }}
          value={feedbackNote}
          onChange={(e) => setFeedbackNote(e.target.value)}
          placeholder="Ajouter un commentaire sur le RDV…"
        />
      </div>

      <button
        className="rdv-btn rdv-btn-primary"
        style={{ width: "100%", justifyContent: "center", padding: "12px 0", fontSize: 14 }}
        onClick={() => saveFeedback(meeting, updateMeeting)}
      >
        <Check size={15} /> Enregistrer le feedback
      </button>

      {meeting.feedback?.outcome === "POSITIVE" && meeting.client?.id && (
        <button
          className="rdv-btn rdv-btn-ghost"
          style={{ width: "100%", justifyContent: "center", padding: "10px 0", fontSize: 13, marginTop: 4 }}
          onClick={() => router.push(`/manager/clients/${meeting.client!.id}?tab=sessions`)}
        >
          <FileText size={14} /> Créer une session depuis ce RDV
        </button>
      )}
    </div>
  );
}
