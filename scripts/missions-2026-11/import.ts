// ============================================
// Import the two missions Hichem Hammouche sent by email on 2026-11-09.
//
//   npm run missions:import-2026-11                 dry run: parses, reads the DB, writes nothing
//   npm run missions:import-2026-11 -- --apply      writes
//   ... -- --apply --by manager@suzalink.com        author of the client onboarding records
//
// 1. N2F (« N2F campagnes ») — client N2F, mission « N2F — Prospection DAF »,
//    campaign « N2F — DAF » (no script in the mail: pitch to complete), and the
//    list « Base DAF N2F » from data/n2f-daf-base.xlsx (401 rows, 371 companies).
// 2. Denterlab (« DENTERLAB mission ») — client Denterlab, mission
//    « Denterlab — Cabinets dentaires », campaign with the call script
//    (data/denterlab-script.txt). No list yet: Hichem has not sent one.
//
// Idempotent: clients are matched by name (case-insensitive), missions,
// campaigns and lists by name inside their parent; anything found is reused
// and nothing is imported twice. Missions are created as DRAFT, like the
// « Nouvelle mission » form: assign SDRs, then activate them in the app.
// ============================================

import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import { buildN2fCompanies, readSheetRows, type N2fParseResult } from "./rows";

const DATA = join(__dirname, "data");
const RECEIVED = "2026-11-09";
const SENDER = "Hichem Hammouche";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const byIdx = args.indexOf("--by");
const byEmail = byIdx >= 0 ? args[byIdx + 1]?.trim().toLowerCase() : undefined;

type MissionSpec = {
    client: { name: string; industry: string; website?: string; brief: string };
    mission: { name: string; objective: string };
    campaign: { name: string; icp: string; pitch: string; script: string | null };
    list?: { name: string; source: string; file: string };
};

