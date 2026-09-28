import { HrMonthStatus } from "@prisma/client";
import { STATUS_LABELS, formatDayKey, formatEuros, formatMonthLabel } from "./hr-rules";

export interface HrAuditEntry {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  actorName: string | null;
  createdAt: string;
}

export type AuditTone = "slate" | "indigo" | "emerald" | "amber" | "rose";

function statusLabel(v: unknown) {
  return typeof v === "string" && v in STATUS_LABELS ? STATUS_LABELS[v as HrMonthStatus] : "?";
}

function money(v: unknown) {
  return typeof v === "number" ? formatEuros(v) : null;
}

function month(v: unknown) {
  return typeof v === "string" && /^\d{4}-\d{2}$/.test(v) ? formatMonthLabel(v) : null;
}

/** Plain-French sentence for one audit log line. */
export function describeAuditEntry(entry: HrAuditEntry): { title: string; detail?: string; tone: AuditTone } {
  const d = entry.details ?? {};
  switch (entry.action) {
    case "PROFILE_CREATED":
      return { title: "Règles de paie créées", detail: [money(d.fixedSalaryCents) && `fixe ${money(d.fixedSalaryCents)}`, money(d.variablePerRdvCents) && `${money(d.variablePerRdvCents)} / RDV`, typeof d.dailyQuota === "number" && `objectif ${d.dailyQuota} appels/j`].filter(Boolean).join(" · "), tone: "indigo" };
    case "PROFILE_UPDATED": {
      const prev = (d.previous ?? {}) as Record<string, unknown>;
      const cur = (d.current ?? {}) as Record<string, unknown>;
      const changes = [
        prev.fixedSalaryCents !== cur.fixedSalaryCents && `fixe ${money(prev.fixedSalaryCents)} → ${money(cur.fixedSalaryCents)}`,
        prev.variablePerRdvCents !== cur.variablePerRdvCents && `prime ${money(prev.variablePerRdvCents)} → ${money(cur.variablePerRdvCents)}`,
        prev.dailyQuota !== cur.dailyQuota && `objectif ${prev.dailyQuota} → ${cur.dailyQuota} appels/j`,
        prev.remunerationMode !== cur.remunerationMode && "mode de rémunération",
        prev.contractType !== cur.contractType && "type de contrat",
      ].filter(Boolean);
      const reason = typeof d.reason === "string" && d.reason ? ` — « ${d.reason} »` : "";
      return { title: "Règles de paie modifiées", detail: (changes.length ? changes.join(" · ") : "aucun montant modifié") + reason, tone: "indigo" };
    }
    case "MONTH_CALCULATED":
    case "MONTH_RECALCULATED":
      return {
        title: `${month(d.month) ?? "Mois"} ${entry.action === "MONTH_CALCULATED" ? "calculé" : "recalculé"}`,
        detail: [money(d.totalAmountCents), typeof d.totalCalls === "number" && `${d.totalCalls} appels`, typeof d.totalRdv === "number" && `${d.totalRdv} RDV`].filter(Boolean).join(" · "),
        tone: "slate",
      };
    case "MONTH_REOPENED":
      return { title: `${month(d.month) ?? "Mois"} rouvert et recalculé`, detail: money(d.totalAmountCents) ?? undefined, tone: "amber" };
    case "STATUS_CHANGED": {
      const adj =
        typeof d.adjustmentCents === "number" && d.adjustmentCents !== d.previousAdjustmentCents
          ? ` · ajustement ${money(d.adjustmentCents)}${typeof d.adjustmentNote === "string" && d.adjustmentNote ? ` (« ${d.adjustmentNote} »)` : ""}`
          : "";
      const same = d.previousStatus === d.newStatus;
      return {
        title: same ? "Ajustement modifié" : `Étape : ${statusLabel(d.previousStatus)} → ${statusLabel(d.newStatus)}`,
        detail: adj.replace(/^ · /, "") || undefined,
        tone: d.newStatus === "PAID" ? "emerald" : d.newStatus === "VALIDATED" ? "indigo" : "slate",
      };
    }
    case "DAY_DECISION": {
      const date = typeof d.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? formatDayKey(d.date, { weekday: "long", day: "numeric", month: "long" }) : "une journée";
      const paid = d.decision === "PAID";
      return {
        title: `Journée du ${date} : ${paid ? "payée" : "non payée"}`,
        detail: typeof d.reason === "string" ? `« ${d.reason} »` : undefined,
        tone: paid ? "emerald" : "rose",
      };
    }
    default:
      return { title: entry.action, tone: "slate" };
  }
}
