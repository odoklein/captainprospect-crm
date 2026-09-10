import { NextRequest, NextResponse } from "next/server";
import { requireRole, withErrorHandler } from "@/lib/api-utils";
import { getStaffingOverview, type CoverageStatus } from "@/lib/staffing/clientStaffing";

function csvCell(value: string): string {
    // Quote if the value contains a comma, quote or newline; escape embedded quotes
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
}

const COVERAGE_LABEL: Record<CoverageStatus, string> = {
    COVERED: "Couvert",
    UPCOMING: "À venir (planifié plus tard ce mois)",
    ASSIGNED_NOT_SCHEDULED: "Assigné mais non planifié",
    MISSING: "Manquant",
};

/**
 * GET /api/manager/dashboard-projet/export
 * Same staffing overview as the dashboard, flattened to CSV.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const { rows } = await getStaffingOverview();

    const header = [
        "Client", "Mission", "Canal", "Statut mission",
        "Jours/semaine", "Jours/semaine (suggéré)",
        "Bookers historiques", "Bookers actuels", "Couverture", "Effectif manquant",
    ];
    const lines = [header.map(csvCell).join(",")];
    for (const r of rows) {
        lines.push([
            r.clientName,
            r.missionName,
            r.channel,
            r.status,
            r.contractedDaysPerWeek != null ? String(r.contractedDaysPerWeek) : "",
            r.suggestedDaysPerWeek != null ? String(r.suggestedDaysPerWeek) : "",
            r.historicalBookers.map((b) => b.name + (b.assignedOnly ? " (assigné, pas d'appel)" : "")).join(" / "),
            r.currentBookers.map((b) => b.name).join(" / "),
            COVERAGE_LABEL[r.coverageStatus],
            r.missingHeadcount ? "OUI" : "NON",
        ].map(csvCell).join(","));
    }

    // BOM so Excel opens accented characters correctly
    const csv = "﻿" + lines.join("\r\n");
    const filename = `dashboard-projet-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
        },
    });
});
