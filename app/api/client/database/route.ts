import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";
import { loadStatusVocabulary } from "@/lib/prospection-export/load";
import { buildRows, indexActions } from "@/lib/prospection-export/rows";
import {
    EMPTY_FILTERS,
    UNTREATED_LABEL,
    type ExportAction,
    type ExportCompany,
    type RowTreatment,
} from "@/lib/prospection-export/types";
import type { PortalCompany, PortalContact, PortalDatabaseResponse, PortalTreatment } from "@/lib/prospection-export/portal-types";

// ============================================
// GET /api/client/database
// Every company/contact of the client's visible missions (all lists, archived
// included), each with Captain Prospect's progress on it — the same numbers as
// the manager's prospection export, computed by the same rows.ts logic. Loads
// only what the table shows; the per-company history is fetched lazily by
// /api/client/database/[companyId].
// ============================================

const UNTREATED: PortalTreatment = {
    treated: false,
    lastResult: null,
    lastResultLabel: UNTREATED_LABEL,
    actionCount: 0,
    callCount: 0,
    meetingBooked: false,
    lastActionAt: null,
    nextCallbackAt: null,
    meetingAt: null,
};

function toPortalTreatment(t: RowTreatment): PortalTreatment {
    return {
        treated: t.treated,
        lastResult: t.lastResult,
        lastResultLabel: t.lastResultLabel,
        actionCount: t.actionCount,
        callCount: t.callCount,
        meetingBooked: t.meetingBookedAt !== null,
        lastActionAt: t.lastActionAt?.toISOString() ?? null,
        nextCallbackAt: t.nextCallbackAt?.toISOString() ?? null,
        meetingAt: t.meetingAt?.toISOString() ?? null,
    };
}

/** See PortalCompany.treatment for the rollup rules. */
function companyRollup(
    lines: PortalTreatment[],
    totals: { actionCount: number; callCount: number } | undefined,
    meetingLabel: string
): PortalTreatment {
    let last: PortalTreatment | null = null;
    let meeting: PortalTreatment | null = null;
    let nextCallbackAt: string | null = null;
    for (const t of lines) {
        if (t.lastActionAt && (!last || t.lastActionAt > (last.lastActionAt ?? ""))) last = t;
        if (t.meetingBooked && (!meeting || (t.lastActionAt ?? "") > (meeting.lastActionAt ?? ""))) meeting = t;
        if (t.nextCallbackAt && (!nextCallbackAt || t.nextCallbackAt > nextCallbackAt)) nextCallbackAt = t.nextCallbackAt;
    }
    if (!last) return UNTREATED;
    return {
        treated: true,
        lastResult: meeting ? "MEETING_BOOKED" : last.lastResult,
        lastResultLabel: meeting ? meetingLabel : last.lastResultLabel,
        actionCount: totals?.actionCount ?? 0,
        callCount: totals?.callCount ?? 0,
        meetingBooked: meeting !== null,
        lastActionAt: last.lastActionAt,
        nextCallbackAt,
        meetingAt: meeting?.meetingAt ?? null,
    };
}

function toChannel(value: string): ExportAction["channel"] {
    return value === "EMAIL" || value === "LINKEDIN" ? value : "CALL";
}

