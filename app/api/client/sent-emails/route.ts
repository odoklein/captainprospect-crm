import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    requireRole,
    withErrorHandler,
} from "@/lib/api-utils";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";

// ============================================
// GET /api/client/sent-emails
// Emails sent for the logged-in client's missions (or from their own mailbox),
// with filters, stats and open/click counts.
// ?format=csv exports the filtered list (capped at CSV_MAX rows).
//
// Every filter is ANDed onto the client scope: the scope is never replaced
// (a status/search filter used to overwrite the OR and leak other clients' rows).
// ============================================

const CSV_MAX = 5000;

const STATUS_LABEL: Record<string, string> = {
    SENT: "Envoyé",
    DELIVERED: "Délivré",
    OPENED: "Ouvert",
    CLICKED: "Cliqué",
    REPLIED: "Répondu",
    BOUNCED: "Rebond",
    FAILED: "Échoué",
};

function csvCell(value: unknown): string {
    const s = value === null || value === undefined ? "" : String(value);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function frDateTime(d: Date | null): string {
    if (!d) return "";
    return d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");

    // Find client record
    const clientUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { clientId: true },
    });

    if (!clientUser?.clientId) {
        if (format === "csv") {
            return new NextResponse("﻿", { headers: { "Content-Type": "text/csv; charset=utf-8" } });
        }
        return successResponse({
            emails: [],
            stats: null,
            pagination: { total: 0, page: 1, limit: 25, totalPages: 0, hasMore: false },
        });
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const skip = (page - 1) * limit;
    const sortBy = searchParams.get("sortBy") || "sentAt";
    const sortOrder = (searchParams.get("sortOrder") === "asc" ? "asc" : "desc") as "asc" | "desc";
    const includeStats = searchParams.get("includeStats") === "true";

    // Filters
    const missionId = searchParams.get("missionId") || undefined;
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search")?.trim() || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const hasOpened = searchParams.get("hasOpened") || undefined;
    const hasClicked = searchParams.get("hasClicked") || undefined;

    const visibleMission = {
        clientId: clientUser.clientId,
        AND: [portalVisibleMissionWhere()],
    };

    const and: Record<string, unknown>[] = [
        { direction: "OUTBOUND" },
        { status: { not: "DRAFT" } },
        missionId
            ? { missionId, mission: visibleMission }
            : { OR: [{ mission: visibleMission }, { mailbox: { ownerId: session.user.id } }] },
    ];

    if (status === "OPENED") and.push({ status: { in: ["OPENED", "CLICKED", "REPLIED"] } });
    else if (status) and.push({ status });

    if (hasOpened === "true") and.push({ openCount: { gt: 0 } });
    if (hasOpened === "false") and.push({ openCount: 0 });
    if (hasClicked === "true") and.push({ clickCount: { gt: 0 } });
    if (hasClicked === "false") and.push({ clickCount: 0 });

    if (dateFrom || dateTo) {
        and.push({
            sentAt: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo ? { lte: new Date(dateTo + "T23:59:59") } : {}),
            },
        });
    }

    if (search) {
        and.push({
            OR: [
                { subject: { contains: search, mode: "insensitive" } },
                { toAddresses: { hasSome: [search, search.toLowerCase()] } },
                { contact: { firstName: { contains: search, mode: "insensitive" } } },
                { contact: { lastName: { contains: search, mode: "insensitive" } } },
                { contact: { email: { contains: search, mode: "insensitive" } } },
                { contact: { company: { name: { contains: search, mode: "insensitive" } } } },
            ],
        });
    }

    const where = { AND: and };

    const validSortFields: Record<string, unknown> = {
        sentAt: { sentAt: sortOrder },
        subject: { subject: sortOrder },
        openCount: { openCount: sortOrder },
        clickCount: { clickCount: sortOrder },
        status: { status: sortOrder },
    };
    const orderBy = validSortFields[sortBy] || { sentAt: "desc" };

    const select = {
        id: true,
        subject: true,
        toAddresses: true,
        sentAt: true,
        openCount: true,
        clickCount: true,
        firstOpenedAt: true,
        lastOpenedAt: true,
        status: true,
        contact: {
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                company: { select: { id: true, name: true } },
            },
        },
        mission: { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
        sentBy: { select: { id: true, name: true } },
    } as const;

    // ---------- CSV export ----------
    if (format === "csv") {
        const rows = await prisma.email.findMany({ where, orderBy, take: CSV_MAX, select });
        const header = ["Date d'envoi", "Destinataire", "Email", "Société", "Objet", "Mission", "Statut", "Ouvertures", "Première ouverture", "Clics", "Envoyé par"];
        const lines = rows.map((e) => {
            const name = e.contact ? [e.contact.firstName, e.contact.lastName].filter(Boolean).join(" ") : "";
            return [
                frDateTime(e.sentAt),
                name,
                e.contact?.email || e.toAddresses[0] || "",
                e.contact?.company?.name ?? "",
                e.subject ?? "",
                e.mission?.name ?? "",
                STATUS_LABEL[e.status] ?? e.status,
                e.openCount,
                frDateTime(e.firstOpenedAt),
                e.clickCount,
                e.sentBy?.name ?? "",
            ].map(csvCell).join(";");
        });
        const csv = "﻿" + [header.map(csvCell).join(";"), ...lines].join("\r\n");
        const day = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
        return new NextResponse(csv, {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="emails-envoyes-${day}.csv"`,
                "Cache-Control": "no-store",
                "X-Export-Capped": String(rows.length >= CSV_MAX),
            },
        });
    }

    const [emails, total] = await Promise.all([
        prisma.email.findMany({ where, orderBy, skip, take: limit, select }),
        prisma.email.count({ where }),
    ]);

    // Compute stats if requested
    let stats = null;
    if (includeStats) {
        const [statusCounts, totalOpened, totalClicked] = await Promise.all([
            prisma.email.groupBy({ by: ["status"], where, _count: { id: true } }),
            prisma.email.count({ where: { AND: [...and, { openCount: { gt: 0 } }] } }),
            prisma.email.count({ where: { AND: [...and, { clickCount: { gt: 0 } }] } }),
        ]);
        const byStatus: Record<string, number> = {};
        statusCounts.forEach((s) => { byStatus[s.status] = s._count.id; });

        const totalSent = total;
        stats = {
            totalSent,
            totalOpened,
            totalClicked,
            totalReplied: byStatus["REPLIED"] || 0,
            totalBounced: byStatus["BOUNCED"] || 0,
            openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
            clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
            replyRate: totalSent > 0 ? Math.round(((byStatus["REPLIED"] || 0) / totalSent) * 100) : 0,
        };
    }

    return successResponse({
        emails,
        stats,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasMore: page * limit < total,
        },
    });
});
