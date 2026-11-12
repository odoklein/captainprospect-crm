// ============================================
// Builds the La Collecte Dentaire qualified base from the Drive exports:
//
//   npx tsx scripts/la-collecte-dentaire/build.ts <dir with the .xlsx exports>
//
// Expected files in <dir> (Google Drive → Fichier → Télécharger → .xlsx):
//   dentistes-france.xlsx   « FICHIER DENTISTES FRANCE »               (1KlgwIQUlC__C3-wNmJVLIda_S3nX5XWDWs3z3DqBjG8)
//   lcd-dept06.xlsx         « Fichier de La collecte Dentaire - DEPT 06 » (1gn2PeMuwbJWHNRCXyQ2XVDseNxK1bV-8XER0XDlhDR4)
//   les-rdv.xlsx            « LES RDV »                                 (1clAWZdFNhyx0cSMLh_kMchXaLq4a53KlwG9g2V59w5Q)
//   rdv-commerciaux.xlsx    « RDV COMMERCIAUX » (copie du 10 décembre)  (1RgakAvnMdqbOuLpq-Nt55QRsJ5LkwsL8G9Olh9C0SRQ)
//
// Writes next to this file:
//   base-qualifiee.csv  one line per practice, for review in Excel (« ; », UTF-8 BOM)
//   import.sql          psql import: client, DRAFT mission, campaign and one list per
//                       priority; one transaction, safe to re-run
// ============================================

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { calculateCompanyCompleteness, calculateContactCompleteness } from "../../lib/scoring";
import { buildBase, readWorkbook, touchesFromCallSheet, touchesFromFabienne, TIERS, type Practice, type Touch } from "./base";

const OUT = __dirname;
const MISSION = "La Collecte Dentaire — Relance des cabinets qualifiés";
const LISTS: Record<keyof typeof TIERS, string> = {
    rdv: "LCD 1 · RDV de collecte (nov.–déc. 2025)",
    boite: "LCD 2 · Boîtes de collecte acceptées (nov.–déc. 2025)",
    rappel: "LCD 3 · À rappeler (nov.–déc. 2025)",
};

const q = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const json = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;
const id = (kind: string, key: string) => `lcd${kind}${createHash("md5").update(key).digest("hex").slice(0, 21)}`;
const csvCell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function loadTouches(dir: string): Promise<Touch[]> {
    const touches: Touch[] = [];
    for (const sheet of await readWorkbook(join(dir, "dentistes-france.xlsx"))) {
        touches.push(...touchesFromCallSheet(`FICHIER DENTISTES FRANCE · ${sheet.name}`, sheet));
    }
    for (const sheet of await readWorkbook(join(dir, "lcd-dept06.xlsx"))) {
        touches.push(...touchesFromFabienne(`Fabienne · DEPT 06`, sheet));
    }
    for (const sheet of await readWorkbook(join(dir, "les-rdv.xlsx"))) {
        if (/RDV/i.test(sheet.name)) touches.push(...touchesFromCallSheet(`LES RDV`, sheet));
    }
    for (const sheet of await readWorkbook(join(dir, "rdv-commerciaux.xlsx"))) {
        if (/^(VANESSA|SOPHIE|DANIEL)$/i.test(sheet.name)) {
            touches.push(...touchesFromCallSheet(`RDV COMMERCIAUX · ${sheet.name}`, sheet, { collectorTab: true }));
        }
    }
    return touches;
}

function customData(p: Practice) {
    const d: Record<string, unknown> = {
        "Priorité": p.tier.label,
        "Dernier résultat": p.lastOutcome,
        "Dernier contact": p.lastTouch ? p.lastTouch.slice(0, 10) : null,
        "Adresse": [p.address, [p.postalCode, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
        "Département": p.department,
        "Interlocuteur(s)": p.interlocutors.join(" / ") || null,
        "Horaires / créneau": p.slots.join(" | ") || null,
        "Collecteur": p.collector,
        "Suite collecteur": p.collectorFollowUp,
        "Appelé par": p.callers.join(", ") || null,
        "Historique des appels": p.history.join("\n"),
        "Sources": p.sources.join(" ; "),
        ...(p.extraPhones.length ? { additionalPhones: p.extraPhones } : {}),
    };
    return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null && v !== ""));
}

