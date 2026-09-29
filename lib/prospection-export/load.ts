/**
 * Database side of the prospection export. Read-only.
 *
 * `detail: "full"` loads everything the file needs (fields, custom data,
 * notes, AI call summaries); `detail: "counts"` loads just enough ids and
 * results to count rows for the export dialog's live preview.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTION_RESULT_LABELS } from "@/lib/types";
import { getEffectiveStatusConfig } from "@/lib/services/StatusConfigService";
import { readImportedAt, readImportMappings } from "./columns";
import type {
    ExportAction,
    ExportChannel,
    ExportCompany,
    ExportList,
    ProspectionExportFilters,
    StatusVocabulary,
} from "./types";

export interface ProspectionExportData {
    mission: { id: string; name: string; clientName: string; channels: ExportChannel[] };
    /** Every list of the mission, newest first. */
    lists: ExportList[];
    /** Lists going into the export, in display order. */
    selectedListIds: string[];
    /** Rows per loaded list: the selection (plus, for the preview, every active list). */
    companiesByList: Map<string, ExportCompany[]>;
    /** Companies per list (all lists, loaded or not). */
    companyCountByList: Map<string, number>;
    /** Actions on the loaded lists that pass the action filters. */
    actions: ExportAction[];
    vocabulary: StatusVocabulary;
    /** exclusionId → reason, for the "Exclu" column. */
    exclusionReasons: Map<string, string>;
    sdrNames: Map<string, string>;
    filters: ProspectionExportFilters;
}

/** Codes that schedule a callback when the mission config does not say otherwise. */
const DEFAULT_CALLBACK_CODES = new Set(["CALLBACK_REQUESTED", "RAPPEL", "RELANCE"]);

export async function loadStatusVocabulary(missionId: string): Promise<StatusVocabulary> {
    const labels = new Map<string, string>();
    const callbacks = new Set<string>();
    const configured = new Set<string>();
    let orderedCodes: string[] = [];
    try {
        const config = await getEffectiveStatusConfig({ missionId });
        const sorted = config.statuses.slice().sort((a, b) => a.sortOrder - b.sortOrder);
        orderedCodes = sorted.map((s) => s.code);
        for (const s of sorted) {
            configured.add(s.code);
            if (s.label) labels.set(s.code, s.label);
            if (s.triggersCallback) callbacks.add(s.code);
        }
    } catch (error) {
        // Labels are cosmetic: fall back to the built-in vocabulary.
        console.error("[prospection-export] status config unavailable:", error);
    }
    return {
        labelFor: (code) => labels.get(code) ?? ACTION_RESULT_LABELS[code] ?? code,
        isCallback: (code) => callbacks.has(code) || (!configured.has(code) && DEFAULT_CALLBACK_CODES.has(code)),
        orderedCodes,
    };
}

function toChannel(value: string): ExportChannel {
    return value === "EMAIL" || value === "LINKEDIN" ? value : "CALL";
}

