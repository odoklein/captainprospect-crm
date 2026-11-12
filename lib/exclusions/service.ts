import { randomUUID } from "node:crypto";
import type { Exclusion, ExclusionScope, ExclusionSource, ExclusionTarget, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
    companyKeys,
    contactKeys,
    hasAnyKey,
    isRuleActive,
    ruleMatches,
    companyNameKey,
    domainKey,
    phoneKey,
    type ExclusionKeys,
} from "./matching";
import { resolveExpiry } from "./constants";
import {
    MAX_IMPORT_ROWS,
    buildCompanyRuleIndex,
    findRuleIdForCompany,
    prepareImportRows,
    summarizeImport,
    type ImportRowInput,
} from "./import";

/**
 * Applying an exclusion means finding every prospect row the rule recognises,
 * anywhere in scope, and stamping it. Matching lives in JS (see matching.ts:
 * accent folding and legal-form stripping have no cheap SQL equivalent without
 * the unaccent extension), so the scan is chunked rather than pushed down.
 *
 * That is affordable because applying is rare — creating a rule, importing a
 * list, lifting a rule — while the hot path (the SDR queue, every mission page)
 * only ever reads the materialized Company.excludedAt / Contact.excludedAt.
 */
const SCAN_CHUNK = 2_000;

/** Refuses to run away on a pathological scope; logged loudly if ever reached. */
const MAX_SCANNED_ROWS = 500_000;

type Db = PrismaClient | Prisma.TransactionClient;

export interface ExclusionActorRef {
    id: string;
    role: string;
}

export interface ApplyResult {
    companies: number;
    contacts: number;
}

// ============================================
// SCOPE RESOLUTION
// ============================================

/**
 * The lists a rule reaches. `null` means "every list" (GLOBAL scope) and is
 * distinct from `[]`, which means "no list matches, do nothing".
 */
async function listIdsForScope(
    db: Db,
    scope: ExclusionScope,
    scopeId: string | null
): Promise<string[] | null> {
    if (scope === "GLOBAL") return null;
    if (!scopeId) return [];

    const lists = await db.list.findMany({
        where:
            scope === "CLIENT"
                ? { mission: { clientId: scopeId } }
                : { missionId: scopeId },
        select: { id: true },
    });

    return lists.map((l) => l.id);
}

function companyWhereForScope(listIds: string[] | null): Prisma.CompanyWhereInput {
    return listIds === null ? {} : { listId: { in: listIds } };
}

// ============================================
// APPLY
// ============================================

type RuleRow = Pick<
    Exclusion,
    | "id"
    | "target"
    | "scope"
    | "scopeId"
    | "companyNameKey"
    | "domainKey"
    | "phoneKey"
    | "emailKey"
    | "contactNameKey"
    | "liftedAt"
    | "expiresAt"
>;

const RULE_SELECT = {
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
} satisfies Prisma.ExclusionSelect;

/**
 * Stamp every row in scope that `rule` recognises.
 *
 * Rows already carrying a stamp are left alone: the first rule that caught a
 * prospect stays the one shown in the UI, so lifting a later, broader rule
 * cannot silently put a company back on the phone that an earlier rule had
 * already taken off it.
 */
export async function applyExclusion(ruleId: string, db: Db = prisma): Promise<ApplyResult> {
    const rule = await db.exclusion.findUnique({ where: { id: ruleId }, select: RULE_SELECT });
    if (!rule || !isRuleActive(rule)) return { companies: 0, contacts: 0 };

    const listIds = await listIdsForScope(db, rule.scope, rule.scopeId);
    if (listIds !== null && listIds.length === 0) return { companies: 0, contacts: 0 };

    const result =
        rule.target === "COMPANY"
            ? await applyCompanyRule(db, rule, listIds)
            : await applyContactRule(db, rule, listIds);

    await db.exclusion.update({
        where: { id: ruleId },
        data: {
            appliedCompanies: result.companies,
            appliedContacts: result.contacts,
            lastAppliedAt: new Date(),
        },
    });

    return result;
}

