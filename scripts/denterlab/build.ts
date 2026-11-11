// ============================================
// Denterlab — dental practices from the agency's national dentist file, cleaned,
// for the mission « Denterlab — Cabinets dentaires » (dental prosthetics lab).
//
//   npx tsx scripts/denterlab/build.ts <dir with the Drive .xlsx exports>
//
// Sources (same exports as scripts/la-collecte-dentaire/build.ts):
//   dentistes-france.xlsx   « FICHIER DENTISTES FRANCE » (built by the agency from Google Maps)
//   les-rdv.xlsx, rdv-commerciaux.xlsx   extra interlocutors, hours and emails for the same practices
// Not used: Fabienne's « Fichier de La collecte Dentaire » (that client's file), and the
// « Ne Pas Touché » tab (practices set aside; only its called rows would count).
//
// Removed: wrong / invalid numbers, out of target, closed / retired / liquidated,
// and practices that were hostile or asked not to be called again.
// The crown-collection answer itself (yes / no) is no reason to drop a practice:
// Denterlab sells prosthetics, a different offer.
//
// Priority lists:
//   DTL 1 · Cabinets accueillants  — accepted something on the crown campaign (RDV, box, call back)
//   DTL 2 · Cabinets joints        — a person answered (declined the crown offer, or other)
//   DTL 3 · Jamais joints          — called, never reached (no answer, voicemail)
//   DTL 4 · Jamais appelés         — in the file, not called yet
//
// Writes base-denterlab.csv (review) and import.sql (psql, one transaction, safe to re-run;
// fills the existing Denterlab mission, fails if it is missing).
// ============================================

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { calculateCompanyCompleteness, calculateContactCompleteness } from "../../lib/scoring";
import { categoryOf, groupTouches, readWorkbook, touchesFromCallSheet, type Touch } from "../la-collecte-dentaire/base";

const OUT = __dirname;
const MISSION = "Denterlab — Cabinets dentaires";
const CAMPAIGN = "Denterlab — 3 prothèses d'essai offertes";

type TierKey = "accueillant" | "joint" | "nonjoint" | "nonappele";
const TIERS: Record<TierKey, { rank: number; label: string; list: string }> = {
    accueillant: { rank: 1, label: "1 · Cabinet accueillant", list: "DTL 1 · Cabinets accueillants (déjà appelés, ouverts)" },
    joint: { rank: 2, label: "2 · Cabinet joint", list: "DTL 2 · Cabinets joints" },
    nonjoint: { rank: 3, label: "3 · Jamais joint", list: "DTL 3 · Cabinets jamais joints" },
    nonappele: { rank: 4, label: "4 · Jamais appelé", list: "DTL 4 · Cabinets jamais appelés" },
};

const DEAD = /FAUX NUM|NUM[EÉ]RO INVALIDE|HORS ?CIBLE|LIQUIDATION|RETRAITE|FERM[EÉ] D[EÉ]FINITIVEMENT|N'EXISTE PLUS/i;
const HOSTILE = /insult|ne (plus|pas) (le |les |nous )?(rappeler|appeler|recontacter)|ne veut plus (être|etre) (appel|contact)|liste rouge|agressi/i;
const REACHED_NEUTRAL = /^(NRP|NE REPOND PAS|MESSAGERIE|SONNE PAS|)$/i;

type Row = {
    key: string;
    tier: TierKey;
    name: string;
    phone: string;
    extraPhones: string[];
    address: string | null;
    city: string | null;
    postalCode: string | null;
    department: string | null;
    emails: string[];
    interlocutors: string[];
    slots: string[];
    lastOutcome: string | null;
    lastTouch: string | null;
    history: string[];
};

const q = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const json = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;
const id = (kind: string, key: string) => `dtl${kind}${createHash("md5").update(key).digest("hex").slice(0, 21)}`;
const csvCell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function loadTouches(dir: string): Promise<Touch[]> {
    const touches: Touch[] = [];
    for (const sheet of await readWorkbook(join(dir, "dentistes-france.xlsx"))) {
        if (/ne pas touch/i.test(sheet.name)) continue;
        touches.push(...touchesFromCallSheet(`FICHIER DENTISTES FRANCE · ${sheet.name}`, sheet));
    }
    for (const sheet of await readWorkbook(join(dir, "les-rdv.xlsx"))) {
        if (/RDV/i.test(sheet.name)) touches.push(...touchesFromCallSheet("LES RDV", sheet));
    }
    for (const sheet of await readWorkbook(join(dir, "rdv-commerciaux.xlsx"))) {
        if (/^(VANESSA|SOPHIE|DANIEL)$/i.test(sheet.name)) {
            touches.push(...touchesFromCallSheet(`RDV COMMERCIAUX · ${sheet.name}`, sheet, { collectorTab: true }));
        }
    }
    return touches;
}

