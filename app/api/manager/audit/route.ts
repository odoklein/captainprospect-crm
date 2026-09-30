import { NextRequest, NextResponse } from "next/server";
import {
    requireRole,
    successResponse,
    errorResponse,
    withErrorHandler,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { audit, AUDIT_ACTIONS, listAuditEvents } from "@/lib/audit";

// ============================================
// GET /api/manager/audit
// Unified audit trail (who did what). MANAGER / DEVELOPER only.
// Query: actorId, action, entityType, entityId, from, to (YYYY-MM-DD), limit, offset
//        format=csv → download (capped at CSV_MAX_ROWS); the export is itself audited.
// ============================================

const CSV_MAX_ROWS = 5000;

function parseDay(value: string | null, endOfDay: boolean): Date | undefined {
    if (!value) return undefined;
    const d = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
    return isNaN(d.getTime()) ? undefined : d;
}

function csvCell(value: unknown): string {
    const s = value == null ? "" : String(value);
    // Neutralize spreadsheet formula injection (a leading = + - @ is executed by Excel/Sheets).
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER", "DEVELOPER"], request);
    const { searchParams } = new URL(request.url);

    const from = parseDay(searchParams.get("from"), false);
    const to = parseDay(searchParams.get("to"), true);
    if ((searchParams.get("from") && !from) || (searchParams.get("to") && !to)) {
        return errorResponse("Dates invalides (format AAAA-MM-JJ)", 400);
    }

    const filters = {
        actorId: searchParams.get("actorId") || undefined,
        action: searchParams.get("action") || undefined,
        entityType: searchParams.get("entityType") || undefined,
        entityId: searchParams.get("entityId") || undefined,
        from,
        to,
    };

    if (searchParams.get("format") === "csv") {
        const { events, total } = await listAuditEvents({ ...filters, limit: CSV_MAX_ROWS, offset: 0 });

        const header = ["Date", "Acteur", "Email", "Rôle", "Action", "Type", "ID", "Résumé", "IP"];
        const lines = [header.map(csvCell).join(",")];
        for (const e of events) {
            lines.push(
                [
                    e.createdAt.toISOString(),
                    e.actor?.name ?? "",
                    e.actor?.email ?? "",
                    e.actorRole ?? "",
                    e.action,
                    e.entityType,
                    e.entityId ?? "",
                    e.summary,
                    e.ip ?? "",
                ]
                    .map(csvCell)
                    .join(",")
            );
        }

        audit(request, session, {
            action: AUDIT_ACTIONS.EXPORT,
            entityType: "AuditLog",
            summary: `Export CSV du journal d'audit — ${events.length} ligne(s)`,
            metadata: {
                rowCount: events.length,
                totalMatching: total,
                truncatedAtLimit: total > CSV_MAX_ROWS,
                filters: Object.fromEntries(searchParams.entries()),
            },
        });

        const filename = `journal-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        return new NextResponse("﻿" + lines.join("\r\n"), {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    }

    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

    const [{ events, total }, actions, entityTypes, actorGroups] = await Promise.all([
        listAuditEvents({ ...filters, limit, offset }),
        prisma.auditEvent.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
        prisma.auditEvent.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
        prisma.auditEvent.groupBy({ by: ["actorId"], where: { actorId: { not: null } } }),
    ]);

    const actorIds = actorGroups.map((g) => g.actorId).filter((v): v is string => !!v);
    const actors = actorIds.length
        ? await prisma.user.findMany({
              where: { id: { in: actorIds } },
              select: { id: true, name: true, role: true },
              orderBy: { name: "asc" },
          })
        : [];

    return successResponse({
        events,
        total,
        limit,
        offset,
        facets: {
            actions: actions.map((a) => a.action),
            entityTypes: entityTypes.map((e) => e.entityType),
            actors,
        },
    });
});