async function applyCompanyRule(
    db: Db,
    rule: RuleRow,
    listIds: string[] | null
): Promise<ApplyResult> {
    const matchedCompanyIds: string[] = [];
    let scanned = 0;
    let cursor: string | undefined;

    for (;;) {
        const batch = await db.company.findMany({
            where: companyWhereForScope(listIds),
            select: { id: true, name: true, website: true, phone: true },
            orderBy: { id: "asc" },
            take: SCAN_CHUNK,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (batch.length === 0) break;

        for (const company of batch) {
            if (ruleMatches({ ...rule, target: "COMPANY" }, companyKeys(company))) {
                matchedCompanyIds.push(company.id);
            }
        }

        scanned += batch.length;
        cursor = batch[batch.length - 1].id;
        if (scanned >= MAX_SCANNED_ROWS) {
            // Never silent: a truncated scan means some prospects the client
            // asked us to drop are still callable.
            console.error(
                `Exclusion ${rule.id}: scan capped at ${MAX_SCANNED_ROWS} rows — coverage may be incomplete`
            );
            break;
        }
        if (batch.length < SCAN_CHUNK) break;
    }

    if (matchedCompanyIds.length === 0) return { companies: 0, contacts: 0 };

    const stampedAt = new Date();
    const companies = await db.company.updateMany({
        where: { id: { in: matchedCompanyIds }, excludedAt: null },
        data: { excludedAt: stampedAt, exclusionId: rule.id },
    });

    // A company rule takes its people with it — that is the whole point of
    // "toute la société", and what a personal-phone request like TALIS's needs.
    const affected = await db.contact.findMany({
        where: { companyId: { in: matchedCompanyIds }, excludedAt: null },
        select: { id: true },
    });
    const affectedIds = affected.map((c) => c.id);

    const contacts = await db.contact.updateMany({
        where: { id: { in: affectedIds } },
        data: { excludedAt: stampedAt, exclusionId: rule.id },
    });

    await stopRunningOutreach(affectedIds);

    return { companies: companies.count, contacts: contacts.count };
}

async function applyContactRule(
    db: Db,
    rule: RuleRow,
    listIds: string[] | null
): Promise<ApplyResult> {
    const matchedContactIds: string[] = [];
    let scanned = 0;
    let cursor: string | undefined;

    for (;;) {
        const batch = await db.contact.findMany({
            where: listIds === null ? {} : { company: { listId: { in: listIds } } },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                company: { select: { name: true } },
            },
            orderBy: { id: "asc" },
            take: SCAN_CHUNK,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (batch.length === 0) break;

        for (const contact of batch) {
            const candidate = contactKeys(contact, contact.company ?? null);
            if (ruleMatches({ ...rule, target: "CONTACT" }, candidate)) {
                matchedContactIds.push(contact.id);
            }
        }

        scanned += batch.length;
        cursor = batch[batch.length - 1].id;
        if (scanned >= MAX_SCANNED_ROWS) {
            // Never silent: a truncated scan means some prospects the client
            // asked us to drop are still callable.
            console.error(
                `Exclusion ${rule.id}: scan capped at ${MAX_SCANNED_ROWS} rows — coverage may be incomplete`
            );
            break;
        }
        if (batch.length < SCAN_CHUNK) break;
    }

    if (matchedContactIds.length === 0) return { companies: 0, contacts: 0 };

    const contacts = await db.contact.updateMany({
        where: { id: { in: matchedContactIds }, excludedAt: null },
        data: { excludedAt: new Date(), exclusionId: rule.id },
    });

    await stopRunningOutreach(matchedContactIds);

    return { companies: 0, contacts: contacts.count };
}

/**
 * Cut every channel for contacts that have just been excluded.
 *
 * Filtering the SDR queue only stops the next call; a sequence already running
 * would keep emailing a company that asked us to stop. Enrollments are exited
 * rather than paused, because "ne plus contacter" is not a hold.
 */
async function stopRunningOutreach(contactIds: string[]): Promise<number> {
    if (contactIds.length === 0) return 0;

    let exitedCount = 0;
    for (const ids of chunked(contactIds, ID_CHUNK)) {
        const exited = await prisma.emailSequenceEnrollment.updateMany({
            where: { contactId: { in: ids }, status: { in: ["ACTIVE", "PAUSED"] } },
            data: { status: "MANUAL_EXIT", exitReason: "Exclusion — ne plus contacter", exitedAt: new Date() },
        });
        exitedCount += exited.count;
    }

    return exitedCount;
}

// ============================================
// CREATE
// ============================================

export interface CreateFromRowInput {
    target: ExclusionTarget;
    scope: ExclusionScope;
    scopeId: string | null;
    companyId?: string | null;
    contactId?: string | null;
    reason: string;
    duration: string;
    source: ExclusionSource;
    actorId: string;
}

/**
 * Build a rule from a prospect the actor is looking at. The matching keys are
 * derived here, from the stored row — never accepted from the caller — so a
 * crafted payload cannot plant a key that would blacklist unrelated prospects.
 */
export async function createExclusionFromRow(input: CreateFromRowInput): Promise<Exclusion> {
    const contact = input.contactId
        ? await prisma.contact.findUnique({
              where: { id: input.contactId },
              select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                  companyId: true,
                  company: { select: { id: true, name: true, website: true, phone: true } },
              },
          })
        : null;

    if (input.contactId && !contact) {
        throw new Error("Contact introuvable");
    }

    const companyId = input.companyId ?? contact?.companyId ?? null;
    const company = companyId
        ? await prisma.company.findUnique({
              where: { id: companyId },
              select: { id: true, name: true, website: true, phone: true },
          })
        : null;

    if (companyId && !company) {
        throw new Error("Société introuvable");
    }

    if (input.target === "COMPANY" && !company) {
        throw new Error("Société requise pour une exclusion au niveau société");
    }
    if (input.target === "CONTACT" && !contact) {
        throw new Error("Contact requis pour une exclusion au niveau contact");
    }

    const keys: ExclusionKeys =
        input.target === "COMPANY"
            ? companyKeys(company!)
            : contactKeys(contact!, company ?? contact!.company ?? null);

    if (!hasAnyKey(keys)) {
        throw new Error(
            "Impossible d'identifier cette fiche de façon fiable (nom, domaine, téléphone ou email manquants)"
        );
    }

    const label =
        input.target === "COMPANY"
            ? company!.name
            : `${[contact!.firstName, contact!.lastName].filter(Boolean).join(" ") || "Contact"} — ${
                  company?.name ?? contact!.company?.name ?? "société inconnue"
              }`;

    const rule = await prisma.exclusion.create({
        data: {
            target: input.target,
            scope: input.scope,
            scopeId: input.scope === "GLOBAL" ? null : input.scopeId,
            ...keys,
            companyId: company?.id ?? null,
            contactId: contact?.id ?? null,
            label,
            reason: input.reason,
            source: input.source,
            createdById: input.actorId,
            expiresAt: resolveExpiry(input.duration),
        },
    });

    await applyExclusion(rule.id);
    return prisma.exclusion.findUniqueOrThrow({ where: { id: rule.id } });
}

export interface CreateManualInput {
    scope: ExclusionScope;
    scopeId: string | null;
    companyName: string;
    website?: string | null;
    phone?: string | null;
    reason: string;
    duration: string;
    actorId: string;
}

/**
 * A rule typed by hand, with no row in hand. This is how a company gets blocked
 * *before* it is ever imported — the case a status-based workaround can never
 * cover, since there is nothing to put a status on yet.
 */
export async function createManualExclusion(input: CreateManualInput): Promise<Exclusion> {
    const keys: ExclusionKeys = {
        companyNameKey: companyNameKey(input.companyName),
        domainKey: domainKey(input.website),
        phoneKey: phoneKey(input.phone),
        emailKey: null,
        contactNameKey: null,
    };

    if (!hasAnyKey(keys)) {
        throw new Error("Nom de société inexploitable : ajoutez un site web ou un téléphone");
    }

    const rule = await prisma.exclusion.create({
        data: {
            target: "COMPANY",
            scope: input.scope,
            scopeId: input.scope === "GLOBAL" ? null : input.scopeId,
            ...keys,
            label: input.companyName.trim(),
            reason: input.reason,
            source: "MANAGER",
            createdById: input.actorId,
            expiresAt: resolveExpiry(input.duration),
        },
    });

    await applyExclusion(rule.id);
    return prisma.exclusion.findUniqueOrThrow({ where: { id: rule.id } });
}

// ============================================
// BULK IMPORT
// ============================================

/** Stays well under Postgres' bind-parameter limit when a rule catches many rows. */
const ID_CHUNK = 5_000;

function chunked<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

/**
 * Stamp every company any of `ruleIds` recognises, in a single pass over the
 * scope. applyExclusion() scans the whole scope once per rule, which is right
 * for one rule and hopeless for a 2,000-line upload; here the rules are indexed
 * and each company is looked up, so the cost is one scan however many rules.
 *
 * Same stamping contract as applyExclusion: a company already excluded keeps the
 * rule that caught it first, and its contacts go with it.
 */
async function applyCompanyRulesInBulk(
    ruleIds: string[],
    scope: ExclusionScope,
    scopeId: string | null
): Promise<ApplyResult> {
    if (ruleIds.length === 0) return { companies: 0, contacts: 0 };

    const rules = await prisma.exclusion.findMany({
        where: { id: { in: ruleIds } },
        select: { id: true, companyNameKey: true, domainKey: true, phoneKey: true },
    });
    const index = buildCompanyRuleIndex(rules);

    const listIds = await listIdsForScope(prisma, scope, scopeId);
    const companiesByRule = new Map<string, string[]>();

    if (listIds === null || listIds.length > 0) {
        let scanned = 0;
        let cursor: string | undefined;

        for (;;) {
            const batch = await prisma.company.findMany({
                where: { ...companyWhereForScope(listIds), excludedAt: null },
                select: { id: true, name: true, website: true, phone: true },
                orderBy: { id: "asc" },
                take: SCAN_CHUNK,
                ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            });
            if (batch.length === 0) break;

            for (const company of batch) {
                const ruleId = findRuleIdForCompany(index, company);
                if (!ruleId) continue;
                const hit = companiesByRule.get(ruleId);
                if (hit) hit.push(company.id);
                else companiesByRule.set(ruleId, [company.id]);
            }

            scanned += batch.length;
            cursor = batch[batch.length - 1].id;
            if (scanned >= MAX_SCANNED_ROWS) {
                console.error(
                    `Exclusion import: scan capped at ${MAX_SCANNED_ROWS} rows — coverage may be incomplete`
                );
                break;
            }
            if (batch.length < SCAN_CHUNK) break;
        }
    }

    const stampedAt = new Date();
    let companyTotal = 0;
    let contactTotal = 0;
    const touchedContactIds: string[] = [];

    for (const [ruleId, companyIds] of companiesByRule) {
        let ruleCompanies = 0;
        let ruleContacts = 0;

        for (const ids of chunked(companyIds, ID_CHUNK)) {
            const companies = await prisma.company.updateMany({
                where: { id: { in: ids }, excludedAt: null },
                data: { excludedAt: stampedAt, exclusionId: ruleId },
            });
            ruleCompanies += companies.count;

            const people = await prisma.contact.findMany({
                where: { companyId: { in: ids }, excludedAt: null },
                select: { id: true },
            });
            const personIds = people.map((p) => p.id);
            for (const slice of chunked(personIds, ID_CHUNK)) {
                const contacts = await prisma.contact.updateMany({
                    where: { id: { in: slice } },
                    data: { excludedAt: stampedAt, exclusionId: ruleId },
                });
                ruleContacts += contacts.count;
            }
            touchedContactIds.push(...personIds);
        }

        await prisma.exclusion.update({
            where: { id: ruleId },
            data: { appliedCompanies: ruleCompanies, appliedContacts: ruleContacts, lastAppliedAt: stampedAt },
        });
        companyTotal += ruleCompanies;
        contactTotal += ruleContacts;
    }

    // Rules that caught nothing still record that they were applied.
    const withoutHits = ruleIds.filter((id) => !companiesByRule.has(id));
    for (const ids of chunked(withoutHits, ID_CHUNK)) {
        await prisma.exclusion.updateMany({ where: { id: { in: ids } }, data: { lastAppliedAt: stampedAt } });
    }

    await stopRunningOutreach(touchedContactIds);

    return { companies: companyTotal, contacts: contactTotal };
}

export interface ImportExclusionsInput {
    scope: ExclusionScope;
    scopeId: string | null;
    rows: ImportRowInput[];
    fileName?: string | null;
    reason: string;
    duration: string;
    source: ExclusionSource;
    actorId: string;
}

export interface ImportExclusionsResult {
    importId: string;
    total: number;
    created: number;
    duplicates: number;
    rejected: number;
    appliedCompanies: number;
    appliedContacts: number;
}

/**
 * Bulk "Importer une liste": one company-level rule per usable line, and the
 * upload itself kept as a history record so the file can be read back later.
 *
 * The history row is written first. If its table is missing the import stops
 * before any rule exists, rather than blacklisting a list nobody can then find.
 */
export async function importExclusions(input: ImportExclusionsInput): Promise<ImportExclusionsResult> {
    if (input.rows.length === 0) throw new Error("Le fichier ne contient aucune ligne");
    if (input.rows.length > MAX_IMPORT_ROWS) {
        throw new Error(`Trop de lignes : ${MAX_IMPORT_ROWS} maximum par import`);
    }

    const scopeId = input.scope === "GLOBAL" ? null : input.scopeId;

    const existing = await prisma.exclusion.findMany({
        where: {
            target: "COMPANY",
            scope: input.scope,
            scopeId,
            liftedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { companyNameKey: true, domainKey: true, phoneKey: true },
    });

    const prepared = prepareImportRows(input.rows, existing);
    const summary = summarizeImport(prepared);
    if (summary.created === 0) {
        throw new Error(
            summary.rejected === summary.total
                ? "Aucune ligne exploitable : il faut au moins un nom de société, un site web ou un téléphone"
                : "Toutes les lignes sont déjà dans la blacklist de ce périmètre"
        );
    }

    const toCreate = prepared
        .filter((row) => row.status === "CREATED")
        .map((row) => ({ row, id: randomUUID() }));
    const ruleIds = toCreate.map((entry) => entry.id);
    const ruleIdByLine = new Map(toCreate.map((entry) => [entry.row.line, entry.id]));

    const history = await prisma.exclusionImport.create({
        data: {
            fileName: input.fileName?.trim() || null,
            scope: input.scope,
            scopeId,
            reason: input.reason,
            duration: input.duration,
            source: input.source,
            totalRows: summary.total,
            createdCount: summary.created,
            duplicateCount: summary.duplicates,
            rejectedCount: summary.rejected,
            ruleIds,
            createdById: input.actorId,
            rows: prepared.map((row) => ({
                line: row.line,
                companyName: row.input.companyName ?? null,
                website: row.input.website ?? null,
                phone: row.input.phone ?? null,
                status: row.status,
                ruleId: ruleIdByLine.get(row.line) ?? null,
            })),
        },
    });

    const expiresAt = resolveExpiry(input.duration);
    for (const slice of chunked(toCreate, 500)) {
        await prisma.exclusion.createMany({
            data: slice.map(({ row, id }) => ({
                id,
                target: "COMPANY" as const,
                scope: input.scope,
                scopeId,
                ...row.keys,
                label: row.label,
                reason: input.reason,
                source: input.source,
                createdById: input.actorId,
                expiresAt,
            })),
        });
    }

    const applied = await applyCompanyRulesInBulk(ruleIds, input.scope, scopeId);

    await prisma.exclusionImport.update({
        where: { id: history.id },
        data: { appliedCompanies: applied.companies, appliedContacts: applied.contacts },
    });

    return {
        importId: history.id,
        total: summary.total,
        created: summary.created,
        duplicates: summary.duplicates,
        rejected: summary.rejected,
        appliedCompanies: applied.companies,
        appliedContacts: applied.contacts,
    };
}

/** Past uploads, newest first, without their rows (those load on demand). */
export async function listExclusionImports(where: Prisma.ExclusionImportWhereInput, take = 100) {
    const imports = await prisma.exclusionImport.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        select: {
            id: true,
            fileName: true,
            scope: true,
            scopeId: true,
            reason: true,
            duration: true,
            totalRows: true,
            createdCount: true,
            duplicateCount: true,
            rejectedCount: true,
            appliedCompanies: true,
            appliedContacts: true,
            createdById: true,
            createdAt: true,
        },
    });

    const userIds = [...new Set(imports.map((i) => i.createdById))];
    const users = userIds.length
        ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
        : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    const clientIds = [...new Set(imports.filter((i) => i.scope === "CLIENT" && i.scopeId).map((i) => i.scopeId!))];
    const clients = clientIds.length
        ? await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
        : [];
    const clientNameById = new Map(clients.map((c) => [c.id, c.name]));

    return imports.map(({ createdById, ...row }) => ({
        ...row,
        createdByName: nameById.get(createdById) ?? null,
        scopeName: row.scopeId ? clientNameById.get(row.scopeId) ?? null : null,
    }));
}

/** One stored upload with every line and what became of it. */
export async function getExclusionImport(id: string) {
    return prisma.exclusionImport.findUnique({ where: { id } });
}

// ============================================
// LIFT
// ============================================

/**
 * Stop enforcing a rule and hand its rows back to the queue.
 *
 * The rule itself is kept — a lifted exclusion is audit, not garbage — and the
 * rows it had stamped are re-tested against every other active rule before
 * being released, so lifting a broad rule cannot cancel a narrower one that was
 * covering the same company.
 */
export async function liftExclusion(
    ruleId: string,
    actorId: string,
    liftReason: string
): Promise<{
    releasedCompanies: number;
    releasedContacts: number;
    restampedCompanies: number;
    restampedContacts: number;
}> {
    const rule = await prisma.exclusion.findUnique({ where: { id: ruleId } });
    if (!rule) throw new Error("Exclusion introuvable");
    if (rule.liftedAt) throw new Error("Exclusion déjà levée");

    const [stampedCompanies, stampedContacts] = await Promise.all([
        prisma.company.findMany({ where: { exclusionId: ruleId }, select: { id: true } }),
        prisma.contact.findMany({ where: { exclusionId: ruleId }, select: { id: true } }),
    ]);

    await prisma.$transaction([
        prisma.exclusion.update({
            where: { id: ruleId },
            data: { liftedAt: new Date(), liftedById: actorId, liftReason },
        }),
        prisma.company.updateMany({
            where: { exclusionId: ruleId },
            data: { excludedAt: null, exclusionId: null },
        }),
        prisma.contact.updateMany({
            where: { exclusionId: ruleId },
            data: { excludedAt: null, exclusionId: null },
        }),
    ]);

    const restamped = await restampReleasedRows(
        stampedCompanies.map((c) => c.id),
        stampedContacts.map((c) => c.id)
    );

    // "Released" is what actually went back into the queue — rows a narrower
    // rule immediately caught again are not released, and saying otherwise
    // would tell a manager prospects are callable when they are not.
    return {
        releasedCompanies: stampedCompanies.length - restamped.companies,
        releasedContacts: stampedContacts.length - restamped.contacts,
        restampedCompanies: restamped.companies,
        restampedContacts: restamped.contacts,
    };
}

/**
 * Re-test rows freed by a lift against the rules that are still active. Bounded
 * by what the lifted rule had stamped, so this stays small even on a big base.
 */
async function restampReleasedRows(
    companyIds: string[],
    contactIds: string[]
): Promise<{ companies: number; contacts: number }> {
    if (companyIds.length === 0 && contactIds.length === 0) return { companies: 0, contacts: 0 };

    const activeRules = await prisma.exclusion.findMany({
        where: {
            liftedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: RULE_SELECT,
    });
    if (activeRules.length === 0) return { companies: 0, contacts: 0 };

    // Cache each rule's reach once rather than per row.
    const scopeCache = new Map<string, string[] | null>();
    for (const rule of activeRules) {
        const key = `${rule.scope}:${rule.scopeId ?? ""}`;
        if (!scopeCache.has(key)) {
            scopeCache.set(key, await listIdsForScope(prisma, rule.scope, rule.scopeId));
        }
    }

    let restampedCompanies = 0;
    let restampedContacts = 0;

    if (companyIds.length > 0) {
        const companies = await prisma.company.findMany({
            where: { id: { in: companyIds } },
            select: { id: true, listId: true, name: true, website: true, phone: true },
        });

        for (const company of companies) {
            const candidate = companyKeys(company);
            const hit = activeRules.find((rule) => {
                if (rule.target !== "COMPANY") return false;
                const reach = scopeCache.get(`${rule.scope}:${rule.scopeId ?? ""}`);
                if (reach !== null && !reach?.includes(company.listId)) return false;
                return ruleMatches({ ...rule, target: "COMPANY" }, candidate);
            });

            if (hit) {
                await prisma.company.update({
                    where: { id: company.id },
                    data: { excludedAt: new Date(), exclusionId: hit.id },
                });
                const recaught = await prisma.contact.updateMany({
                    where: { companyId: company.id, excludedAt: null },
                    data: { excludedAt: new Date(), exclusionId: hit.id },
                });
                restampedCompanies += 1;
                restampedContacts += recaught.count;
            }
        }
    }

    if (contactIds.length > 0) {
        const contacts = await prisma.contact.findMany({
            where: { id: { in: contactIds }, excludedAt: null },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                company: { select: { listId: true, name: true } },
            },
        });

        for (const contact of contacts) {
            const candidate = contactKeys(contact, contact.company ?? null);
            const hit = activeRules.find((rule) => {
                if (rule.target !== "CONTACT") return false;
                const reach = scopeCache.get(`${rule.scope}:${rule.scopeId ?? ""}`);
                if (reach !== null && contact.company && !reach?.includes(contact.company.listId)) {
                    return false;
                }
                return ruleMatches({ ...rule, target: "CONTACT" }, candidate);
            });

            if (hit) {
                await prisma.contact.update({
                    where: { id: contact.id },
                    data: { excludedAt: new Date(), exclusionId: hit.id },
                });
                restampedContacts += 1;
            }
        }
    }

    return { companies: restampedCompanies, contacts: restampedContacts };
}

// ============================================
// IMPORT / MAINTENANCE HOOKS
// ============================================

/**
 * Re-apply every rule that reaches a list. Called right after a CSV import, so
 * a company the client already excluded never reappears in the queue just
 * because someone re-uploaded the file — the single biggest hole in the
 * status-based workaround this feature replaces.
 */
export async function applyActiveExclusionsToList(listId: string): Promise<ApplyResult> {
    const list = await prisma.list.findUnique({
        where: { id: listId },
        select: { missionId: true, mission: { select: { clientId: true } } },
    });
    if (!list) return { companies: 0, contacts: 0 };

    const rules = await prisma.exclusion.findMany({
        where: {
            liftedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            AND: [
                {
                    OR: [
                        { scope: "GLOBAL" },
                        { scope: "CLIENT", scopeId: list.mission.clientId },
                        { scope: "MISSION", scopeId: list.missionId },
                    ],
                },
            ],
        },
        select: RULE_SELECT,
    });
    if (rules.length === 0) return { companies: 0, contacts: 0 };

    const companies = await prisma.company.findMany({
        where: { listId, excludedAt: null },
        select: {
            id: true,
            name: true,
            website: true,
            phone: true,
            contacts: {
                where: { excludedAt: null },
                select: { id: true, firstName: true, lastName: true, email: true, phone: true },
            },
        },
    });

    const companyRules = rules.filter((r) => r.target === "COMPANY");
    const contactRules = rules.filter((r) => r.target === "CONTACT");

    const companyHits: Array<{ id: string; ruleId: string }> = [];
    const contactHits: Array<{ id: string; ruleId: string }> = [];

    for (const company of companies) {
        const candidate = companyKeys(company);
        const companyHit = companyRules.find((rule) =>
            ruleMatches({ ...rule, target: "COMPANY" }, candidate)
        );

        if (companyHit) {
            companyHits.push({ id: company.id, ruleId: companyHit.id });
            for (const contact of company.contacts) {
                contactHits.push({ id: contact.id, ruleId: companyHit.id });
            }
            continue;
        }

        for (const contact of company.contacts) {
            const contactCandidate = contactKeys(contact, company);
            const contactHit = contactRules.find((rule) =>
                ruleMatches({ ...rule, target: "CONTACT" }, contactCandidate)
            );
            if (contactHit) contactHits.push({ id: contact.id, ruleId: contactHit.id });
        }
    }

    const stampedAt = new Date();

    // Group by rule so this is a handful of updateMany calls, not one per row.
    const byRule = <T extends { id: string; ruleId: string }>(hits: T[]) => {
        const grouped = new Map<string, string[]>();
        for (const hit of hits) {
            const existing = grouped.get(hit.ruleId);
            if (existing) existing.push(hit.id);
            else grouped.set(hit.ruleId, [hit.id]);
        }
        return grouped;
    };

    let companyCount = 0;
    for (const [ruleId, ids] of byRule(companyHits)) {
        const updated = await prisma.company.updateMany({
            where: { id: { in: ids }, excludedAt: null },
            data: { excludedAt: stampedAt, exclusionId: ruleId },
        });
        companyCount += updated.count;
    }

    let contactCount = 0;
    for (const [ruleId, ids] of byRule(contactHits)) {
        const updated = await prisma.contact.updateMany({
            where: { id: { in: ids }, excludedAt: null },
            data: { excludedAt: stampedAt, exclusionId: ruleId },
        });
        contactCount += updated.count;
    }

    await stopRunningOutreach(contactHits.map((hit) => hit.id));

    return { companies: companyCount, contacts: contactCount };
}

/**
 * Release rows held by rules whose expiry has passed. Idempotent, so it is safe
 * to run from a cron on every tick.
 */
export async function sweepExpiredExclusions(): Promise<{ swept: number; released: number }> {
    const expired = await prisma.exclusion.findMany({
        where: { liftedAt: null, expiresAt: { not: null, lte: new Date() } },
        select: { id: true },
    });
    if (expired.length === 0) return { swept: 0, released: 0 };

    const ids = expired.map((e) => e.id);
    const [companies, contacts] = await prisma.$transaction([
        prisma.company.updateMany({
            where: { exclusionId: { in: ids } },
            data: { excludedAt: null, exclusionId: null },
        }),
        prisma.contact.updateMany({
            where: { exclusionId: { in: ids } },
            data: { excludedAt: null, exclusionId: null },
        }),
    ]);

    return { swept: expired.length, released: companies.count + contacts.count };
}

export const exclusionService = {
    applyExclusion,
    createExclusionFromRow,
    createManualExclusion,
    importExclusions,
    listExclusionImports,
    getExclusionImport,
    liftExclusion,
    applyActiveExclusionsToList,
    sweepExpiredExclusions,
};
