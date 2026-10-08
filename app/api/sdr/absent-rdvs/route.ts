import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, requireRole, withErrorHandler } from "@/lib/api-utils";

// ============================================
// GET /api/sdr/absent-rdvs
// "Les absents à traiter": the absent RDVs booked by the current SDR that are
// still theirs to call back, across every list and mission.
//
// Same rules as the call queue (lib/sdr-queue/absent-rdv.ts): recontact asked
// (YES / MAYBE), not set aside by a manager, RDV not replaced/cancelled, and
// the booking still the last thing logged on the prospect. On top of that the
// mission must still be running: once it is stopped (paused, completed,
// archived) its absences leave the SDR's board along with the call queue.
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["SDR", "BUSINESS_DEVELOPER", "BOOKER"], request);

    const rows = await prisma.action.findMany({
        where: {
            sdrId: session.user.id,
            result: "MEETING_BOOKED",
            meetingFeedback: {
                is: {
                    outcome: "NO_SHOW",
                    recontactRequested: { in: ["YES", "MAYBE"] },
                    standByAt: null,
                    outOfScopeAt: null,
                },
            },
            campaign: { is: { mission: { is: { isActive: true } } } },
        },
        orderBy: { callbackDate: "asc" },
        take: 200,
        select: {
            id: true,
            createdAt: true,
            callbackDate: true,
            contactId: true,
            companyId: true,
            campaignId: true,
            meetingFeedback: { select: { recontactRequested: true, clientNote: true } },
            contact: {
                select: {
                    id: true, firstName: true, lastName: true, title: true,
                    email: true, phone: true, linkedin: true, status: true,
                    company: { select: { id: true, name: true, industry: true, website: true, country: true, phone: true } },
                },
            },
            company: { select: { id: true, name: true, industry: true, website: true, country: true, phone: true } },
            campaign: { select: { mission: { select: { id: true, name: true, channels: true } } } },
        },
    });

    // The booking must still be the last action on the prospect: anything logged
    // after it (a call back, a new RDV) means the absence has been dealt with.
    const newer = rows.length
        ? await prisma.action.findMany({
            where: {
                OR: rows.map((r) => ({
                    ...(r.contactId ? { contactId: r.contactId } : { companyId: r.companyId, contactId: null }),
                    createdAt: { gt: r.createdAt },
                })),
            },
            select: { contactId: true, companyId: true },
        })
        : [];
    const handledContacts = new Set(newer.filter((a) => a.contactId).map((a) => a.contactId as string));
    const handledCompanies = new Set(newer.filter((a) => !a.contactId).map((a) => a.companyId));

    const items = rows
        .filter((r) => !(r.contactId ? handledContacts.has(r.contactId) : handledCompanies.has(r.companyId)))
        .map((r) => {
            const company = r.contact?.company ?? r.company;
            const mission = r.campaign?.mission;
            if (!company) return null;
            return {
                actionId: r.id,
                contactId: r.contactId,
                companyId: company.id,
                contact: r.contact
                    ? {
                        id: r.contact.id,
                        firstName: r.contact.firstName,
                        lastName: r.contact.lastName,
                        title: r.contact.title,
                        email: r.contact.email,
                        phone: r.contact.phone,
                        linkedin: r.contact.linkedin,
                        status: r.contact.status,
                    }
                    : null,
                company: {
                    id: company.id,
                    name: company.name,
                    industry: company.industry,
                    website: company.website,
                    country: company.country,
                    phone: company.phone || null,
                },
                campaignId: r.campaignId,
                channel: mission?.channels?.[0] ?? "CALL",
                missionId: mission?.id ?? null,
                missionName: mission?.name ?? "",
                priority: "ABSENT_RDV",
                rdvDate: r.callbackDate?.toISOString() ?? null,
                recontact: r.meetingFeedback?.recontactRequested ?? "YES",
                clientNote: r.meetingFeedback?.clientNote ?? null,
            };
        })
        .filter((i): i is NonNullable<typeof i> => i !== null)
        // Client wants a call back first, then the oldest (the one going cold).
        .sort((a, b) => (a.recontact === "YES" ? 0 : 1) - (b.recontact === "YES" ? 0 : 1));

    return successResponse({ items });
});