function build(touches: Touch[]) {
    const report = { practices: 0, kept: { accueillant: 0, joint: 0, nonjoint: 0, nonappele: 0 } as Record<TierKey, number>, droppedDead: 0, droppedHostile: 0 };
    const rows: Row[] = [];
    for (const [key, group] of groupTouches(touches)) {
        report.practices++;
        const dated = [...group].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
        const outcomes = dated.map((t) => t.outcome.trim());
        const text = dated.map((t) => `${t.outcome} ${t.note ?? ""} ${t.caller ?? ""}`).join(" ");
        if (outcomes.some((o) => DEAD.test(o))) {
            report.droppedDead++;
            continue;
        }
        if (HOSTILE.test(text)) {
            report.droppedHostile++;
            continue;
        }
        const real = outcomes.filter((o) => o && !/^DOUBLON/i.test(o));
        const cats = real.map(categoryOf);
        let tier: TierKey;
        if (cats.some((c) => c === "RDV" || c === "BOITE" || c === "RAPPEL")) tier = "accueillant";
        else if (real.some((o) => !REACHED_NEUTRAL.test(o))) tier = "joint";
        else if (real.length > 0) tier = "nonjoint";
        else tier = "nonappele";

        const phones = [...new Set(group.flatMap((t) => t.phones))];
        if (!phones.length) continue;
        const first = <K extends keyof Touch>(k: K) => (dated.map((t) => t[k]).find((v) => v) as string | undefined) ?? null;
        const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
        const seen = new Set<string>();
        const history = dated
            .filter((t) => {
                if ((!t.outcome && !t.note) || /^DOUBLON/i.test(t.outcome)) return false;
                const k = `${t.outcome}|${(t.note ?? "").toLowerCase()}`;
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            })
            .map((t) => {
                const when = t.date ? t.date.slice(0, 16).replace("T", " ").replace(/ 00:00$/, "") : "date ?";
                return `${when} · ${t.caller ?? "?"} · ${t.outcome || "—"}${t.note ? ` — ${t.note}` : ""}`;
            });
        const pc = first("postalCode");
        const lastReal = [...dated].reverse().find((t) => t.outcome && !/^DOUBLON/i.test(t.outcome));
        rows.push({
            key,
            tier,
            name: (dated.find((t) => t.source.startsWith("FICHIER")) ?? dated[0]).name,
            phone: phones[0],
            extraPhones: phones.slice(1),
            address: first("address"),
            city: first("city"),
            postalCode: pc,
            department: pc ? (pc.startsWith("97") ? pc.slice(0, 3) : pc.slice(0, 2)) : null,
            emails: uniq(dated.map((t) => t.email)),
            interlocutors: uniq(dated.map((t) => t.interlocutor)),
            slots: uniq(dated.map((t) => t.slot)),
            lastOutcome: lastReal?.outcome ?? null,
            lastTouch: dated.map((t) => t.date).filter(Boolean).pop() ?? null,
            history,
        });
        report.kept[tier]++;
    }
    rows.sort((a, b) => TIERS[a.tier].rank - TIERS[b.tier].rank || (a.department ?? "").localeCompare(b.department ?? "") || a.name.localeCompare(b.name, "fr"));
    return { rows, report };
}

function customData(r: Row) {
    const d: Record<string, unknown> = {
        "Priorité": TIERS[r.tier].label,
        "Adresse": [r.address, [r.postalCode, r.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
        "Département": r.department,
        "Interlocuteur(s)": r.interlocutors.join(" / ") || null,
        "Horaires": r.slots.join(" | ") || null,
        "Dernier résultat (campagne couronnes 2025)": r.lastOutcome,
        "Dernier contact": r.lastTouch ? r.lastTouch.slice(0, 10) : null,
        "Historique des appels (campagne couronnes 2025)": r.history.join("\n") || null,
        ...(r.extraPhones.length ? { additionalPhones: r.extraPhones } : {}),
    };
    return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null && v !== ""));
}

function writeCsv(rows: Row[]) {
    const header = ["Priorité", "Cabinet", "Téléphone", "Autres téléphones", "Email", "Interlocuteur(s)", "Adresse", "CP", "Ville", "Département", "Horaires", "Dernier résultat 2025", "Dernier contact", "Historique des appels"];
    const lines = rows.map((r) =>
        [TIERS[r.tier].label, r.name, r.phone, r.extraPhones.join(" / "), r.emails.join(" / "), r.interlocutors.join(" / "), r.address, r.postalCode, r.city, r.department, r.slots.join(" | "), r.lastOutcome, r.lastTouch?.slice(0, 10), r.history.join("\n")]
            .map(csvCell)
            .join(";"),
    );
    writeFileSync(join(OUT, "base-denterlab.csv"), "﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n");
}