const N2F: MissionSpec = {
    client: {
        name: "N2F",
        industry: "Logiciel SaaS — gestion des notes de frais",
        website: "https://www.n2f.com/",
        brief: `Mail « N2F campagnes » de ${SENDER} (${RECEIVED}) : lien https://www.n2f.com/ et la base DAF « N2Fdaf-base-pour-suzalie-conseil.xlsx ».`,
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
    list: {
        name: "Base DAF N2F",
        source: `Fichier client N2F (mail de ${SENDER}, ${RECEIVED})`,
        file: "n2f-daf-base.xlsx",
    },
};

const DENTERLAB: MissionSpec = {
    client: {
        name: "Denterlab",
        industry: "Laboratoire de prothèses dentaires (Paris)",
        brief: `Mail « DENTERLAB mission » de ${SENDER} (${RECEIVED}) : script d'appel en 4 phases + objections. Pas encore de liste.`,
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
        script: readFileSync(join(DATA, "denterlab-script.txt"), "utf8").trim(),
    },
};

function addMonths(date: Date, months: number): Date {
    const d = new Date(date.getTime());
    d.setMonth(d.getMonth() + months);
    return d;
}

type Tx = Prisma.TransactionClient | PrismaClient;

async function findOrCreateClient(db: Tx, spec: MissionSpec, authorId: string | null) {
    const existing = await db.client.findFirst({ where: { name: { equals: spec.client.name, mode: "insensitive" } } });
    if (existing) return { client: existing, created: false };
    const client = await db.client.create({ data: { name: spec.client.name, industry: spec.client.industry } });
    if (authorId) {
        await db.clientOnboarding.create({
            data: {
                clientId: client.id,
                status: "IN_PROGRESS",
                onboardingData: {
                    ...(spec.client.website ? { website: spec.client.website } : {}),
                    icp: spec.campaign.icp,
                    pitch: spec.campaign.pitch,
                },
                scripts: spec.campaign.script ? { base: spec.campaign.script } : {},
                notes: spec.client.brief,
                createdById: authorId,
            },
        });
    }
    return { client, created: true };
}

async function findOrCreateMission(db: Tx, clientId: string, spec: MissionSpec) {
    const existing = await db.mission.findFirst({ where: { clientId, name: spec.mission.name } });
    if (existing) return { mission: existing, created: false };
    const startDate = new Date();
    const mission = await db.mission.create({
        data: {
            clientId,
            name: spec.mission.name,
            objective: spec.mission.objective,
            channel: "CALL",
            channels: ["CALL"],
            startDate,
            endDate: addMonths(startDate, 3),
            status: "DRAFT",
            isActive: false,
        },
    });
    return { mission, created: true };
}

async function findOrCreateCampaign(db: Tx, missionId: string, spec: MissionSpec) {
    const existing = await db.campaign.findFirst({ where: { missionId, name: spec.campaign.name } });
    if (existing) return { campaign: existing, created: false };
    const campaign = await db.campaign.create({
        data: {
            missionId,
            name: spec.campaign.name,
            icp: spec.campaign.icp,
            pitch: spec.campaign.pitch,
            script: spec.campaign.script,
            isActive: true,
        },
    });
    return { campaign, created: true };
}

async function importN2fList(
    db: Tx,
    missionId: string,
    campaignId: string,
    spec: NonNullable<MissionSpec["list"]>,
    parsed: N2fParseResult,
) {
    const { calculateCompanyCompleteness, calculateContactCompleteness } = await import("../../lib/scoring");
    const existing = await db.list.findFirst({ where: { missionId, name: spec.name, isArchived: false } });
    if (existing) {
        const count = await db.company.count({ where: { listId: existing.id } });
        if (count > 0) return { list: existing, created: false, companies: 0, contacts: 0, alreadyThere: count };
    }
    const list =
        existing ??
        (await db.list.create({
            data: {
                missionId,
                campaignId,
                name: spec.name,
                type: "CLIENT",
                source: spec.source,
                importConfig: {
                    importType: "script",
                    file: spec.file,
                    receivedAt: RECEIVED,
                    sentBy: SENDER,
                    importedAt: new Date().toISOString(),
                    rows: parsed.rows,
                    duplicateRowsMerged: parsed.duplicateRowsMerged,
                },
            },
        }));

    let contacts = 0;
    for (const company of parsed.companies) {
        const contactRows = company.contacts.map((c) => ({
            firstName: c.firstName,
            lastName: c.lastName,
            title: c.title,
            phone: c.phone,
            ...(c.additionalPhones.length ? { additionalPhones: c.additionalPhones } : {}),
            ...(c.fileStatus ? { customData: { "Statut (fichier N2F)": c.fileStatus } } : {}),
            status: calculateContactCompleteness({
                firstName: c.firstName,
                lastName: c.lastName,
                title: c.title,
                phone: c.phone,
            }),
        }));
        await db.company.create({
            data: {
                listId: list.id,
                name: company.name,
                status: calculateCompanyCompleteness({ name: company.name, contacts: contactRows }),
                contacts: { create: contactRows },
            },
        });
        contacts += contactRows.length;
    }
    return { list, created: !existing, companies: parsed.companies.length, contacts, alreadyThere: 0 };
}

async function main() {
    const parsed = buildN2fCompanies(await readSheetRows(join(DATA, N2F.list!.file)));
    const contactCount = parsed.companies.reduce((n, c) => n + c.contacts.length, 0);
    console.log(`N2F file: ${parsed.rows} rows → ${parsed.companies.length} companies, ${contactCount} contacts (${parsed.duplicateRowsMerged} duplicate rows merged)`);
    if (parsed.unparsedPhones.length) console.log(`  numbers kept as written (not a valid format): ${parsed.unparsedPhones.join(" | ")}`);
    console.log(`Denterlab script: ${DENTERLAB.campaign.script?.length ?? 0} characters, no list`);

    if (!process.env.DATABASE_URL) {
        console.log("\nDATABASE_URL is not set: parse check only, nothing read or written.");
        return;
    }

    const { prisma } = await import("../../lib/prisma");
    try {
        const author = await prisma.user.findFirst({
            where: byEmail ? { email: byEmail } : { role: "MANAGER", isActive: true },
            orderBy: { createdAt: "asc" },
            select: { id: true, email: true },
        });
        if (byEmail && !author) throw new Error(`--by ${byEmail}: no such user`);

        if (!apply) {
            for (const spec of [N2F, DENTERLAB]) {
                const client = await prisma.client.findFirst({
                    where: { name: { equals: spec.client.name, mode: "insensitive" } },
                    select: { id: true, missions: { where: { name: spec.mission.name }, select: { id: true, lists: { select: { name: true, _count: { select: { companies: true } } } } } } },
                });
                const mission = client?.missions[0];
                console.log(`\n${spec.client.name}: client ${client ? "exists" : "would be created"}, mission ${mission ? "exists" : "would be created"}`);
                if (spec.list) {
                    const list = mission?.lists.find((l) => l.name === spec.list!.name);
                    console.log(`  list « ${spec.list.name} »: ${list ? `exists (${list._count.companies} companies, not re-imported)` : `would import ${parsed.companies.length} companies`}`);
                }
            }
            console.log(`\nOnboarding author: ${author?.email ?? "none found (onboarding records skipped)"}`);
            console.log("Dry run: nothing written. Re-run with --apply.");
            return;
        }

        for (const spec of [N2F, DENTERLAB]) {
            const result = await prisma.$transaction(
                async (tx) => {
                    const c = await findOrCreateClient(tx, spec, author?.id ?? null);
                    const m = await findOrCreateMission(tx, c.client.id, spec);
                    const camp = await findOrCreateCampaign(tx, m.mission.id, spec);
                    const l = spec.list ? await importN2fList(tx, m.mission.id, camp.campaign.id, spec.list, parsed) : null;
                    return { c, m, camp, l };
                },
                { timeout: 180_000, maxWait: 20_000 },
            );
            const tag = (created: boolean) => (created ? "created" : "already there");
            console.log(`\n${spec.client.name}`);
            console.log(`  client   ${result.c.client.id} (${tag(result.c.created)})`);
            console.log(`  mission  ${result.m.mission.id} « ${result.m.mission.name} » (${tag(result.m.created)}, status ${result.m.mission.status})`);
            console.log(`  campaign ${result.camp.campaign.id} « ${result.camp.campaign.name} » (${tag(result.camp.created)})`);
            if (result.l) {
                if (result.l.alreadyThere) {
                    console.log(`  list     ${result.l.list.id} already holds ${result.l.alreadyThere} companies: not re-imported`);
                } else {
                    const { applyActiveExclusionsToList } = await import("../../lib/exclusions/service");
                    const excluded = await applyActiveExclusionsToList(result.l.list.id);
                    console.log(`  list     ${result.l.list.id} « ${result.l.list.name} »: ${result.l.companies} companies, ${result.l.contacts} contacts`);
                    console.log(`           exclusions applied: ${excluded.companies} companies, ${excluded.contacts} contacts`);
                }
            }
        }
        console.log("\nDone. Missions are DRAFT: assign SDRs, then activate them in the app.");
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