async function loadMissionCompanies(mission: {
    id: string;
    name: string;
    lists: { id: string; name: string }[];
}): Promise<PortalCompany[]> {
    const listIds = mission.lists.map((l) => l.id);
    if (listIds.length === 0) return [];
    const listNames = new Map(mission.lists.map((l) => [l.id, l.name]));

    const [companies, actions, vocabulary] = await Promise.all([
        prisma.company.findMany({
            where: { listId: { in: listIds } },
            select: {
                id: true,
                listId: true,
                name: true,
                industry: true,
                country: true,
                size: true,
                phone: true,
                website: true,
                excludedAt: true,
                exclusionId: true,
                contacts: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        title: true,
                        email: true,
                        phone: true,
                        excludedAt: true,
                        exclusionId: true,
                    },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
        prisma.action.findMany({
            where: {
                OR: [
                    { contact: { company: { listId: { in: listIds } } } },
                    { contactId: null, company: { listId: { in: listIds } } },
                ],
            },
            select: {
                id: true,
                contactId: true,
                companyId: true,
                channel: true,
                result: true,
                callbackDate: true,
                meetingType: true,
                createdAt: true,
                contact: { select: { companyId: true } },
            },
            orderBy: { createdAt: "asc" },
        }),
        loadStatusVocabulary(mission.id),
    ]);

    const exportCompanies: ExportCompany[] = companies.map((c) => ({
        ...c,
        customData: null,
        contacts: c.contacts.map((ct) => ({
            ...ct,
            linkedin: null,
            additionalPhones: null,
            additionalEmails: null,
            customData: null,
        })),
    }));
    const exportActions: ExportAction[] = actions.map((a) => ({
        id: a.id,
        contactId: a.contactId,
        ownerCompanyId: a.companyId ?? a.contact?.companyId ?? null,
        channel: toChannel(a.channel),
        result: a.result,
        note: null,
        callSummary: null,
        callbackDate: a.callbackDate,
        duration: null,
        meetingType: a.meetingType,
        createdAt: a.createdAt,
        sdrId: "",
        sdrName: "",
    }));

    const rows = buildRows(exportCompanies, indexActions(exportActions), EMPTY_FILTERS, vocabulary, {
        applyRowFilters: false,
        withHistory: false,
    });

    // Company-level actions are repeated on every contact line, so per-company
    // totals are counted from the actions themselves, not summed from lines.
    const totalsByCompany = new Map<string, { actionCount: number; callCount: number }>();
    for (const a of exportActions) {
        if (!a.ownerCompanyId) continue;
        const t = totalsByCompany.get(a.ownerCompanyId) ?? { actionCount: 0, callCount: 0 };
        t.actionCount++;
        if (a.channel === "CALL") t.callCount++;
        totalsByCompany.set(a.ownerCompanyId, t);
    }
    const meetingLabel = vocabulary.labelFor("MEETING_BOOKED");

    // buildRows yields one line per contact (or one per contact-less company);
    // regroup them under their company.
    const byCompany = new Map<string, { company: ExportCompany; contacts: PortalContact[]; lines: PortalTreatment[] }>();
    for (const row of rows) {
        let entry = byCompany.get(row.company.id);
        if (!entry) {
            entry = { company: row.company, contacts: [], lines: [] };
            byCompany.set(row.company.id, entry);
        }
        const treatment = toPortalTreatment(row.treatment);
        entry.lines.push(treatment);
        if (row.contact) {
            entry.contacts.push({
                id: row.contact.id,
                firstName: row.contact.firstName,
                lastName: row.contact.lastName,
                title: row.contact.title,
                email: row.contact.email,
                phone: row.contact.phone,
                excludedAt: row.contact.excludedAt?.toISOString() ?? null,
                exclusionId: row.contact.exclusionId,
                treatment,
            });
        }
    }

    return [...byCompany.values()].map(({ company, contacts, lines }) => ({
        id: company.id,
        name: company.name,
        industry: company.industry,
        country: company.country,
        size: company.size,
        phone: company.phone,
        website: company.website,
        excludedAt: company.excludedAt?.toISOString() ?? null,
        exclusionId: company.exclusionId,
        missionName: mission.name,
        listName: listNames.get(company.listId) ?? "",
        contacts,
        treatment: companyRollup(lines, totalsByCompany.get(company.id), meetingLabel),
    }));
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    const clientId = (session.user as { clientId?: string | null }).clientId;
    const empty: PortalDatabaseResponse = { companies: [], exclusions: [] };

    if (!clientId) return successResponse(empty);

    const missions = await prisma.mission.findMany({
        where: { clientId, AND: [portalVisibleMissionWhere()] },
        select: { id: true, name: true, lists: { select: { id: true, name: true } } },
    });
    if (missions.length === 0) return successResponse(empty);

    const companies = (await Promise.all(missions.map(loadMissionCompanies))).flat();

    // Attach the reason so the badge can explain itself without a second call.
    const exclusionIds = [
        ...new Set(
            companies
                .flatMap((c) => [c.exclusionId, ...c.contacts.map((ct) => ct.exclusionId)])
                .filter((id): id is string => !!id)
        ),
    ];
    const exclusions = exclusionIds.length
        ? await prisma.exclusion.findMany({
              where: { id: { in: exclusionIds } },
              select: { id: true, reason: true, target: true, createdAt: true, expiresAt: true },
          })
        : [];

    const body: PortalDatabaseResponse = {
        companies,
        exclusions: exclusions.map((e) => ({
            id: e.id,
            reason: e.reason,
            target: e.target,
            createdAt: e.createdAt.toISOString(),
            expiresAt: e.expiresAt?.toISOString() ?? null,
        })),
    };
    return successResponse(body);
});
