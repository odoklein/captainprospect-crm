/**
 * Backfill: turn the old status-based blacklist into real "Ne plus contacter" rules.
 *
 * Before exclusions existed, SDRs "blocked" a prospect by logging a final status.
 * A status alone never held: queues ignore it, the same company re-imported in
 * another list came back, and audit query 3 in
 * prisma/manual-sql/audit-blacklist-existante.sql shows calls made after it.
 *
 * For each prospect whose LATEST action is a status that triggers an exclusion
 * (DEFAULT_EXCLUSION_TARGETS: REFUS_CATEGORIQUE / HORS_CIBLE → company,
 * NOT_INTERESTED / DISQUALIFIED → contact), this creates a CLIENT-scoped,
 * permanent rule credited to the SDR who logged the status, via
 * createExclusionFromRow — same keys and same cross-list matching as the drawer.
 * A prospect worked again afterwards (latest action is something else) is left
 * alone, as is anything already excluded.
 *
 *   npx tsx scripts/backfill-exclusions-from-statuses.ts           # dry run, writes nothing
 *   npx tsx scripts/backfill-exclusions-from-statuses.ts --apply   # creates the rules
 *
 * Reads DATABASE_URL — check you are pointed at the right database (prod data
 * lives in Supabase) before running with --apply. Re-runs are safe: rows stamped
 * by a previous run are skipped.
 */
import type { ExclusionTarget } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createExclusionFromRow } from "@/lib/exclusions/service";
import { MAX_EXCLUSION_REASON_LENGTH } from "@/lib/exclusions/constants";
import { DEFAULT_EXCLUSION_TARGETS } from "@/lib/services/StatusConfigService";

const APPLY = process.argv.includes("--apply");

type Candidate = {
    target: ExclusionTarget;
    actionId: string;
    result: string;
    note: string | null;
    createdAt: Date;
    sdrId: string;
    sdrName: string | null;
    companyId: string;
    companyName: string;
    contactId: string | null;
    contactName: string | null;
    clientId: string;
    clientName: string;
};

async function loadCandidates(): Promise<Candidate[]> {
    const companyStatuses = Object.entries(DEFAULT_EXCLUSION_TARGETS)
        .filter(([, t]) => t === "COMPANY")
        .map(([code]) => code);
    const contactStatuses = Object.entries(DEFAULT_EXCLUSION_TARGETS)
        .filter(([, t]) => t === "CONTACT")
        .map(([code]) => code);

    // Latest action per company (any result) — keep it only if it is a company-level final status.
    const companies = await prisma.$queryRawUnsafe<Array<Omit<Candidate, "target">>>(`
        WITH latest AS (
            SELECT a.id, a.result::text AS result, a.note, a."createdAt", a."sdrId",
                   COALESCE(a."companyId", c."companyId") AS company_id,
                   ROW_NUMBER() OVER (PARTITION BY COALESCE(a."companyId", c."companyId") ORDER BY a."createdAt" DESC) AS rn
            FROM "Action" a
            LEFT JOIN "Contact" c ON c.id = a."contactId"
        )
        SELECT l.id AS "actionId", l.result, l.note, l."createdAt", l."sdrId", u.name AS "sdrName",
               co.id AS "companyId", co.name AS "companyName", NULL::text AS "contactId", NULL::text AS "contactName",
               cl.id AS "clientId", cl.name AS "clientName"
        FROM latest l
        JOIN "Company" co ON co.id = l.company_id
        JOIN "List" li ON li.id = co."listId"
        JOIN "Mission" m ON m.id = li."missionId"
        JOIN "Client" cl ON cl.id = m."clientId"
        LEFT JOIN "User" u ON u.id = l."sdrId"
        WHERE l.rn = 1
          AND l.result = ANY($1::text[])
          AND co."excludedAt" IS NULL
        ORDER BY l."createdAt" ASC
    `, companyStatuses);

    // Latest action per contact — keep it only if it is a contact-level final status.
    const contacts = await prisma.$queryRawUnsafe<Array<Omit<Candidate, "target">>>(`
        WITH latest AS (
            SELECT a.id, a.result::text AS result, a.note, a."createdAt", a."sdrId", a."contactId",
                   ROW_NUMBER() OVER (PARTITION BY a."contactId" ORDER BY a."createdAt" DESC) AS rn
            FROM "Action" a
            WHERE a."contactId" IS NOT NULL
        )
        SELECT l.id AS "actionId", l.result, l.note, l."createdAt", l."sdrId", u.name AS "sdrName",
               co.id AS "companyId", co.name AS "companyName",
               c.id AS "contactId", TRIM(CONCAT(c."firstName", ' ', c."lastName")) AS "contactName",
               cl.id AS "clientId", cl.name AS "clientName"
        FROM latest l
        JOIN "Contact" c ON c.id = l."contactId"
        JOIN "Company" co ON co.id = c."companyId"
        JOIN "List" li ON li.id = co."listId"
        JOIN "Mission" m ON m.id = li."missionId"
        JOIN "Client" cl ON cl.id = m."clientId"
        LEFT JOIN "User" u ON u.id = l."sdrId"
        WHERE l.rn = 1
          AND l.result = ANY($1::text[])
          AND c."excludedAt" IS NULL
          AND co."excludedAt" IS NULL
        ORDER BY l."createdAt" ASC
    `, contactStatuses);

    return [
        ...companies.map((r) => ({ ...r, target: "COMPANY" as const })),
        ...contacts.map((r) => ({ ...r, target: "CONTACT" as const })),
    ];
}

