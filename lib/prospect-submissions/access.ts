import { prisma } from "@/lib/prisma";
import { getTodaySdrMissionIds } from "@/lib/sdr-today-missions";
import type { ProspectReferrer } from "./types";

/** Roles that work a calling queue and may propose a prospect. */
export const SUBMITTER_ROLES = ["SDR", "BUSINESS_DEVELOPER", "BOOKER", "MANAGER"];

/**
 * An SDR/BD may only add prospects to a mission they work: planned on it today
 * (the queue's own scope) or durably assigned to it. Bookers and managers work
 * across missions.
 */
export async function canSubmitOnMission(user: { id: string; role: string }, missionId: string): Promise<boolean> {
    if (user.role === "MANAGER" || user.role === "BOOKER") return true;
    if (user.role !== "SDR" && user.role !== "BUSINESS_DEVELOPER") return false;

    const [today, assignment] = await Promise.all([
        getTodaySdrMissionIds(user.id),
        prisma.sDRAssignment.findUnique({
            where: { missionId_sdrId: { missionId, sdrId: user.id } },
            select: { id: true },
        }),
    ]);
    return today.includes(missionId) || !!assignment;
}

/** Mission of a company, through its list. */
export async function missionIdOfCompany(companyId: string): Promise<string | null> {
    const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { list: { select: { missionId: true } } },
    });
    return company?.list.missionId ?? null;
}

/**
 * "Jean Dupont (Cabinet Martin)" — the person or company that sent the SDR on.
 * Both ids must belong to the mission, or the referrer is dropped.
 */
export async function resolveReferrer(
    missionId: string,
    fromCompanyId: string | null | undefined,
    fromContactId: string | null | undefined,
): Promise<ProspectReferrer | null> {
    if (fromContactId) {
        const contact = await prisma.contact.findUnique({
            where: { id: fromContactId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                company: { select: { id: true, name: true, list: { select: { missionId: true } } } },
            },
        });
        if (contact && contact.company.list.missionId === missionId) {
            const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
            return {
                contactId: contact.id,
                companyId: contact.company.id,
                label: name ? `${name} (${contact.company.name})` : contact.company.name,
            };
        }
    }
    if (fromCompanyId) {
        const company = await prisma.company.findUnique({
            where: { id: fromCompanyId },
            select: { id: true, name: true, list: { select: { missionId: true } } },
        });
        if (company && company.list.missionId === missionId) {
            return { contactId: null, companyId: company.id, label: company.name };
        }
    }
    return null;
}
