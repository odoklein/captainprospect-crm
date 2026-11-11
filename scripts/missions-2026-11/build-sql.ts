// ============================================
// Writes missions-2026-11.sql: the same import as import.ts, as one plain SQL
// file for psql on the server (no Node, no checkout of this branch needed).
//
//   npx tsx scripts/missions-2026-11/build-sql.ts
//
// The SQL is one transaction and safe to re-run: clients, missions, campaigns
// and the list are matched by name like import.ts; companies and contacts have
// ids derived from their content and the list is only filled while empty.
// It only writes long-standing columns, so it also runs on a database a few
// migrations behind this branch. Exclusions are not applied (that logic lives
// in the app: lib/exclusions/service.ts).
// ============================================

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { calculateCompanyCompleteness, calculateContactCompleteness } from "../../lib/scoring";
import { buildN2fCompanies, readSheetRows } from "./rows";

const DIR = __dirname;
const q = (v: string | null | undefined) => (v === null || v === undefined ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const json = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;
const id = (kind: string, key: string) => `m2611${kind}${createHash("md5").update(key).digest("hex").slice(0, 20)}`;

type Spec = {
    client: { name: string; industry: string; website?: string; notes: string };
    mission: { name: string; objective: string };
    campaign: { name: string; icp: string; pitch: string; script: string | null };
};

const N2F: Spec = {
    client: {
        name: "N2F",
        industry: "Logiciel SaaS — gestion des notes de frais",
        website: "https://www.n2f.com/",
        notes: "Mail « N2F campagnes » de Hichem Hammouche (2026-11-09) : lien https://www.n2f.com/ et la base DAF « N2Fdaf-base-pour-suzalie-conseil.xlsx ».",
    },
    mission: {
        name: "N2F — Prospection DAF",
        objective:
            "Appeler les DAF, CFO et responsables financiers de la base fournie par N2F et décrocher des rendez-vous de présentation de N2F (gestion des notes de frais).",
    },
    campaign: {
        name: "N2F — DAF",
        icp: "DAF, CFO, directeurs administratifs et financiers, responsables financiers (base fournie par N2F)",
        pitch: "À compléter : pas de script dans le mail de Hichem du 09/11/2026. Référence produit : https://www.n2f.com/",
        script: null,
    },
};

const DENTERLAB: Spec = {
    client: {
        name: "Denterlab",
        industry: "Laboratoire de prothèses dentaires (Paris)",
        notes: "Mail « DENTERLAB mission » de Hichem Hammouche (2026-11-09) : script d'appel en 4 phases + objections. Pas encore de liste.",
    },
    mission: {
        name: "Denterlab — Cabinets dentaires",
        objective:
            "Faire tester Denterlab aux chirurgiens-dentistes : obtenir l'envoi d'un premier cas (3 prothèses d'essai offertes, sans engagement) ou un créneau avec le responsable prothésiste.",
    },
    campaign: {
        name: "Denterlab — 3 prothèses d'essai offertes",
        icp: "Chirurgiens-dentistes et cabinets dentaires (praticien décideur, en passant le secrétariat)",
        pitch:
            "Laboratoire Denterlab (Paris) : 3 premiers travaux d'essai 100 % gratuits et sans engagement. Matériaux haut de gamme (Ivoclar Vivadent, Zircone suisse Metoxit), garantie 3 ans, triple contrôle. Couronne Full Zircone ou Céramo-Métal 55 €, E-max 80 €, gouttières dès 35 €. Ramassage et livraison gratuits, empreintes physiques ou numériques.",
        script: readFileSync(join(DIR, "data", "denterlab-script.txt"), "utf8").trim(),
    },
};

/** Client + mission + campaign; leaves v_client / v_mission / v_campaign set. */
function missionBlock(s: Spec, key: string): string {
    const onboardingData = { ...(s.client.website ? { website: s.client.website } : {}), icp: s.campaign.icp, pitch: s.campaign.pitch };
    return `
    -- ${s.client.name} ------------------------------------------------------
    SELECT id INTO v_client FROM "Client" WHERE lower(name) = lower(${q(s.client.name)}) ORDER BY "createdAt" LIMIT 1;
    IF v_client IS NULL THEN
        v_client := ${q(id("cli", key))};
        INSERT INTO "Client" (id, name, industry, "updatedAt") VALUES (v_client, ${q(s.client.name)}, ${q(s.client.industry)}, now());
        IF v_author IS NOT NULL AND to_regclass('"ClientOnboarding"') IS NOT NULL THEN
            INSERT INTO "ClientOnboarding" (id, "clientId", status, "onboardingData", scripts, notes, "createdById", "updatedAt")
            VALUES (${q(id("onb", key))}, v_client, 'IN_PROGRESS', ${json(onboardingData)}, ${json(s.campaign.script ? { base: s.campaign.script } : {})}, ${q(s.client.notes)}, v_author, now())
            ON CONFLICT DO NOTHING;
        END IF;
        RAISE NOTICE '${s.client.name}: client created';
    ELSE
        RAISE NOTICE '${s.client.name}: existing client %', v_client;
    END IF;

    SELECT id INTO v_mission FROM "Mission" WHERE "clientId" = v_client AND name = ${q(s.mission.name)} LIMIT 1;
    IF v_mission IS NULL THEN
        v_mission := ${q(id("mis", key))};
        INSERT INTO "Mission" (id, "clientId", name, objective, channel, channels, "startDate", "endDate", status, "isActive", "updatedAt")
        VALUES (v_mission, v_client, ${q(s.mission.name)}, ${q(s.mission.objective)}, 'CALL', ARRAY['CALL']::"Channel"[], now(), now() + interval '3 months', 'DRAFT', false, now());
        RAISE NOTICE '${s.client.name}: mission created (DRAFT)';
    ELSE
        RAISE NOTICE '${s.client.name}: mission already there';
    END IF;

    SELECT id INTO v_campaign FROM "Campaign" WHERE "missionId" = v_mission AND name = ${q(s.campaign.name)} LIMIT 1;
    IF v_campaign IS NULL THEN
        v_campaign := ${q(id("cmp", key))};
        INSERT INTO "Campaign" (id, "missionId", name, icp, pitch, script, "isActive", "updatedAt")
        VALUES (v_campaign, v_mission, ${q(s.campaign.name)}, ${q(s.campaign.icp)}, ${q(s.campaign.pitch)}, ${q(s.campaign.script)}, true, now());
        RAISE NOTICE '${s.client.name}: campaign created';
    ELSE
        RAISE NOTICE '${s.client.name}: campaign already there';
    END IF;
`;
}

async function main() {
    const parsed = buildN2fCompanies(await readSheetRows(join(DIR, "data", "n2f-daf-base.xlsx")));
    const listName = "Base DAF N2F";
    const importConfig = {
        importType: "sql",
        file: "n2f-daf-base.xlsx",
        receivedAt: "2026-11-09",
        sentBy: "Hichem Hammouche",
        rows: parsed.rows,
        duplicateRowsMerged: parsed.duplicateRowsMerged,
    };

    const companyRows: string[] = [];
    const contactRows: string[] = [];
    for (const company of parsed.companies) {
        const companyKey = company.name.toLowerCase();
        const companyId = id("co", `n2f:${companyKey}`);
        const statuses = company.contacts.map((c) => ({
            c,
            status: calculateContactCompleteness({ firstName: c.firstName, lastName: c.lastName, title: c.title, phone: c.phone }),
        }));
        const companyStatus = calculateCompanyCompleteness({ name: company.name, contacts: statuses.map((s) => ({ status: s.status })) });
        companyRows.push(`(${q(companyId)}, v_list, ${q(company.name)}, '${companyStatus}', now())`);
        for (const { c, status } of statuses) {
            const contactId = id("ct", `n2f:${companyKey}:${`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim().toLowerCase()}`);
            contactRows.push(
                `(${q(contactId)}, ${q(companyId)}, ${q(c.firstName)}, ${q(c.lastName)}, ${q(c.title)}, ${q(c.phone)}, ${
                    c.additionalPhones.length ? json(c.additionalPhones) : "NULL"
                }, ${c.fileStatus ? json({ "Statut (fichier N2F)": c.fileStatus }) : "NULL"}, '${status}', now())`,
            );
        }
    }

    const sql = `-- ============================================
-- Missions sent by Hichem Hammouche on 2026-11-09: N2F (with its DAF list)
-- and Denterlab (call script, no list yet).
-- Generated by scripts/missions-2026-11/build-sql.ts — do not edit by hand.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f missions-2026-11.sql
--
-- One transaction: all or nothing. Safe to re-run (nothing is duplicated).
-- Expected: N2F list « ${listName} » with ${parsed.companies.length} companies and ${contactRows.length} contacts;
-- both missions DRAFT. Exclusion rules are not applied by this file.
-- ============================================

\\set ON_ERROR_STOP on
BEGIN;

DO $do$
DECLARE
    v_author   text;
    v_client   text;
    v_mission  text;
    v_campaign text;
    v_list     text;
    v_count    integer;
BEGIN
    SELECT id INTO v_author FROM "User" WHERE role = 'MANAGER' AND "isActive" ORDER BY "createdAt" LIMIT 1;
${missionBlock(N2F, "n2f")}
    SELECT id INTO v_list FROM "List" WHERE "missionId" = v_mission AND name = ${q(listName)} LIMIT 1;
    IF v_list IS NULL THEN
        v_list := ${q(id("lst", "n2f"))};
        INSERT INTO "List" (id, "missionId", name, type, source, "importConfig", "updatedAt")
        VALUES (v_list, v_mission, ${q(listName)}, 'CLIENT', ${q("Fichier client N2F (mail de Hichem Hammouche, 2026-11-09)")}, ${json(importConfig)}, now());
        -- The list → script link exists only on recent schemas.
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'List' AND column_name = 'campaignId') THEN
            EXECUTE 'UPDATE "List" SET "campaignId" = $1 WHERE id = $2' USING v_campaign, v_list;
        END IF;
    END IF;

    SELECT count(*) INTO v_count FROM "Company" WHERE "listId" = v_list;
    IF v_count > 0 THEN
        RAISE NOTICE 'N2F: list already holds % companies, not re-imported', v_count;
    ELSE
        INSERT INTO "Company" (id, "listId", name, status, "updatedAt") VALUES
        ${companyRows.join(",\n        ")}
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO "Contact" (id, "companyId", "firstName", "lastName", title, phone, "additionalPhones", "customData", status, "updatedAt") VALUES
        ${contactRows.join(",\n        ")}
        ON CONFLICT (id) DO NOTHING;

        RAISE NOTICE 'N2F: list filled with ${parsed.companies.length} companies and ${contactRows.length} contacts';
    END IF;
${missionBlock(DENTERLAB, "denterlab")}
END
$do$;

COMMIT;

-- Check
SELECT c.name AS client, m.name AS mission, m.status,
       (SELECT count(*) FROM "List" l WHERE l."missionId" = m.id) AS lists,
       (SELECT count(*) FROM "Company" co JOIN "List" l ON l.id = co."listId" WHERE l."missionId" = m.id) AS companies,
       (SELECT count(*) FROM "Contact" ct JOIN "Company" co ON co.id = ct."companyId" JOIN "List" l ON l.id = co."listId" WHERE l."missionId" = m.id) AS contacts
FROM "Mission" m JOIN "Client" c ON c.id = m."clientId"
WHERE m.name IN (${q(N2F.mission.name)}, ${q(DENTERLAB.mission.name)});
`;
    const out = join(DIR, "missions-2026-11.sql");
    writeFileSync(out, sql);
    console.log(`Wrote ${out}: ${parsed.companies.length} companies, ${contactRows.length} contacts, ${(sql.length / 1024).toFixed(0)} KB`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