function writeSql(rows: Row[]) {
    const block = (k: TierKey) => {
        const tierRows = rows.filter((r) => r.tier === k);
        if (!tierRows.length) return "";
        const companies: string[] = [];
        const contacts: string[] = [];
        for (const r of tierRows) {
            const companyId = id("co", r.key);
            const contact = {
                firstName: r.interlocutors[0] ?? null,
                lastName: null,
                title: r.interlocutors.length ? "Assistante / interlocutrice du cabinet" : "Accueil du cabinet",
                email: r.emails[0] ?? null,
                phone: r.phone,
            };
            const cStatus = calculateContactCompleteness(contact);
            const coStatus = calculateCompanyCompleteness({ name: r.name, country: "France", industry: "Cabinet dentaire", contacts: [{ status: cStatus }] });
            companies.push(`(${q(companyId)}, v_list, ${q(r.name)}, 'France', 'Cabinet dentaire', ${q(r.phone)}, ${json(customData(r))}, '${coStatus}', now())`);
            contacts.push(
                `(${q(id("ct", r.key))}, ${q(companyId)}, ${q(contact.firstName)}, NULL, ${q(contact.title)}, ${q(contact.email)}, ${q(r.phone)}, ${
                    r.extraPhones.length ? json(r.extraPhones) : "NULL"
                }, ${r.emails.length > 1 ? json(r.emails.slice(1)) : "NULL"}, '${cStatus}', now())`,
            );
        }
        // Batches of 1,000 rows keep each statement reasonable.
        const chunks = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / 1000) }, (_, i) => xs.slice(i * 1000, i * 1000 + 1000));
        return `
    -- ${TIERS[k].list} : ${tierRows.length} cabinets
    SELECT id INTO v_list FROM "List" WHERE "missionId" = v_mission AND name = ${q(TIERS[k].list)} LIMIT 1;
    IF v_list IS NULL THEN
        v_list := ${q(id("lst", k))};
        INSERT INTO "List" (id, "missionId", name, type, source, "importConfig", "updatedAt")
        VALUES (v_list, v_mission, ${q(TIERS[k].list)}, 'SUZALI', 'Fichier dentistes France (Google Maps, agence) nettoyé', ${json({ importType: "sql", tier: TIERS[k].label, practices: tierRows.length })}, now());
        IF v_campaign IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'List' AND column_name = 'campaignId') THEN
            EXECUTE 'UPDATE "List" SET "campaignId" = $1 WHERE id = $2' USING v_campaign, v_list;
        END IF;
    END IF;
    SELECT count(*) INTO v_count FROM "Company" WHERE "listId" = v_list;
    IF v_count > 0 THEN
        RAISE NOTICE '${TIERS[k].list}: already holds % companies, not re-imported', v_count;
    ELSE
${chunks(companies).map((c) => `        INSERT INTO "Company" (id, "listId", name, country, industry, phone, "customData", status, "updatedAt") VALUES\n        ${c.join(",\n        ")}\n        ON CONFLICT (id) DO NOTHING;`).join("\n")}
${chunks(contacts).map((c) => `        INSERT INTO "Contact" (id, "companyId", "firstName", "lastName", title, email, phone, "additionalPhones", "additionalEmails", status, "updatedAt") VALUES\n        ${c.join(",\n        ")}\n        ON CONFLICT (id) DO NOTHING;`).join("\n")}
        RAISE NOTICE '${TIERS[k].list}: ${tierRows.length} cabinets imported';
    END IF;
`;
    };
    const count = (k: TierKey) => rows.filter((r) => r.tier === k).length;
    const sql = `-- ============================================
-- Denterlab — cleaned dental practices (agency's national dentist file)
-- Generated by scripts/denterlab/build.ts — do not edit by hand.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/denterlab/import.sql
--
-- Fills the existing mission « ${MISSION} » (client Denterlab); fails if it is missing.
-- One transaction, safe to re-run. 4 lists:
${(Object.keys(TIERS) as TierKey[]).map((k) => `--   ${TIERS[k].list}: ${count(k)}`).join("\n")}
-- Exclusion rules are not applied by this file.
-- ============================================

\\set ON_ERROR_STOP on
BEGIN;

DO $do$
DECLARE
    v_mission  text;
    v_campaign text;
    v_list     text;
    v_count    integer;
BEGIN
    SELECT m.id INTO v_mission FROM "Mission" m JOIN "Client" c ON c.id = m."clientId"
     WHERE lower(c.name) = 'denterlab' AND m.name = ${q(MISSION)} LIMIT 1;
    IF v_mission IS NULL THEN
        RAISE EXCEPTION 'Mission « ${MISSION} » not found: import the Denterlab mission first (scripts/missions-2026-11).';
    END IF;
    SELECT id INTO v_campaign FROM "Campaign" WHERE "missionId" = v_mission AND name = ${q(CAMPAIGN)} LIMIT 1;
${(Object.keys(TIERS) as TierKey[]).map(block).join("")}
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
    const { rows, report } = build(await loadTouches(dir));
    writeCsv(rows);
    writeSql(rows);
    console.log(JSON.stringify(report, null, 2));
    console.log(`Wrote base-denterlab.csv and import.sql: ${rows.length} practices`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
