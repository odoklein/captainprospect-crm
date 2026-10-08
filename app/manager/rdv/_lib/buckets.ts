import type { CSSProperties } from "react";
import { classifyRdv, type RdvBucket } from "@/lib/rdv/overview";
import type { Meeting } from "../_types";

export interface BucketMeta {
  label: string;
  /** Singular, for a single row of the list. */
  rowLabel: string;
  color: string;
  hint: string;
}

// Colour by state, checked with the dataviz validator for adjacent separation.
// "Left the pipeline" buckets are deliberately recessive greys.
export const BUCKET_META: Record<RdvBucket, BucketMeta> = {
  upcoming_confirmed: { label: "Confirmés", rowLabel: "À venir", color: "var(--accent)", hint: "À venir, validés au SAS" },
  upcoming_pending: { label: "En attente SAS", rowLabel: "À venir", color: "var(--amber)", hint: "À venir, pas encore validés" },
  positive: { label: "Positifs", rowLabel: "Positif", color: "var(--green)", hint: "Réalisés, retour positif" },
  neutral: { label: "Neutres", rowLabel: "Neutre", color: "var(--blue)", hint: "Réalisés, retour neutre" },
  negative: { label: "Négatifs", rowLabel: "Négatif", color: "var(--red)", hint: "Réalisés, retour négatif" },
  no_show: { label: "Absents", rowLabel: "Absent", color: "var(--ink2)", hint: "Le prospect ne s'est pas présenté" },
  no_feedback: { label: "Sans retour", rowLabel: "Sans retour", color: "var(--ink4)", hint: "Date passée, aucun retour renseigné" },
  rejected: { label: "Rejetés SAS", rowLabel: "Rejeté SAS", color: "color-mix(in oklab, var(--red) 45%, var(--surface))", hint: "Refusés à la validation SAS" },
  cancelled: { label: "Annulés", rowLabel: "Annulé", color: "var(--ink3)", hint: "RDV annulé" },
  replaced: { label: "Replacés", rowLabel: "Replacé", color: "color-mix(in oklab, var(--ink3) 40%, var(--surface))", hint: "Remplacé par un nouveau RDV" },
};

export function bucketSwatch(bucket: RdvBucket): CSSProperties {
  // "Sans retour" is unknown data: striped so it never reads as a real outcome.
  if (bucket === "no_feedback") {
    return {
      backgroundColor: "var(--surface3)",
      backgroundImage: "repeating-linear-gradient(135deg, var(--ink4) 0 2px, transparent 2px 5px)",
    };
  }
  return { background: BUCKET_META[bucket].color };
}

/** Same classification as the server-side Bilan, for one row of the list. */
export function meetingBucket(m: Meeting, now = new Date()): RdvBucket {
  return classifyRdv(
    {
      result: m.result,
      confirmationStatus: m.confirmationStatus ?? "PENDING",
      callbackDate: m.callbackDate ? new Date(m.callbackDate) : null,
      cancellationReason: m.cancellationReason,
      sdr: null,
      client: null,
      feedback: m.feedback
        ? {
            outcome: m.feedback.outcome,
            standByAt: m.feedback.standByAt ? new Date(m.feedback.standByAt) : null,
            outOfScopeAt: m.feedback.outOfScopeAt ? new Date(m.feedback.outOfScopeAt) : null,
          }
        : null,
    },
    now,
  );
}