function reasonFor(c: Candidate): string {
    const when = c.createdAt.toISOString().slice(0, 10);
    const base = `Reprise du statut ${c.result} du ${when}${c.sdrName ? ` (${c.sdrName})` : ""}`;
    const text = c.note?.trim() ? `${base} — ${c.note.trim()}` : base;
    return text.slice(0, MAX_EXCLUSION_REASON_LENGTH);
}

async function main() {
    const candidates = await loadCandidates();
    const byClient = new Map<string, number>();
    for (const c of candidates) byClient.set(c.clientName, (byClient.get(c.clientName) ?? 0) + 1);

    console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${candidates.length} candidat(s)`);
    console.log(`  sociétés : ${candidates.filter((c) => c.target === "COMPANY").length}`);
    console.log(`  contacts : ${candidates.filter((c) => c.target === "CONTACT").length}`);
    for (const [client, n] of [...byClient.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  - ${client}: ${n}`);
    }

    if (!APPLY) {
        for (const c of candidates.slice(0, 20)) {
            console.log(`  [${c.target}] ${c.clientName} · ${c.companyName}${c.contactName ? ` · ${c.contactName}` : ""} — ${reasonFor(c)}`);
        }
        console.log("\nRien n'a été écrit. Relancez avec --apply pour créer les exclusions.");
        return;
    }

    let created = 0;
    let skipped = 0;
    const failures: string[] = [];
    for (const c of candidates) {
        // A rule created earlier in this run may already have stamped this row
        // (same company in several lists, or a company rule covering its contacts).
        const stillOpen = c.target === "COMPANY"
            ? await prisma.company.findFirst({ where: { id: c.companyId, excludedAt: null }, select: { id: true } })
            : await prisma.contact.findFirst({ where: { id: c.contactId!, excludedAt: null }, select: { id: true } });
        if (!stillOpen) {
            skipped++;
            continue;
        }
        try {
            await createExclusionFromRow({
                target: c.target,
                scope: "CLIENT",
                scopeId: c.clientId,
                companyId: c.companyId,
                contactId: c.contactId,
                reason: reasonFor(c),
                duration: "permanent",
                source: "SDR_ACTION",
                actorId: c.sdrId,
            });
            created++;
        } catch (err) {
            failures.push(`${c.target} ${c.companyName}${c.contactName ? ` / ${c.contactName}` : ""}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    console.log(`\nCréées : ${created} · déjà couvertes : ${skipped} · échecs : ${failures.length}`);
    for (const f of failures) console.log(`  ✗ ${f}`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
