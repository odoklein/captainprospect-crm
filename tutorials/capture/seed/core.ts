// Fictional demo data for tutorial captures. Every company, person, phone
// number and email below is invented. Never run against a real database:
// the script refuses any DATABASE_URL that is not on localhost.
import { PrismaClient, type ActionResult, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

export const prisma = new PrismaClient();

if (!/@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("seed-demo: DATABASE_URL must point at a local database");
}

// Deterministic PRNG so every capture run sees identical data.
let state = 20261114;
export function rand() {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
}
export const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
export const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

export const DAY = 86_400_000;
/** A weekday `daysAgo` days back at hh:mm, Paris time approximated as local. */
export function at(daysAgo: number, h: number, m = 0) {
    const d = new Date(Date.now() - daysAgo * DAY);
    d.setHours(h, m, 0, 0);
    return d;
}
export function workdayAgo(n: number) {
    // n-th weekday before today (0 = today, or last weekday if weekend)
    const d = new Date();
    let k = 0;
    while (true) {
        const wd = d.getDay();
        if (wd !== 0 && wd !== 6) {
            if (k === n) break;
            k++;
        }
        d.setDate(d.getDate() - 1);
    }
    return Math.round((Date.now() - d.getTime()) / DAY);
}

const FIRST = ["Camille", "Lucas", "Inès", "Hugo", "Léa", "Nathan", "Chloé", "Théo", "Manon", "Louis", "Emma", "Jules", "Sarah", "Arthur", "Zoé", "Gabriel", "Alice", "Raphaël", "Julie", "Maxime", "Pauline", "Antoine", "Margaux", "Victor", "Elsa", "Paul", "Clara", "Simon", "Lina", "Adrien"];
const LAST = ["Morel", "Garnier", "Faure", "Rousseau", "Blanchard", "Chevalier", "Perrin", "Lemoine", "Marchand", "Duval", "Fontaine", "Roussel", "Gautier", "Mercier", "Bonnet", "Lambert", "Girard", "André", "Lefèvre", "Masson", "Barbier", "Renaud", "Picard", "Colin", "Vidal", "Caron", "Aubert", "Leclerc", "Brunet", "Meunier"];
const TITLES = ["Directeur commercial", "Directrice marketing", "DAF", "Directeur général", "Responsable achats", "DSI", "Head of Sales", "Responsable RH", "Directeur des opérations", "COO"];
const PREFIX = ["Atelier", "Groupe", "Studio", "Maison", "Cabinet", "Laboratoires", "Transports", "Éditions", "Solutions", "Compagnie"];
const ROOT = ["Morvan", "Belvédère", "Calanque", "Orpailleur", "Sirocco", "Marelle", "Brasero", "Héliotrope", "Quartzite", "Ondine", "Lavandin", "Corail", "Sémaphore", "Vigie", "Altaïr", "Boréal", "Cerfeuil", "Galet", "Mistral", "Pervenche", "Rocaille", "Tilleul", "Vermeil", "Zéphyr", "Ardoise", "Bruyère", "Cobalt", "Dune", "Écume", "Fougère"];
const SUFFIX = ["", " SAS", " & Associés", " Industrie", " Conseil", " France", " Services", ""];
const CITIES = ["Lyon", "Nantes", "Lille", "Bordeaux", "Rennes", "Toulouse", "Grenoble", "Strasbourg", "Montpellier", "Dijon"];
const INDUSTRIES = ["Logistique", "Industrie", "Logiciel", "Santé", "Agroalimentaire", "BTP", "Énergie", "Distribution", "Services B2B", "Formation"];
const SIZES = ["11-50", "51-200", "201-500", "501-1000"];

export const phone = () => `+33 ${pick(["1", "2", "3", "4", "5"])} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`;
export const mobile = () => `+33 6 ${int(10, 99)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`;
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const usedCompanyNames = new Set<string>();
function companyName() {
    for (;;) {
        const n = `${pick(PREFIX)} ${pick(ROOT)}${pick(SUFFIX)}`;
        if (!usedCompanyNames.has(n)) { usedCompanyNames.add(n); return n; }
    }
}

export const ids = {
    manager: "demo-manager",
    sdrs: [] as string[],
    clients: [] as string[],
    missions: [] as string[],
    campaigns: [] as string[],
    lists: [] as string[],
    companies: [] as string[],
    contacts: [] as { id: string; companyId: string; listIdx: number }[],
    meetings: [] as string[],
    interlocuteurs: [] as string[],
};

export const CLIENTS = [
    { id: "demo-client-nordline", name: "Nordline Logistique", industry: "Logistique", email: "contact@nordline.example" },
    { id: "demo-client-verdane", name: "Verdane Énergie", industry: "Énergie", email: "bonjour@verdane.example" },
    { id: "demo-client-opaline", name: "Opaline Santé", industry: "Santé", email: "contact@opaline.example" },
    { id: "demo-client-kestrel", name: "Kestrel Logiciels", industry: "Logiciel", email: "hello@kestrel.example" },
    { id: "demo-client-larcher", name: "Maison Larcher", industry: "Distribution", email: "contact@larcher.example" },
];

export const SDRS = [
    { name: "Camille Morel", email: "camille.morel@demo.example" },
    { name: "Hugo Faure", email: "hugo.faure@demo.example" },
    { name: "Inès Garnier", email: "ines.garnier@demo.example" },
    { name: "Théo Rousseau", email: "theo.rousseau@demo.example" },
    { name: "Léa Chevalier", email: "lea.chevalier@demo.example" },
    { name: "Nathan Perrin", email: "nathan.perrin@demo.example" },
];

const MISSIONS = [
    { client: 0, name: "Nordline — Directeurs supply chain", objective: "Décrocher des RDV avec les directeurs supply chain des PME industrielles", target: 24 },
    { client: 0, name: "Nordline — Relance clients dormants", objective: "Réactiver les comptes sans commande depuis 12 mois", target: 10 },
    { client: 1, name: "Verdane — Audit énergétique PME", objective: "Proposer un audit énergétique gratuit aux PME de plus de 50 salariés", target: 30 },
    { client: 2, name: "Opaline — Cliniques privées", objective: "Présenter la téléconsultation aux directions de cliniques", target: 18 },
    { client: 3, name: "Kestrel — DSI ETI", objective: "Démo de la plateforme RH auprès des DSI d'ETI", target: 20 },
    { client: 4, name: "Larcher — Acheteurs grande distribution", objective: "Référencer la gamme épicerie fine", target: 12 },
];

/** Result mix of a realistic call day. */
const RESULTS: [ActionResult, number][] = [
    ["NO_RESPONSE", 46], ["CALLBACK_REQUESTED", 12], ["NOT_INTERESTED", 10], ["BAD_CONTACT", 5],
    ["INTERESTED", 7], ["REFUS_ARGU", 6], ["FAUX_NUMERO", 3], ["GERE_PAR_SIEGE", 3], ["MEETING_BOOKED", 4],
];
function result(): ActionResult {
    const total = RESULTS.reduce((s, [, w]) => s + w, 0);
    let r = rand() * total;
    for (const [res, w] of RESULTS) { r -= w; if (r <= 0) return res; }
    return "NO_RESPONSE";
}

const NOTES: Partial<Record<ActionResult, string[]>> = {
    CALLBACK_REQUESTED: ["Rappeler mardi matin, en réunion aujourd'hui.", "Souhaite qu'on le rappelle après le salon.", "Demande un rappel en fin de semaine."],
    NOT_INTERESTED: ["Contrat en cours jusqu'en 2027.", "Pas de budget cette année.", "Déjà équipé, satisfait du prestataire."],
    INTERESTED: ["Intéressé, veut une plaquette par email.", "Sujet prioritaire au T1, à relancer.", "Demande un chiffrage indicatif."],
    REFUS_ARGU: ["Trouve l'offre trop chère par rapport à l'existant.", "Pas convaincu par le ROI annoncé."],
    MEETING_BOOKED: ["RDV visio calé avec la DAF et le DG.", "RDV pris : besoin de remplacer l'outil actuel d'ici juin.", "Découverte du besoin, 30 min en visio."],
    GERE_PAR_SIEGE: ["Décision prise au siège à Paris."],
};

export async function wipe() {
    // Truncate every table except reference data seeded by prisma/seed.ts.
    const keep = new Set(["Permission", "RolePermission", "ResultCategory", "ActionStatusDefinition", "CompanyIssuer", "BrandSettings", "_prisma_migrations"]);
    const rows = await prisma.$queryRaw<{ tablename: string }[]>`select tablename from pg_tables where schemaname='public'`;
    const tables = rows.map((r) => r.tablename).filter((t) => !keep.has(t));
    if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(",")} CASCADE`);
}

export async function seedCore() {
    const password = await bcrypt.hash("demo1234", 8);

    await prisma.user.create({ data: { id: ids.manager, email: "manager@demo.example", password, name: "Claire Dumas", role: "MANAGER", phone: "+33 6 11 22 33 44" } });
    for (const [i, s] of SDRS.entries()) {
        const id = `demo-sdr-${i + 1}`;
        await prisma.user.create({ data: { id, email: s.email, password, name: s.name, role: i === 5 ? "BOOKER" : "SDR", managerId: ids.manager, lastConnectedAt: at(0, 9 + i, 5), lastSignInAt: at(0, 8, 50 + i) } });
        ids.sdrs.push(id);
    }

    for (const c of CLIENTS) {
        await prisma.client.create({ data: { id: c.id, name: c.name, industry: c.industry, email: c.email, phone: phone(), contractedDaysPerWeek: pick([2, 3, 5]), createdAt: at(int(60, 200), 10) } });
        ids.clients.push(c.id);
        for (let k = 0; k < 2; k++) {
            const f = pick(FIRST), l = pick(LAST);
            const it = await prisma.clientInterlocuteur.create({ data: { clientId: c.id, firstName: f, lastName: l, title: pick(["Directeur commercial", "Responsable grands comptes", "CEO"]), emails: [`${slug(f)}.${slug(l)}@${slug(c.name.split(" ")[0])}.example`], phones: [mobile()] } });
            ids.interlocuteurs.push(it.id);
        }
        await prisma.user.create({ data: { email: `client@${slug(c.name.split(" ")[0])}.example`, password, name: `${pick(FIRST)} ${pick(LAST)}`, role: "CLIENT", clientId: c.id } });
    }

    for (const [mi, m] of MISSIONS.entries()) {
        const id = `demo-mission-${mi + 1}`;
        await prisma.mission.create({
            data: {
                id, clientId: CLIENTS[m.client].id, name: m.name, objective: m.objective, targetMeetings: m.target, channel: "CALL", channels: ["CALL", "EMAIL"] as never,
                startDate: at(int(40, 90), 9), endDate: at(-int(60, 120), 18), status: mi === 1 ? "PAUSED" : "ACTIVE", isActive: mi !== 1, totalContractDays: int(20, 60),
                teamLeadSdrId: ids.sdrs[mi % 5], createdAt: at(int(40, 90), 9),
            } as Prisma.MissionUncheckedCreateInput,
        });
        ids.missions.push(id);
        for (let k = 0; k < 3; k++) {
            await prisma.sDRAssignment.create({ data: { missionId: id, sdrId: ids.sdrs[(mi + k) % ids.sdrs.length] } }).catch(() => {});
        }
        const camp = await prisma.campaign.create({ data: { missionId: id, name: `${m.name.split("—")[1]?.trim() ?? m.name} — appels`, icp: "PME et ETI françaises, 50 à 1000 salariés", pitch: `Bonjour, je vous appelle de la part de ${CLIENTS[m.client].name}. ${m.objective}.`, script: "1. Accroche\n2. Qualification du besoin\n3. Proposition de RDV" } });
        ids.campaigns.push(camp.id);
        const listNames = ["Fichier principal", "Salon 2026 — leads"];
        for (let li = 0; li < (mi < 4 ? 2 : 1); li++) {
            const list = await prisma.list.create({ data: { missionId: id, name: `${CLIENTS[m.client].name.split(" ")[0]} — ${listNames[li]}`, type: li === 0 ? "CLIENT" : "SUZALI", source: li === 0 ? "CSV" : "Apollo", campaignId: camp.id, createdAt: at(int(20, 60), 11) } });
            ids.lists.push(list.id);
            const n = li === 0 ? 22 : 12;
            for (let ci = 0; ci < n; ci++) {
                const name = companyName();
                const city = pick(CITIES);
                const company = await prisma.company.create({ data: { listId: list.id, name, country: "France", industry: pick(INDUSTRIES), website: `https://www.${slug(name)}.example`, size: pick(SIZES), phone: phone(), status: pick(["ACTIONABLE", "ACTIONABLE", "PARTIAL", "INCOMPLETE"] as const), customData: { ville: city } } });
                ids.companies.push(company.id);
                const nContacts = int(1, 3);
                for (let k = 0; k < nContacts; k++) {
                    const f = pick(FIRST), l = pick(LAST);
                    const contact = await prisma.contact.create({ data: { companyId: company.id, firstName: f, lastName: l, title: pick(TITLES), email: rand() < 0.8 ? `${slug(f)}.${slug(l)}@${slug(name)}.example` : null, phone: rand() < 0.85 ? mobile() : null, linkedin: rand() < 0.5 ? `https://www.linkedin.com/in/${slug(f)}-${slug(l)}-demo` : null, status: pick(["ACTIONABLE", "ACTIONABLE", "PARTIAL"] as const) } });
                    ids.contacts.push({ id: contact.id, companyId: company.id, listIdx: ids.lists.length - 1 });
                }
            }
        }
    }
}

