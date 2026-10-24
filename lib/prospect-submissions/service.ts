import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { phoneKey, domainKey, companyNameKey } from "@/lib/exclusions/matching";
import {
    companyCompleteness,
    contactCompleteness,
    findBlacklistHit,
    findDuplicates,
    type DuplicateMatch,
    type ExclusionRuleRow,
    type MissionCompanyRow,
    type MissionContactRow,
    type ProspectCandidate,
} from "./matching";
import type {
    PendingProspectSubmission,
    ProspectCompanyInput,
    ProspectContactInput,
    ProspectOrigin,
} from "./types";

type Tx = Prisma.TransactionClient;

// ============================================
// MISSION CONTEXT
// ============================================

export interface MissionContext {
    id: string;
    name: string;
    clientId: string;
    clientName: string;
    isWorkable: boolean;
    lists: Array<{ id: string; name: string }>;
}

/** The mission and its active lists (the only lists a prospect can be added to). */
export async function loadMissionContext(missionId: string): Promise<MissionContext | null> {
    const mission = await prisma.mission.findUnique({
        where: { id: missionId },
        select: {
            id: true,
            name: true,
            clientId: true,
            isActive: true,
            status: true,
            client: { select: { name: true } },
            lists: {
                where: { isActive: true, isArchived: false },
                select: { id: true, name: true },
                orderBy: { createdAt: "asc" },
            },
        },
    });
    if (!mission) return null;
    return {
        id: mission.id,
        name: mission.name,
        clientId: mission.clientId,
        clientName: mission.client.name,
        isWorkable: mission.isActive && mission.status === "ACTIVE",
        lists: mission.lists,
    };
}

// ============================================
// CANDIDATE ROWS FOR THE DUPLICATE CHECK
// ============================================

function digitsTail(value: string | null | undefined): string | null {
    return phoneKey(value);
}

/**
 * Every company of the mission (archived lists included: an archived base was
 * still called) plus the contacts whose email or phone could be this person.
 */
