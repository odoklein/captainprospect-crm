import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/api-utils";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

// ============================================
// GET /api/lists/[id]/export
// Export list to CSV
// ============================================

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // getAuthSession(request) (not getServerSession) so a deactivated / force-logged-out
        // user is rejected here too — see sessionFromToken in lib/auth.ts.
        const session = await getAuthSession(request);

        if (!session?.user?.id) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const allowedRoles = ["MANAGER", "ADMIN", "CLIENT"];
        if (!allowedRoles.includes(session.user?.role as string)) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { id } = await params;

        const list = await prisma.list.findUnique({
            where: { id },
            include: { mission: { select: { clientId: true } } },
        });

        if (!list) {
            return new NextResponse("List not found", { status: 404 });
        }

        // CLIENT can only export lists from missions belonging to their client
        if (session.user.role === "CLIENT") {
            const clientId = (session.user as { clientId?: string })?.clientId;
            if (!clientId || list.mission.clientId !== clientId) {
                return new NextResponse("Unauthorized", { status: 403 });
            }
        }

        const companies = await prisma.company.findMany({
            where: { listId: id },
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
        });

        const escape = (v: string | number | boolean | null | undefined) =>
            `"${(v ?? "").toString().replace(/"/g, '""')}"`;

        const headers = [
            "Entreprise", "Industrie", "Pays", "Site web", "Taille", "Tél. société",
            "Statut entreprise",
            "Contact", "Prénom", "Nom", "Titre", "Email", "Téléphone", "LinkedIn",
            "Emails additionnels", "Téléphones additionnels",
            "Statut contact",
            "Opportunité", "Besoin opportunité", "Note opportunité", "Urgence", "Est. min (€)", "Est. max (€)", "Transmis",
            "Résultat dernière action", "Note dernière action", "Date dernière action",
        ];
        const rows: string[] = [headers.map((h) => escape(h)).join(",")];

        for (const company of companies) {
            const companyBase = [
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

        const csv = "\ufeff" + rows.join("\n");
        const filename = `${list.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.csv`;

        audit(request, session, {
            action: AUDIT_ACTIONS.EXPORT,
            entityType: "List",
            entityId: id,
            summary: `Export CSV liste "${list.name}" — ${rows.length - 1} ligne(s)`,
            metadata: {
                rowCount: rows.length - 1,
                companies: companies.length,
                format: "csv",
                missionClientId: list.mission.clientId,
                filename,
            },
        });

        return new NextResponse(csv, {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        });

    } catch (error) {
        console.error("Export error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
