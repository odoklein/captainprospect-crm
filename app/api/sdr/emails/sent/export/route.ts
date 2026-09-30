// ============================================
// GET /api/sdr/emails/sent/export
// Export sent emails as CSV with all filters applied
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/api-utils";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
    try {
        // getAuthSession(req) (not getServerSession) so a deactivated / force-logged-out
        // user is rejected here too — see sessionFromToken in lib/auth.ts.
        const session = await getAuthSession(req);
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: "Non autorisé" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(req.url);

        // Filters (same as main route)
        const missionId = searchParams.get("missionId")?.trim() || null;
        const status = searchParams.get("status")?.trim() || null;
        const templateId = searchParams.get("templateId")?.trim() || null;
        const search = searchParams.get("search")?.trim() || null;
        const dateFrom = searchParams.get("dateFrom")?.trim() || null;
        const dateTo = searchParams.get("dateTo")?.trim() || null;
        const hasOpened = searchParams.get("hasOpened");
        const hasClicked = searchParams.get("hasClicked");

        // Build where clause
        const where: Prisma.EmailWhereInput = {
            direction: "OUTBOUND",
            sentById: session.user.id,
        };

        if (missionId) where.missionId = missionId;
        if (status) where.status = status as Prisma.EmailWhereInput["status"];
        if (templateId) where.templateId = templateId;

        if (dateFrom || dateTo) {
            where.sentAt = {};
            if (dateFrom) (where.sentAt as Prisma.DateTimeNullableFilter).gte = new Date(dateFrom);
            if (dateTo) {
                const endDate = new Date(dateTo);
                endDate.setHours(23, 59, 59, 999);
                (where.sentAt as Prisma.DateTimeNullableFilter).lte = endDate;
            }
        }

        if (hasOpened === "true") where.openCount = { gt: 0 };
        else if (hasOpened === "false") where.openCount = 0;

        if (hasClicked === "true") where.clickCount = { gt: 0 };
        else if (hasClicked === "false") where.clickCount = 0;

        if (search) {
            where.OR = [
                { subject: { contains: search, mode: "insensitive" } },
                { contact: { firstName: { contains: search, mode: "insensitive" } } },
                { contact: { lastName: { contains: search, mode: "insensitive" } } },
                { contact: { email: { contains: search, mode: "insensitive" } } },
            ];
        }

        // Limit export to 5000 rows
        const emails = await prisma.email.findMany({
            where,
            orderBy: { sentAt: "desc" },
            take: 5000,
            include: {
                contact: {
                    select: {
                        firstName: true,
                        lastName: true,
                        email: true,
                        company: { select: { name: true } },
                    },
                },
                mission: { select: { name: true } },
                template: { select: { name: true } },
                sequenceStep: {
                    select: {
                        order: true,
                        sequence: { select: { name: true } },
                    },
                },
            },
        });

        // Build CSV
        const headers = [
            "Date d'envoi",
            "Sujet",
            "Contact",
            "Email",
            "Société",
            "Mission",
            "Template",
            "Séquence",
            "Statut",
            "Ouvertures",
            "Clics",
            "Première ouverture",
            "Dernière ouverture",
        ];

        const formatDate = (d: Date | null) => {
            if (!d) return "";
            return new Date(d).toLocaleString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        };

        const escCsv = (val: string | null | undefined) => {
            if (!val) return "";
            const s = val.replace(/"/g, '""');
            return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
        };

        const statusLabels: Record<string, string> = {
            DRAFT: "Brouillon",
            QUEUED: "En file",
            SENDING: "En cours",
            SENT: "Envoyé",
            DELIVERED: "Délivré",
            OPENED: "Ouvert",
            CLICKED: "Cliqué",
            REPLIED: "Répondu",
            BOUNCED: "Rebond",
            FAILED: "Échoué",
        };

        const rows = emails.map((e) => [
            formatDate(e.sentAt),
            escCsv(e.subject),
            escCsv([e.contact?.firstName, e.contact?.lastName].filter(Boolean).join(" ")),
            escCsv(e.contact?.email),
            escCsv(e.contact?.company?.name),
            escCsv(e.mission?.name),
            escCsv(e.template?.name),
            escCsv(e.sequenceStep?.sequence?.name ? `${e.sequenceStep.sequence.name} (étape ${e.sequenceStep.order})` : ""),
            statusLabels[e.status] || e.status,
            e.openCount.toString(),
            e.clickCount.toString(),
            formatDate(e.firstOpenedAt),
            formatDate(e.lastOpenedAt),
        ]);

        const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
        const bom = "\uFEFF"; // UTF-8 BOM for Excel

        return new NextResponse(bom + csv, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="emails-envoyes-${new Date().toISOString().slice(0, 10)}.csv"`,
            },
        });
    } catch (error) {
        console.error("GET /api/sdr/emails/sent/export error:", error);
        return NextResponse.json(
            { success: false, error: "Erreur serveur" },
            { status: 500 }
        );
    }
}
