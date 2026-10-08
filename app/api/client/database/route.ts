import { clientVisibleActionWhere } from "@/lib/meetings/clientVisibility";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";
import { buildStatusVocabulary, loadMissionStatuses } from "@/lib/prospection-export/load";
import { buildRows, indexActions } from "@/lib/prospection-export/rows";
import { buildStageResolver, buildWeeklyActivity, companyRollup, toPortalTreatment } from "@/lib/prospection-export/portal";
import { EMPTY_FILTERS, type ExportAction, type ExportCompany } from "@/lib/prospection-export/types";
import type { PortalCompany, PortalContact, PortalDatabaseResponse, PortalTreatment } from "@/lib/prospection-export/portal-types";

// ============================================
// GET /api/client/database
// Every company/contact of the client's visible missions (all lists, archived
// included), each with its stage and progress — the same numbers as the
// manager's prospection export, computed by the same rows.ts logic — plus a
// weekly activity series. Loads only what the page shows; per-company history
// is fetched lazily by /api/client/database/[companyId].
// ============================================

function toChannel(value: string): ExportAction["channel"] {
    return value === "EMAIL" || value === "LINKEDIN" ? value : "CALL";
}

type MissionRef = {
    id: string;
    name: string;
    defaultInterlocuteurId: string | null;
    lists: {
        id: string;
        name: string;
        isArchived: boolean;
        commercialInterlocuteurId: string | null;
        secondaryCommercialIds: string[];
    }[];
};

/** List's primary + secondary commercials, else the mission default — active ones only. */
function listCommercials(mission: MissionRef, activeIds: Set<string>): Map<string, string[]> {
    const fallback = mission.defaultInterlocuteurId && activeIds.has(mission.defaultInterlocuteurId)
        ? [mission.defaultInterlocuteurId]
        : [];
    return new Map(mission.lists.map((l) => {
        const own = [...new Set([l.commercialInterlocuteurId, ...l.secondaryCommercialIds])]
            .filter((id): id is string => !!id && activeIds.has(id));
        return [l.id, own.length > 0 ? own : fallback];
    }));
}

async function loadMission(
    mission: MissionRef,
    activeCommercialIds: Set<string>
): Promise<{ companies: PortalCompany[]; actions: ExportAction[] }> {
    const listIds = mission.lists.map((l) => l.id);
    if (listIds.length === 0) return { companies: [], actions: [] };
    const listNames = new Map(mission.lists.map((l) => [l.id, l.name]));
    const commercialsByList = listCommercials(mission, activeCommercialIds);

    const [companies, actions, statuses] = await Promise.all([
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
                AND: [
                    {
                        OR: [
                            { contact: { company: { listId: { in: listIds } } } },
                            { contactId: null, company: { listId: { in: listIds } } },
                        ],
                    },
                    clientVisibleActionWhere,
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
        loadMissionStatuses(mission.id),
    ]);

    const vocabulary = buildStatusVocabulary(statuses);
    const stageFor = buildStageResolver(statuses);
    const meetingLabel = vocabulary.labelFor("MEETING_BOOKED");

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

    // buildRows yields one line per contact (or one per contact-less company);
    // regroup them under their company.
    const byCompany = new Map<string, { company: ExportCompany; contacts: PortalContact[]; lines: PortalTreatment[] }>();
    for (const row of rows) {
        let entry = byCompany.get(row.company.id);
        if (!entry) {
            entry = { company: row.company, contacts: [], lines: [] };
            byCompany.set(row.company.id, entry);
        }
        const treatment = toPortalTreatment(row.treatment, stageFor, meetingLabel);
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

    const portalCompanies = [...byCompany.values()].map(({ company, contacts, lines }) => ({
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
        listId: company.listId,
        listName: listNames.get(company.listId) ?? "",
        commercialIds: commercialsByList.get(company.listId) ?? [],
        contacts,
        treatment: companyRollup(lines, totalsByCompany.get(company.id)),
    }));

    return { companies: portalCompanies, actions: exportActions };
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    const clientId = (session.user as { clientId?: string | null }).clientId;
    const now = new Date();
    const empty: PortalDatabaseResponse = {
        companies: [],
        lists: [],
        commercials: [],
        exclusions: [],
        activity: buildWeeklyActivity([], now),
        generatedAt: now.toISOString(),
    };

    if (!clientId) return successResponse(empty);

    const [missions, interlocuteurs] = await Promise.all([
        prisma.mission.findMany({
            where: { clientId, AND: [portalVisibleMissionWhere()] },
            select: {
                id: true,
                name: true,
                defaultInterlocuteurId: true,
                lists: {
                    select: {
                        id: true,
                        name: true,
                        isArchived: true,
                        commercialInterlocuteurId: true,
                        secondaryCommercialIds: true,
                    },
                    orderBy: { createdAt: "desc" },
                },
            },
            orderBy: { name: "asc" },
        }),
        prisma.clientInterlocuteur.findMany({
            where: { clientId, isActive: true },
            select: { id: true, firstName: true, lastName: true },
            orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        }),
    ]);
    if (missions.length === 0) return successResponse(empty);

    const activeCommercialIds = new Set(interlocuteurs.map((i) => i.id));
    const loaded = await Promise.all(missions.map((m) => loadMission(m, activeCommercialIds)));
    const companies = loaded.flatMap((m) => m.companies);

    const companyCountByList = new Map<string, number>();
    const usedCommercials = new Set<string>();
    for (const c of companies) {
        companyCountByList.set(c.listId, (companyCountByList.get(c.listId) ?? 0) + 1);
        for (const id of c.commercialIds) usedCommercials.add(id);
    }
    const lists = missions.flatMap((m) => m.lists
        .filter((l) => companyCountByList.has(l.id))
        .map((l) => ({
            id: l.id,
            name: l.name,
            missionName: m.name,
            isArchived: l.isArchived,
            companyCount: companyCountByList.get(l.id) ?? 0,
        })));
    const commercials = interlocuteurs
        .filter((i) => usedCommercials.has(i.id))
        .map((i) => ({ id: i.id, name: [i.firstName, i.lastName].filter(Boolean).join(" ") }));

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
        lists,
        commercials,
        exclusions: exclusions.map((e) => ({
            id: e.id,
            reason: e.reason,
            target: e.target,
            createdAt: e.createdAt.toISOString(),
            expiresAt: e.expiresAt?.toISOString() ?? null,
        })),
        activity: buildWeeklyActivity(loaded.flatMap((m) => m.actions), now),
        generatedAt: now.toISOString(),
    };
    return successResponse(body);
});