export async function loadMissionCandidates(
    missionId: string,
    candidate: ProspectCandidate,
    db: Tx | typeof prisma = prisma,
): Promise<{ companies: MissionCompanyRow[]; contacts: MissionContactRow[] }> {
    const companyRows = await db.$queryRaw<
        Array<{ id: string; name: string; website: string | null; phone: string | null; extra: unknown; listId: string; listName: string }>
    >(Prisma.sql`
        SELECT co.id, co.name, co.website, co.phone,
               co."customData"->'additionalPhones' AS extra,
               l.id AS "listId", l.name AS "listName"
        FROM "Company" co
        INNER JOIN "List" l ON l.id = co."listId"
        WHERE l."missionId" = ${missionId}
    `);

    const companies: MissionCompanyRow[] = companyRows.map((row) => ({
        id: row.id,
        name: row.name,
        website: row.website,
        phone: row.phone,
        additionalPhones: Array.isArray(row.extra) ? row.extra.filter((v): v is string => typeof v === "string") : [],
        listId: row.listId,
        listName: row.listName,
    }));

    const email = candidate.contact?.email?.trim().toLowerCase() || null;
    const phoneTail = digitsTail(candidate.contact?.phone);
    if (!email && !phoneTail) return { companies, contacts: [] };

    const contactRows = await db.$queryRaw<
        Array<{
            id: string;
            companyId: string;
            companyName: string;
            listName: string;
            firstName: string | null;
            lastName: string | null;
            email: string | null;
            phone: string | null;
        }>
    >(Prisma.sql`
        SELECT c.id, c."companyId", co.name AS "companyName", l.name AS "listName",
               c."firstName", c."lastName", c.email, c.phone
        FROM "Contact" c
        INNER JOIN "Company" co ON co.id = c."companyId"
        INNER JOIN "List" l ON l.id = co."listId"
        WHERE l."missionId" = ${missionId}
          AND (
            ${email ? Prisma.sql`lower(c.email) = ${email}` : Prisma.sql`FALSE`}
            OR ${phoneTail ? Prisma.sql`right(regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g'), 9) = ${phoneTail}` : Prisma.sql`FALSE`}
          )
        LIMIT 20
    `);

    return { companies, contacts: contactRows };
}

export interface OtherMissionMatch {
    companyId: string;
    companyName: string;
    missionName: string;
}

/**
 * Same company already worked on another mission of the same client. Not a
 * block (the mission may target another offer) — shown to the SDR/manager as
 * a warning. Cheap SQL on raw columns, then confirmed with the fuzzy keys.
 */
export async function findOtherMissionMatches(
    clientId: string,
    missionId: string,
    company: ProspectCompanyInput,
): Promise<OtherMissionMatch[]> {
    const tail = phoneKey(company.phone);
    const domain = domainKey(company.website);
    const nameKey = companyNameKey(company.name);
    const firstWord = nameKey?.split(" ").find((w) => w.length >= 3) ?? null;
    if (!tail && !domain && !firstWord) return [];

    const rows = await prisma.$queryRaw<
        Array<{ id: string; name: string; website: string | null; phone: string | null; missionName: string }>
    >(Prisma.sql`
        SELECT co.id, co.name, co.website, co.phone, m.name AS "missionName"
        FROM "Company" co
        INNER JOIN "List" l ON l.id = co."listId"
        INNER JOIN "Mission" m ON m.id = l."missionId"
        WHERE m."clientId" = ${clientId} AND m.id <> ${missionId}
          AND (
            ${tail ? Prisma.sql`right(regexp_replace(coalesce(co.phone, ''), '\\D', '', 'g'), 9) = ${tail}` : Prisma.sql`FALSE`}
            OR ${domain ? Prisma.sql`co.website ILIKE ${"%" + domain + "%"}` : Prisma.sql`FALSE`}
            OR ${firstWord ? Prisma.sql`co.name ILIKE ${"%" + firstWord + "%"}` : Prisma.sql`FALSE`}
          )
        LIMIT 200
    `);

    return rows
        .filter(
            (row) =>
                (tail && phoneKey(row.phone) === tail) ||
                (domain && domainKey(row.website) === domain) ||
                (nameKey && companyNameKey(row.name) === nameKey),
        )
        .slice(0, 5)
        .map((row) => ({ companyId: row.id, companyName: row.name, missionName: row.missionName }));
}

/** Active exclusion rules covering this client/mission (same filter as the import). */
export async function loadActiveRules(clientId: string, missionId: string): Promise<ExclusionRuleRow[]> {
    const rules = await prisma.exclusion.findMany({
        where: {
            liftedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            AND: [
                {
                    OR: [
                        { scope: "GLOBAL" },
                        { scope: "CLIENT", scopeId: clientId },
                        { scope: "MISSION", scopeId: missionId },
                    ],
                },
            ],
        },
        select: {
            id: true,
            target: true,
            scope: true,
            scopeId: true,
            companyNameKey: true,
            domainKey: true,
            phoneKey: true,
            emailKey: true,
            contactNameKey: true,
            liftedAt: true,
            expiresAt: true,
        },
    });
    return rules as ExclusionRuleRow[];
}

// ============================================
// FULL CHECK
// ============================================

export interface SubmissionCheck {
    duplicates: DuplicateMatch[];
    blacklistHit: { id: string } | null;
}

export async function checkSubmission(
    mission: { id: string; clientId: string },
    candidate: ProspectCandidate,
    options: { excludePendingId?: string; db?: Tx } = {},
): Promise<SubmissionCheck> {
    const db = options.db ?? prisma;
    const [{ companies, contacts }, rules, pending] = await Promise.all([
        loadMissionCandidates(mission.id, candidate, db),
        loadActiveRules(mission.clientId, mission.id),
        listPendingSubmissions({ missionId: mission.id }),
    ]);
    const others = pending.filter((p) => p.id !== options.excludePendingId);
    const duplicates = findDuplicates(candidate, companies, contacts, others);
    const blacklistHit = findBlacklistHit(rules, candidate, { clientId: mission.clientId, missionId: mission.id });
    return { duplicates, blacklistHit: blacklistHit ? { id: blacklistHit.id } : null };
}

// ============================================
// PENDING STORE — SystemConfig rows
// "sdrProspectSubmission:<missionId>:<id>" = JSON payload. Deleted when a
// manager decides; the decision itself lives in AuditEvent + notifications.
// ============================================

const PENDING_PREFIX = "sdrProspectSubmission:";

function pendingKey(missionId: string, id: string): string {
    return `${PENDING_PREFIX}${missionId}:${id}`;
}

function parsePending(value: string): PendingProspectSubmission | null {
    try {
        const parsed = JSON.parse(value) as PendingProspectSubmission;
        return parsed && parsed.v === 1 && parsed.id && parsed.missionId ? parsed : null;
    } catch {
        return null;
    }
}

export async function createPendingSubmission(
    input: Omit<PendingProspectSubmission, "v" | "id" | "createdAt">,
): Promise<PendingProspectSubmission> {
    const submission: PendingProspectSubmission = {
        ...input,
        v: 1,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
    };
    await prisma.systemConfig.create({
        data: { key: pendingKey(submission.missionId, submission.id), value: JSON.stringify(submission) },
    });
    return submission;
}

export async function listPendingSubmissions(
    opts: { missionId?: string; limit?: number } = {},
): Promise<PendingProspectSubmission[]> {
    const rows = await prisma.systemConfig.findMany({
        where: { key: { startsWith: opts.missionId ? `${PENDING_PREFIX}${opts.missionId}:` : PENDING_PREFIX } },
        select: { value: true },
    });
    return rows
        .map((row) => parsePending(row.value))
        .filter((s): s is PendingProspectSubmission => !!s)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, opts.limit ?? 500);
}

export async function getPendingSubmission(missionId: string, id: string): Promise<PendingProspectSubmission | null> {
    const row = await prisma.systemConfig.findUnique({ where: { key: pendingKey(missionId, id) } });
    return row ? parsePending(row.value) : null;
}

/**
 * Take a pending submission out of the queue. Exactly one caller wins: the
 * row is deleted, and a second manager clicking at the same time gets false.
 * Run it inside the transaction that creates the company, so a failed
 * creation puts the submission back.
 */
export async function claimPendingSubmission(tx: Tx, missionId: string, id: string): Promise<boolean> {
    const deleted = await tx.systemConfig.deleteMany({ where: { key: pendingKey(missionId, id) } });
    return deleted.count === 1;
}

/** For the manager home "Tâches du jour": submissions waiting for a decision. */
export async function getPendingCompanySubmissionsCount(_managerUserId?: string): Promise<number> {
    try {
        return await prisma.systemConfig.count({ where: { key: { startsWith: PENDING_PREFIX } } });
    } catch (err) {
        console.warn("[prospect-submissions] pending count unavailable", err);
        return 0;
    }
}

// ============================================
// ORIGIN STORE — "company.sdrOrigin:<companyId>"
// Who added the company and why, shown on the company sheet. Kept out of
// Company.customData, which the drawer renders as client fields.
// ============================================

const ORIGIN_PREFIX = "company.sdrOrigin:";

export async function saveOrigin(tx: Tx, companyId: string, origin: ProspectOrigin): Promise<void> {
    const key = `${ORIGIN_PREFIX}${companyId}`;
    const value = JSON.stringify(origin);
    await tx.systemConfig.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function getOrigin(companyId: string): Promise<ProspectOrigin | null> {
    try {
        const row = await prisma.systemConfig.findUnique({ where: { key: `${ORIGIN_PREFIX}${companyId}` } });
        if (!row) return null;
        const parsed = JSON.parse(row.value) as ProspectOrigin;
        return parsed?.v === 1 ? parsed : null;
    } catch {
        return null;
    }
}

// ============================================
// CREATION
// ============================================

function clean(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

/**
 * Serialize submissions of one mission so two SDRs adding the same firm at the
 * same second cannot both pass the duplicate check.
 */
export async function lockMission(tx: Tx, missionId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"prospect:" + missionId}))`;
}

export async function createProspectRows(
    tx: Tx,
    input: {
        listId: string;
        company: ProspectCompanyInput;
        contact: ProspectContactInput | null;
        existingCompanyId: string | null;
    },
): Promise<{ companyId: string; contactId: string | null }> {
    const contactData = input.contact;
    const contactStatus = contactData ? contactCompleteness(contactData) : null;

    let companyId = input.existingCompanyId;
    if (!companyId) {
        const city = clean(input.company.city);
        const company = await tx.company.create({
            data: {
                listId: input.listId,
                name: input.company.name.trim(),
                phone: clean(input.company.phone),
                website: clean(input.company.website),
                ...(city ? { customData: { Ville: city } } : {}),
                status: companyCompleteness(input.company, contactStatus ? [contactStatus] : []),
            },
            select: { id: true },
        });
        companyId = company.id;
    }

    let contactId: string | null = null;
    if (contactData) {
        const civility = clean(contactData.civility);
        const contact = await tx.contact.create({
            data: {
                companyId,
                firstName: clean(contactData.firstName),
                lastName: clean(contactData.lastName),
                title: clean(contactData.title),
                phone: clean(contactData.phone),
                email: clean(contactData.email)?.toLowerCase() ?? null,
                ...(civility ? { customData: { Civilité: civility } } : {}),
                status: contactStatus ?? "INCOMPLETE",
            },
            select: { id: true },
        });
        contactId = contact.id;

        if (input.existingCompanyId && contactStatus === "ACTIONABLE") {
            // A reachable new contact makes the company actionable; never downgrade it.
            await tx.company.update({ where: { id: companyId }, data: { status: "ACTIONABLE" } });
        }
    }

    return { companyId, contactId };
}