export async function seedActions() {
    // Calls over the last 20 weekdays; today is busiest in the morning.
    const listToMission = new Map<number, number>();
    let li = 0;
    for (let mi = 0; mi < MISSIONS.length; mi++) for (let k = 0; k < (mi < 4 ? 2 : 1); k++) listToMission.set(li++, mi);

    const actions: Prisma.ActionCreateManyInput[] = [];
    for (let w = 0; w < 20; w++) {
        const daysAgo = workdayAgo(w);
        const perDay = w === 0 ? 70 : int(80, 130);
        for (let k = 0; k < perDay; k++) {
            const c = pick(ids.contacts);
            const mi = listToMission.get(c.listIdx) ?? 0;
            if (mi === 1 && w < 10) continue; // paused mission: no recent calls
            const res = result();
            const sdr = ids.sdrs[(mi + int(0, 2)) % ids.sdrs.length];
            const hour = w === 0 ? int(9, 12) : int(9, 17);
            const createdAt = at(daysAgo, hour, int(0, 59));
            const note = NOTES[res] ? pick(NOTES[res]!) : null;
            actions.push({
                contactId: c.id, companyId: c.companyId, sdrId: sdr, campaignId: ids.campaigns[mi], channel: "CALL", result: res,
                note, duration: res === "NO_RESPONSE" ? int(5, 30) : int(40, 420), createdAt,
                callbackDate: res === "CALLBACK_REQUESTED" ? at(daysAgo - int(1, 5), int(9, 17)) : res === "MEETING_BOOKED" ? at(daysAgo - int(2, 12), int(9, 17)) : null,
                meetingType: res === "MEETING_BOOKED" ? pick(["VISIO", "VISIO", "PHYSIQUE", "TELEPHONIQUE"]) : null,
                meetingCategory: res === "MEETING_BOOKED" ? pick(["EXPLORATOIRE", "BESOIN"]) : null,
                meetingJoinUrl: res === "MEETING_BOOKED" ? "https://meet.demo.example/rdv" : null,
                confirmationStatus: res === "MEETING_BOOKED" ? (w < 3 ? "PENDING" : pick(["CONFIRMED", "CONFIRMED", "CONFIRMED", "CANCELLED"])) : "PENDING",
                confirmedAt: res === "MEETING_BOOKED" && w >= 3 ? at(daysAgo - 1, 10) : null,
                confirmedById: res === "MEETING_BOOKED" && w >= 3 ? ids.manager : null,
                interlocuteurId: res === "MEETING_BOOKED" ? pick(ids.interlocuteurs) : null,
                callSummary: res !== "NO_RESPONSE" && rand() < 0.6 ? `Échange de ${int(2, 6)} min. ${note ?? "Le prospect a écouté la présentation."} Prochaine étape notée dans la fiche.` : null,
            });
        }
    }
    await prisma.action.createMany({ data: actions });
    const meetings = await prisma.action.findMany({ where: { result: "MEETING_BOOKED" }, select: { id: true } });
    ids.meetings = meetings.map((m) => m.id);
    return actions.length;
}