function writeCsv(practices: Practice[]) {
    const header = [
        "Priorité", "Cabinet", "Téléphone", "Autres téléphones", "Email", "Interlocuteur(s)", "Adresse", "CP", "Ville",
        "Département", "Dernier résultat", "Dernier contact", "Horaires / créneau", "Collecteur", "Suite collecteur",
        "Appelé par", "Historique des appels", "Sources",
    ];
    const lines = practices.map((p) =>
        [
            p.tier.label, p.name, p.phone, p.extraPhones.join(" / "), p.emails.join(" / "), p.interlocutors.join(" / "),
            p.address, p.postalCode, p.city, p.department, p.lastOutcome, p.lastTouch?.slice(0, 10), p.slots.join(" | "),
            p.collector, p.collectorFollowUp, p.callers.join(", "), p.history.join("\n"), p.sources.join(" ; "),
        ].map(csvCell).join(";"),
    );
    writeFileSync(join(OUT, "base-qualifiee.csv"), "﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n");
}

function writeSql(practices: Practice[]) {
    const byTier = (k: keyof typeof TIERS) => practices.filter((p) => p.tier.key === k);
    const listBlock = (k: keyof typeof TIERS) => {
        const rows = byTier(k);
        if (!rows.length) return "";
        const companies: string[] = [];
        const contacts: string[] = [];
        for (const p of rows) {
            const companyId = id("co", p.key);
            const contact = {
                firstName: p.interlocutors[0] ?? null,
                lastName: null as string | null,
                title: p.interlocutors.length ? "Assistante / interlocutrice du cabinet" : "Accueil du cabinet",
                email: p.emails[0] ?? null,
                phone: p.phone,
            };
            const contactStatus = calculateContactCompleteness(contact);
            const companyStatus = calculateCompanyCompleteness({ name: p.name, country: "France", industry: "Cabinet dentaire", contacts: [{ status: contactStatus }] });
            companies.push(
                `(${q(companyId)}, v_list, ${q(p.name)}, 'France', 'Cabinet dentaire', ${q(p.website)}, ${q(p.size)}, ${q(p.phone)}, ${json(customData(p))}, '${companyStatus}', now())`,
            );
            contacts.push(
                `(${q(id("ct", p.key))}, ${q(companyId)}, ${q(contact.firstName)}, NULL, ${q(contact.title)}, ${q(contact.email)}, ${q(p.phone)}, ${
                    p.extraPhones.length ? json(p.extraPhones) : "NULL"
                }, ${p.emails.length > 1 ? json(p.emails.slice(1)) : "NULL"}, ${json({ "Priorité": p.tier.label, "Historique des appels": p.history.join("\n") })}, '${contactStatus}', now())`,
            );
        }
        return `
    -- ${LISTS[k]} : ${rows.length} cabinets
    SELECT id INTO v_list FROM "List" WHERE "missionId" = v_mission AND name = ${q(LISTS[k])} LIMIT 1;
    IF v_list IS NULL THEN
        v_list := ${q(id("lst", k))};
        INSERT INTO "List" (id, "missionId", name, type, source, "importConfig", "updatedAt")
        VALUES (v_list, v_mission, ${q(LISTS[k])}, 'CLIENT', 'Campagne La Collecte Dentaire nov.–déc. 2025 (Drive)', ${json({ importType: "sql", tier: TIERS[k].label, practices: rows.length })}, now());
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'List' AND column_name = 'campaignId') THEN
            EXECUTE 'UPDATE "List" SET "campaignId" = $1 WHERE id = $2' USING v_campaign, v_list;
        END IF;
    END IF;
    SELECT count(*) INTO v_count FROM "Company" WHERE "listId" = v_list;
    IF v_count > 0 THEN
        RAISE NOTICE '${LISTS[k]}: already holds % companies, not re-imported', v_count;
    ELSE
        INSERT INTO "Company" (id, "listId", name, country, industry, website, size, phone, "customData", status, "updatedAt") VALUES
        ${companies.join(",\n        ")}
        ON CONFLICT (id) DO NOTHING;
        INSERT INTO "Contact" (id, "companyId", "firstName", "lastName", title, email, phone, "additionalPhones", "additionalEmails", "customData", status, "updatedAt") VALUES
        ${contacts.join(",\n        ")}
        ON CONFLICT (id) DO NOTHING;
        RAISE NOTICE '${LISTS[k]}: ${rows.length} cabinets imported';
    END IF;
`;
    };

    const fallbackPitch =
        "Collecte gratuite des couronnes dentaires du cabinet : un collecteur passe récupérer les couronnes (à partir d'une vingtaine) ou dépose une boîte de collecte où le cabinet les met de côté.";
    const sql = `-- ============================================
-- La Collecte Dentaire — qualified practices from the Nov–Dec 2025 campaign
-- Generated by scripts/la-collecte-dentaire/build.ts — do not edit by hand.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f import.sql
--
-- One transaction, safe to re-run. Creates (or reuses) the client « La Collecte
-- Dentaire », a DRAFT mission « ${MISSION} », its campaign (pitch and script copied
-- from the client's latest existing campaign when there is one) and 3 lists:
--   ${LISTS.rdv}: ${byTier("rdv").length}
--   ${LISTS.boite}: ${byTier("boite").length}
--   ${LISTS.rappel}: ${byTier("rappel").length}
-- Every touch is in the company's « Historique des appels » field.
-- Exclusion rules are not applied by this file.
-- ============================================

\\set ON_ERROR_STOP on
BEGIN;

DO $do$
DECLARE
    v_client   text;
    v_mission  text;
    v_campaign text;
    v_list     text;
    v_count    integer;
    v_icp      text;
    v_pitch    text;
    v_script   text;
BEGIN
    SELECT id INTO v_client FROM "Client"
     WHERE lower(name) LIKE '%collecte dentaire%' OR lower(name) LIKE '%collecte-dentaire%'
     ORDER BY "createdAt" LIMIT 1;
    IF v_client IS NULL THEN
        v_client := ${q(id("cli", "client"))};
        INSERT INTO "Client" (id, name, industry, "updatedAt") VALUES (v_client, 'La Collecte Dentaire', 'Collecte et rachat de couronnes dentaires', now());
        RAISE NOTICE 'Client La Collecte Dentaire created';
    ELSE
        RAISE NOTICE 'Existing client %', v_client;
    END IF;

    SELECT id INTO v_mission FROM "Mission" WHERE "clientId" = v_client AND name = ${q(MISSION)} LIMIT 1;
    IF v_mission IS NULL THEN
        v_mission := ${q(id("mis", "mission"))};
        INSERT INTO "Mission" (id, "clientId", name, objective, channel, channels, "startDate", "endDate", status, "isActive", "updatedAt")
        VALUES (v_mission, v_client, ${q(MISSION)},
                'Relancer les cabinets dentaires qualifiés de la campagne nov.–déc. 2025 : confirmer les RDV de collecte, faire déposer les boîtes acceptées, requalifier les rappels.',
                'CALL', ARRAY['CALL']::"Channel"[], now(), now() + interval '3 months', 'DRAFT', false, now());
        RAISE NOTICE 'Mission created (DRAFT)';
    END IF;

    SELECT id INTO v_campaign FROM "Campaign" WHERE "missionId" = v_mission ORDER BY "createdAt" LIMIT 1;
    IF v_campaign IS NULL THEN
        SELECT c.icp, c.pitch, c.script INTO v_icp, v_pitch, v_script
          FROM "Campaign" c JOIN "Mission" m ON m.id = c."missionId"
         WHERE m."clientId" = v_client AND m.id <> v_mission
         ORDER BY c."updatedAt" DESC LIMIT 1;
        v_campaign := ${q(id("cmp", "campaign"))};
        INSERT INTO "Campaign" (id, "missionId", name, icp, pitch, script, "isActive", "updatedAt")
        VALUES (v_campaign, v_mission, 'Relance cabinets qualifiés',
                COALESCE(v_icp, 'Cabinets dentaires (dentiste ou assistante) ayant accepté un RDV, une boîte de collecte ou un rappel'),
                COALESCE(v_pitch, ${q(fallbackPitch)}),
                v_script, true, now());
        RAISE NOTICE 'Campaign created (script copied: %)', v_script IS NOT NULL;
    END IF;
${listBlock("rdv")}${listBlock("boite")}${listBlock("rappel")}
END
$do$;

COMMIT;

-- Check
SELECT l.name AS list, count(DISTINCT co.id) AS cabinets, count(ct.id) AS contacts
FROM "List" l
JOIN "Mission" m ON m.id = l."missionId"
LEFT JOIN "Company" co ON co."listId" = l.id
LEFT JOIN "Contact" ct ON ct."companyId" = co.id
WHERE m.name = ${q(MISSION)}
GROUP BY l.name ORDER BY l.name;
`;
    writeFileSync(join(OUT, "import.sql"), sql);
}

async function main() {
    const dir = process.argv[2];
    if (!dir) throw new Error("usage: build.ts <dir with the Drive .xlsx exports>");
    const touches = await loadTouches(dir);
    const { practices, report } = buildBase(touches);
    writeCsv(practices);
    writeSql(practices);
    console.log(JSON.stringify(report, null, 2));
    console.log(`Wrote base-qualifiee.csv and import.sql: ${practices.length} practices`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