export async function loadProspectionExportData(
    missionId: string,
    filters: ProspectionExportFilters,
    options: { detail: "full" | "counts" }
): Promise<ProspectionExportData | null> {
    const full = options.detail === "full";

    const mission = await prisma.mission.findUnique({
        where: { id: missionId },
        select: {
            id: true,
            name: true,
            channel: true,
            channels: true,
            client: { select: { name: true } },
            lists: {
                select: {
                    id: true,
                    name: true,
                    source: true,
                    isActive: true,
                    isArchived: true,
                    createdAt: true,
                    importConfig: true,
                    _count: { select: { companies: true } },
                },
                orderBy: { createdAt: "desc" },
            },
        },
    });
    if (!mission) return null;

    const lists: ExportList[] = mission.lists.map((l) => ({
        id: l.id,
        name: l.name,
        source: l.source,
        isActive: l.isActive,
        isArchived: l.isArchived,
        createdAt: l.createdAt,
        importedAt: readImportedAt(l.importConfig),
        mappings: readImportMappings(l.importConfig),
    }));
    const companyCountByList = new Map(mission.lists.map((l) => [l.id, l._count.companies]));

    // Default selection: the lists being worked (not archived). Ids that are
    // not lists of this mission are dropped — the mission is the boundary.
    const selectedListIds = filters.listIds
        ? lists.filter((l) => filters.listIds!.includes(l.id)).map((l) => l.id)
        : lists.filter((l) => !l.isArchived).map((l) => l.id);

    // The dialog preview also counts the unticked active lists, so each one
    // can show what it would add; the file itself only loads the selection.
    const loadedListIds = full
        ? selectedListIds
        : [...new Set([...selectedListIds, ...lists.filter((l) => !l.isArchived).map((l) => l.id)])];

    const companiesByList = new Map<string, ExportCompany[]>(loadedListIds.map((id) => [id, []]));
    let actions: ExportAction[] = [];
    const exclusionReasons = new Map<string, string>();
    const sdrNames = new Map<string, string>();

    if (loadedListIds.length > 0) {
        // In "counts" mode the field flags are false: those keys come back
        // undefined and are normalized to null below.
        const companies = await prisma.company.findMany({
            where: { listId: { in: loadedListIds } },
            select: {
                id: true,
                listId: true,
                name: true,
                industry: full,
                country: full,
                website: full,
                size: full,
                phone: full,
                customData: full,
                excludedAt: full,
                exclusionId: full,
                contacts: {
                    select: {
                        id: true,
                        firstName: full,
                        lastName: full,
                        title: full,
                        email: full,
                        phone: full,
                        linkedin: full,
                        additionalPhones: full,
                        additionalEmails: full,
                        customData: full,
                        excludedAt: full,
                        exclusionId: full,
                    },
                    // Import order ≈ the order of the client's file.
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });

        for (const c of companies) {
            const company: ExportCompany = {
                id: c.id,
                listId: c.listId,
                name: c.name,
                industry: c.industry ?? null,
                country: c.country ?? null,
                website: c.website ?? null,
                size: c.size ?? null,
                phone: c.phone ?? null,
                customData: c.customData ?? null,
                excludedAt: c.excludedAt ?? null,
                exclusionId: c.exclusionId ?? null,
                contacts: c.contacts.map((ct) => ({
                    id: ct.id,
                    firstName: ct.firstName ?? null,
                    lastName: ct.lastName ?? null,
                    title: ct.title ?? null,
                    email: ct.email ?? null,
                    phone: ct.phone ?? null,
                    linkedin: ct.linkedin ?? null,
                    additionalPhones: ct.additionalPhones ?? null,
                    additionalEmails: ct.additionalEmails ?? null,
                    customData: ct.customData ?? null,
                    excludedAt: ct.excludedAt ?? null,
                    exclusionId: ct.exclusionId ?? null,
                })),
            };
            companiesByList.get(company.listId)?.push(company);
        }

        const actionWhere: Prisma.ActionWhereInput = {
            OR: [
                { contact: { company: { listId: { in: loadedListIds } } } },
                { contactId: null, company: { listId: { in: loadedListIds } } },
            ],
        };
        if (filters.sdrIds.length) actionWhere.sdrId = { in: filters.sdrIds };
        if (filters.channels.length) actionWhere.channel = { in: filters.channels };
        if (filters.from || filters.to) {
            actionWhere.createdAt = {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
            };
        }

        const rawActions = await prisma.action.findMany({
            where: actionWhere,
            select: {
                id: true,
                contactId: true,
                companyId: true,
                channel: true,
                result: true,
                callbackDate: true,
                duration: true,
                meetingType: true,
                createdAt: true,
                sdrId: true,
                sdr: { select: { name: true } },
                contact: { select: { companyId: true } },
                note: full,
                callSummary: full,
            },
            orderBy: { createdAt: "asc" },
        });

        actions = rawActions.map((a) => {
            sdrNames.set(a.sdrId, a.sdr?.name ?? "");
            return {
                id: a.id,
                contactId: a.contactId,
                ownerCompanyId: a.companyId ?? a.contact?.companyId ?? null,
                channel: toChannel(a.channel),
                result: a.result,
                note: a.note ?? null,
                callSummary: a.callSummary ?? null,
                callbackDate: a.callbackDate,
                duration: a.duration,
                meetingType: a.meetingType,
                createdAt: a.createdAt,
                sdrId: a.sdrId,
                sdrName: a.sdr?.name ?? "",
            };
        });

        if (full) {
            const exclusionIds = new Set<string>();
            for (const list of companiesByList.values()) {
                for (const c of list) {
                    if (c.exclusionId) exclusionIds.add(c.exclusionId);
                    for (const ct of c.contacts) if (ct.exclusionId) exclusionIds.add(ct.exclusionId);
                }
            }
            if (exclusionIds.size > 0) {
                const rules = await prisma.exclusion.findMany({
                    where: { id: { in: [...exclusionIds] } },
                    select: { id: true, reason: true },
                });
                for (const r of rules) exclusionReasons.set(r.id, r.reason);
            }
        }
    }

    // Filtered SDRs with no counted action still need a name in the summary.
    const unnamed = filters.sdrIds.filter((id) => !sdrNames.get(id));
    if (unnamed.length > 0) {
        const users = await prisma.user.findMany({ where: { id: { in: unnamed } }, select: { id: true, name: true } });
        for (const u of users) sdrNames.set(u.id, u.name ?? "");
    }

    const vocabulary = await loadStatusVocabulary(missionId);
    const channels = (mission.channels?.length ? mission.channels : [mission.channel]).map((c) => toChannel(c));

    return {
        mission: { id: mission.id, name: mission.name, clientName: mission.client?.name ?? "", channels },
        lists,
        selectedListIds,
        companiesByList,
        companyCountByList,
        actions,
        vocabulary,
        exclusionReasons,
        sdrNames,
        filters,
    };
}
