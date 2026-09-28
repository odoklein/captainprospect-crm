import type { HrMonthRowData } from "./hr-types";
import { STATUS_LABELS } from "./hr-rules";

// Semicolon + comma decimals + BOM: opens cleanly in French Excel.
const SEP = ";";

function cell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function buildPayrollCsv(rows: HrMonthRowData[], month: string): string {
  const header = [
    "Mois",
    "Nom",
    "Email",
    "Rôle",
    "Contrat",
    "Manager",
    "Étape",
    "Jours payés",
    "Jours ouvrés",
    "Jours d'absence",
    "Appels",
    "RDV",
    "Fixe (€)",
    "Variable (€)",
    "Ajustement (€)",
    "Motif ajustement",
    "Total à payer (€)",
    "Alertes",
  ];

  const lines = rows.map((r) => {
    const alerts = [
      !r.hasProfile && "Règles à configurer",
      r.pendingDecisionCount > 0 && `${r.pendingDecisionCount} j à statuer`,
      r.isStale && "À recalculer",
    ].filter(Boolean);
    return [
      month,
      r.userName,
      r.userEmail,
      r.userRole === "MANAGER" ? "Manager" : r.userRole,
      r.contractType === "SALARIE" ? "Salarié" : "Indépendant",
      r.managerName ?? "",
      r.id ? STATUS_LABELS[r.status] : "Non enregistré",
      r.workingDays,
      r.totalWorkingDays,
      r.absenceDays,
      r.totalCalls,
      r.totalRdv,
      euros(r.fixedAmountCents),
      euros(r.variableAmountCents),
      euros(r.adjustmentCents),
      r.adjustmentNote ?? "",
      euros(r.totalAmountCents),
      alerts.join(", "),
    ]
      .map(cell)
      .join(SEP);
  });

  return "﻿" + [header.map(cell).join(SEP), ...lines].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
