import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    requireRole,
    withErrorHandler,
    AuthError,
    NotFoundError,
} from "@/lib/api-utils";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

// ============================================
// GET /api/client/missions/[id]/export
// Export mission + all lists to CSV (CLIENT only)
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(["CLIENT"], request);
    const { id: missionId } = await params;

    const clientId = (session.user as { clientId?: string })?.clientId;
    if (!clientId) {
        throw new AuthError("Accès non autorisé", 403);
    }

    const mission = await prisma.mission.findUnique({
        where: { id: missionId },
        include: {
            client: { select: { id: true } },
            lists: {
                include: {
                    companies: {
                        include: {
                            contacts: {
                                include: {
                                    opportunities: { take: 1 },
                                    actions: {
                                        orderBy: { createdAt: "desc" },
                                        take: 1,
                                        select: { note: true, result: true, createdAt: true },
                                    },
                                },
                            },
                        },
                        orderBy: { name: "asc" },
                    },
                },
                orderBy: { name: "asc" },
            },
        },
    });

    if (!mission) {
        throw new NotFoundError("Mission introuvable");
    }

    if (mission.clientId !== clientId) {
        throw new AuthError("Accès non autorisé à cette mission", 403);
    }

    const escape = (v: string | number | boolean | null | undefined) =>
        `"${(v ?? "").toString().replace(/"/g, '""')}"`;

    const headers = [
        "Mission", "Liste",
        "Entreprise", "Industrie", "Pays", "Site web", "Taille", "Tél. société",
        "Statut entreprise",
        "Contact", "Prénom", "Nom", "Titre", "Email", "Téléphone", "LinkedIn",
        "Emails additionnels", "Téléphones additionnels",
        "Statut contact",
        "Opportunité", "Besoin opportunité", "Note opportunité", "Urgence", "Est. min (€)", "Est. max (€)", "Transmis",
        "Résultat dernière action", "Note dernière action", "Date dernière action",
    ];
    const rows: string[] = [headers.map((h) => escape(h)).join(",")];

    for (const list of mission.lists) {
        for (const company of list.companies) {
            const companyBase = [
                escape(mission.name),
                escape(list.name),
                escape(company.name),
                escape(company.industry),
                escape(company.country),
                escape(company.website),
                escape(company.size),
                escape(company.phone),
                escape(company.status),
            ];

            if (company.contacts.length === 0) {
                const emptyContact = Array(20).fill("").join(",");
                rows.push([...companyBase, emptyContact].join(","));
            } else {
                for (const contact of company.contacts) {
                    const opp = contact.opportunities[0];
                    const lastAction = contact.actions[0];
                    const addPhones = Array.isArray(contact.additionalPhones) ? (contact.additionalPhones as string[]).join("; ") : "";
                    const addEmails = Array.isArray(contact.additionalEmails) ? (contact.additionalEmails as string[]).join("; ") : "";
                    const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || "-";
                    rows.push([
                        ...companyBase,
                        escape(contactName),
                        escape(contact.firstName),
                        escape(contact.lastName),
                        escape(contact.title),
                        escape(contact.email),
                        escape(contact.phone),
                        escape(contact.linkedin),
                        escape(addEmails),
                        escape(addPhones),
                        escape(contact.status),
                        escape(opp ? "Oui" : ""),
                        escape(opp?.needSummary ?? ""),
                        escape(opp?.notes ?? ""),
                        escape(opp?.urgency ?? ""),
                        escape(opp?.estimatedMin ?? ""),
                        escape(opp?.estimatedMax ?? ""),
                        escape(opp?.handedOff ? "Oui" : ""),
                        escape(lastAction?.result ?? ""),
                        escape(lastAction?.note ?? ""),
                        escape(lastAction?.createdAt ? new Date(lastAction.createdAt).toLocaleString("fr-FR") : ""),
                    ].join(","));
                }
            }
        }
    }

    const csv = "\ufeff" + rows.join("\n");
    const filename = `mission_${mission.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_export.csv`;

    audit(request, session, {
        action: AUDIT_ACTIONS.EXPORT,
        entityType: "Mission",
        entityId: missionId,
        summary: `Export CSV mission "${mission.name}" (portail client) — ${rows.length - 1} ligne(s)`,
        metadata: { rowCount: rows.length - 1, lists: mission.lists.length, format: "csv", clientId, filename },
    });

    return new NextResponse(csv, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
        },
    });
});
