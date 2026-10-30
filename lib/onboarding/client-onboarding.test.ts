import { test } from "node:test";
import assert from "node:assert/strict";
import {
    buildOnboardingRecap,
    callMatchesQuery,
    cleanTaskSubject,
    summaryPreview,
    toLeexiCallDetail,
    toLeexiCallSummary,
    unwrapLeexi,
    websiteFromCustomers,
    type RawLeexiCall,
} from "../leexi/normalize";
import { companiesMatch, recapMatchesClient } from "../leexi/matching";
import { bracketsToVariables, normalizePlaybook, normalizeWebsite, plausibleStartDate } from "../playbook/leexi-types";
import {
    addMonths,
    buildCampaignScript,
    formatObjectionHandling,
    plainTextToHtml,
    sequenceEmailName,
    templateVariables,
} from "./client-create";
import {
    buildCreatePayload,
    clientStepErrors,
    formValuesFromPlaybook,
    initialForm,
    isAiValue,
    mergeExtraction,
    missingItems,
} from "../../components/manager/client-onboarding/form";

const CTX = { internalDomains: ["captainprospect.fr", "suzaliconseil.com"] };

/** Shape of a real GET /v1/calls item (2026-10-26), contents made up. */
const RAW_CALL: RawLeexiCall = {
    uuid: "ab12-cd34",
    title: "Calipso & Captain Prospect",
    performed_at: "2026-10-20T09:00:00.000Z",
    duration: 3720,
    leexi_url: "https://app.leexi.ai/calls/ab12-cd34",
    summary: "# Rapport détaillé\n\n## Mise en contexte\nMichael présente Calipso Formation.\n\n## Chiffres clés\n- 20 RDV par mois",
    conversation_type: { slug: "sales_visio_demo" },
    deal: { name: "Calipso - Michael benhamou", status: "open", crm: "hubspot", stage: { name: "Premier RDV" } },
    owner: { name: "MAK", email: "mak@captainprospect.fr" },
    participating_users: [{ name: "MAK", email: "mak@captainprospect.fr" }],
    customers: [
        { name: "Michael Benhamou", email: "michael@calipsoformation.org", phone_number: null },
        { name: "Jean-François Manière", email: "jf@captainprospect.fr" },
        { name: "Calendly Nоtеtаkеr", email: null },
    ],
    prompts: [
        { title: "summary", completions: ["…"] },
        { title: "salesplaybook", completions: ["## SWOT\n- Forces : réseau"] },
    ],
    tasks: [
        { subject: "🧪 Envoyer le devis signé (short)", active: true },
        { subject: "Ancienne tâche", active: false },
    ],
};

// ============================================
// LEEXI MAPPING
// ============================================

test("a Leexi call maps uuid, performed_at, deal and drops our team and bots from customers", () => {
    const call = toLeexiCallSummary(RAW_CALL, CTX);
    assert.equal(call.id, "ab12-cd34");
    assert.equal(call.date, "2026-10-20T09:00:00.000Z");
    assert.equal(call.duration, 3720);
    assert.equal(call.type, "sales_visio_demo");
    assert.deepEqual(call.customers.map((c) => c.name), ["Michael Benhamou"]);
    assert.deepEqual(call.users, ["MAK"]);
    assert.deepEqual(call.deal, { name: "Calipso - Michael benhamou", stage: "Premier RDV", status: "open" });
    assert.equal(call.companyName, "Calipso");
    assert.equal(call.hasSummary, true);
    assert.equal(call.hasSalesPlaybook, true);
    assert.ok(call.matchKeys.includes("calipsoformation"));
});

test("without a deal the company comes from a professional email domain, never from gmail", () => {
    const call = toLeexiCallSummary({ ...RAW_CALL, deal: null, customers: [{ name: "Octave", email: "octave@octofilms.fr" }] }, CTX);
    assert.equal(call.companyName, "Octofilms");
    const gmail = toLeexiCallSummary({ ...RAW_CALL, deal: null, customers: [{ name: "Léa", email: "lea@gmail.com" }] }, CTX);
    assert.equal(gmail.companyName, "");
    assert.equal(websiteFromCustomers(gmail.customers), "");
    assert.equal(websiteFromCustomers(call.customers), "https://www.octofilms.fr");
});

test("detail keeps the sales playbook prompt and active tasks, cleaned", () => {
    const detail = toLeexiCallDetail({ ...RAW_CALL, simple_transcript: "MAK: Bonjour" }, CTX);
    assert.equal(detail.salesPlaybook, "## SWOT\n- Forces : réseau");
    assert.deepEqual(detail.followUpTasks, ["Envoyer le devis signé"]);
    assert.equal(detail.transcript, "MAK: Bonjour");
});

test("the onboarding recap names both sides, the deal, the summary and the tasks", () => {
    const recap = buildOnboardingRecap(toLeexiCallDetail(RAW_CALL, CTX), "Captain Prospect");
    assert.match(recap, /Équipe Captain Prospect : MAK/);
    assert.match(recap, /Participants côté client : Michael Benhamou <michael@calipsoformation\.org>/);
    assert.match(recap, /Deal CRM : Calipso - Michael benhamou \(étape : Premier RDV\)/);
    assert.match(recap, /^Appel enregistré : Calipso & Captain Prospect/);
    assert.match(recap, /## Résumé de l'appel\n# Rapport détaillé/);
    assert.doesNotMatch(recap, /Leexi/, "the recorder's name must not look like a company in the text");
    assert.match(recap, /## Analyse commerciale de l'appel/);
    assert.match(recap, /- Envoyer le devis signé/);
    assert.doesNotMatch(recap, /## Transcription/);
});

test("a call Leexi has not summarised yet falls back to the transcript", () => {
    const recap = buildOnboardingRecap(
        toLeexiCallDetail({ ...RAW_CALL, summary: "", prompts: [], simple_transcript: "Client: on veut 20 RDV" }, CTX),
        "Captain Prospect",
    );
    assert.match(recap, /## Transcription\nClient: on veut 20 RDV/);
});

test("list and detail bodies are unwrapped from { data }", () => {
    assert.deepEqual(unwrapLeexi<number[]>({ data: [1, 2], pagination: {} }), [1, 2]);
    assert.deepEqual(unwrapLeexi<number[]>([3]), [3]);
});

test("search matches every word, accents and case ignored, across people and deal", () => {
    const call = toLeexiCallSummary(RAW_CALL, CTX);
    assert.equal(callMatchesQuery(call, "calipso michael"), true);
    assert.equal(callMatchesQuery(call, "BENHAMOU"), true);
    assert.equal(callMatchesQuery(call, "calipsoformation.org"), true);
    assert.equal(callMatchesQuery(call, "calipso octave"), false);
});

test("summary preview drops markdown headings", () => {
    assert.equal(summaryPreview("# Titre\n\n## Contexte\nLigne un.\nLigne deux."), "Ligne un. Ligne deux.");
});

test("task subjects lose their emoji and size tag", () => {
    assert.equal(cleanTaskSubject("📅 Organiser un point hebdo (short)"), "Organiser un point hebdo");
});

// ============================================
// MATCHING
// ============================================

test("company matching tolerates legal forms, accents and joined domains, not short names", () => {
    assert.equal(companiesMatch("Calipso Formation", "calipsoformation"), true);
    assert.equal(companiesMatch("Marron & Associés", "MARRON ASSOCIES SAS"), true);
    assert.equal(companiesMatch("Le Grand Casting", "Point Le Grand Casting X Captain Prospect"), true);
    assert.equal(companiesMatch("BY K", "Bilan by k et suivi"), false);
    assert.equal(companiesMatch("Acme", "Acmetal"), false);
    const call = toLeexiCallSummary(RAW_CALL, CTX);
    assert.equal(recapMatchesClient("Calipso", call), true);
    assert.equal(recapMatchesClient("Octofilms", call), false);
});

// ============================================
// PLAYBOOK NORMALIZER
// ============================================

test("call scripts returned as objects become text, echoed placeholders are dropped", () => {
    const pb = normalizePlaybook({
        call_scripts: [
            { title: "Qualification", script: "Bonjour [Prénom], je vous appelle de la part de Calipso." },
            "Script qualification...",
            "",
        ],
    });
    assert.deepEqual(pb.call_scripts, ["Qualification\nBonjour {{firstName}}, je vous appelle de la part de Calipso."]);
});

test("the agency's own people never end up as client contacts", () => {
    const pb = normalizePlaybook(
        {
            key_contacts: [
                { name: "Clément Ricol", role: "Responsable partenariats", email: "c.ricol@mbway.fr" },
                { name: "Hichem", role: "Représentant de Captain Prospect", email: "" },
                { name: "MAK", role: "Chef de projet", email: "" },
                { name: "Valentin", role: "", email: "valentin@captainprospect.fr" },
                { name: "", role: "", email: "pas-un-email" },
            ],
        },
        { agencyName: "Captain Prospect", internalDomains: ["captainprospect.fr"], internalNames: ["MAK"] },
    );
    assert.deepEqual(pb.key_contacts.map((c) => c.name), ["Clément Ricol"]);
});

test("start dates outside [today - 7 days, today + 1 year] are dropped", () => {
    assert.equal(plausibleStartDate("2024-06-03", "2026-10-26"), "");
    assert.equal(plausibleStartDate("2026-11-02", "2026-10-26"), "2026-11-02");
    assert.equal(plausibleStartDate("2026-10-22", "2026-10-26"), "2026-10-22");
    assert.equal(plausibleStartDate("début novembre", "2026-10-26"), "");
    const pb = normalizePlaybook({ mission_params: { start_date: "2023-11-01", rdv_target_per_month: "15", working_days_per_month: 40 } }, { today: "2026-10-26" });
    assert.equal(pb.mission_params.start_date, "");
    assert.equal(pb.mission_params.rdv_target_per_month, 15);
    assert.equal(pb.mission_params.working_days_per_month, 23);
});

test("websites are normalised, prose and emails rejected", () => {
    assert.equal(normalizeWebsite("www.mbway.fr/"), "https://www.mbway.fr");
    assert.equal(normalizeWebsite("https://acme.io/fr"), "https://acme.io/fr");
    assert.equal(normalizeWebsite("non précisé"), "");
    assert.equal(normalizeWebsite("contact@acme.fr"), "");
});

test("bracket placeholders become template variables", () => {
    assert.equal(
        bracketsToVariables("Bonjour [Prénom], chez [Entreprise] … [Votre nom]"),
        "Bonjour {{firstName}}, chez {{companyName}} … {{senderName}}",
    );
});

test("email steps with neither subject nor body are dropped; a bad payload is an empty playbook", () => {
    const pb = normalizePlaybook({ email_sequence: [{ subject: "", body: "" }, { subject: "Objet", body: ["Ligne 1", "Ligne 2"] }] });
    assert.deepEqual(pb.email_sequence, [{ subject: "Objet", body: "Ligne 1\nLigne 2" }]);
    assert.equal(normalizePlaybook(null).company_name, "");
    assert.deepEqual(normalizePlaybook("oops").key_contacts, []);
});

// ============================================
// CLIENT CREATION HELPERS
// ============================================

test("campaign script uses the delimiters every script reader parses", () => {
    assert.equal(
        buildCampaignScript({ intro: "Bonjour", discovery: "", objection: "« Pas le temps »\n→ 2 minutes", closing: "Mardi ou jeudi ?" }),
        "--- Introduction ---\nBonjour\n\n--- Objections ---\n« Pas le temps »\n→ 2 minutes\n\n--- Closing ---\nMardi ou jeudi ?",
    );
    assert.equal(buildCampaignScript(undefined), "");
});

test("objection handling is formatted once, without doubled quotes", () => {
    assert.equal(
        formatObjectionHandling([{ objection: "« On a déjà un prestataire »", response: "Comparons." }, { objection: " ", response: "x" }]),
        "« On a déjà un prestataire »\n→ Comparons.",
    );
});

test("plain-text emails become paragraphs; HTML and specials are handled", () => {
    assert.equal(plainTextToHtml("Bonjour {{firstName}},\n\nLigne 1\nLigne 2 <ok>"), "<p>Bonjour {{firstName}},</p><p>Ligne 1<br>Ligne 2 &lt;ok&gt;</p>");
    assert.equal(plainTextToHtml("<p>Déjà</p>"), "<p>Déjà</p>");
    assert.deepEqual(templateVariables("Bonjour {{firstName}}", "{{ companyName|vous }} {{firstName}}"), ["firstName", "companyName"]);
});

test("sequence emails are named by send day", () => {
    assert.equal(sequenceEmailName(0, "Calipso"), "Calipso · J1");
    assert.equal(sequenceEmailName(3, "Calipso"), "Calipso · J+10");
    assert.equal(sequenceEmailName(4, "Calipso"), "Calipso · Email 5");
});

test("mission end date adds calendar months, clamped to month end", () => {
    assert.equal(addMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString().slice(0, 10), "2026-02-28");
    assert.equal(addMonths(new Date("2026-10-26T10:00:00Z"), 3).toISOString().slice(0, 10), "2027-01-26");
});

// ============================================
// WIZARD FORM MODEL
// ============================================

test("re-extraction fills untouched fields and keeps the user's corrections", () => {
    const defaults = initialForm("2026-10-26");
    const first = formValuesFromPlaybook(
        normalizePlaybook({
            company_name: "Calipso",
            sector: "Formation",
            target_roles: ["DRH"],
            key_contacts: [{ name: "Michael Benhamou", role: "Directeur", email: "michael@calipso.fr" }],
            mission_params: { channel: "EMAIL", rdv_target_per_month: 15 },
        }),
    );
    let form = mergeExtraction(defaults, first, null, defaults);
    assert.equal(form.name, "Calipso");
    assert.equal(form.email, "michael@calipso.fr");
    assert.deepEqual(form.missionChannels, ["EMAIL"]);
    assert.equal(form.missionRdvTarget, 15);
    assert.equal(form.contacts[0].asInterlocuteur, true);
    assert.equal(isAiValue(form, first, "name"), true);

    form = { ...form, name: "Calipso Formation" };
    const second = formValuesFromPlaybook(normalizePlaybook({ company_name: "Calipso SAS", sector: "Éducation", target_roles: ["DRH", "DAF"] }));
    form = mergeExtraction(form, second, first, defaults);
    assert.equal(form.name, "Calipso Formation", "edited by the user: kept");
    assert.equal(form.industry, "Éducation", "untouched since the first extraction: replaced");
    assert.deepEqual(form.targetJobTitles, ["DRH", "DAF"]);
    assert.equal(isAiValue(form, second, "name"), false);
});

test("the payload carries website, contacts, channels, checklist and the archived recap", () => {
    const form = {
        ...initialForm("2026-10-26"),
        name: " Calipso ",
        website: "calipso.fr",
        contacts: [{ key: "k", name: "Michael Benhamou", role: "Directeur", email: "m@calipso.fr", phone: "", asInterlocuteur: true }],
        missionChannels: ["CALL", "EMAIL"] as Array<"CALL" | "EMAIL" | "LINKEDIN">,
        introScript: "Bonjour {{firstName}}",
        emails: [
            { key: "e1", subject: "Objet", body: "Corps", include: true },
            { key: "e2", subject: "Exclu", body: "x", include: false },
        ],
    };
    const payload = buildCreatePayload(form, null, { mode: "paste", recapText: "Récap de l'appel de closing", leexiCall: null });
    assert.equal(payload.name, "Calipso");
    assert.equal(payload.website, "calipso.fr");
    assert.deepEqual(payload.missionChannels, ["CALL", "EMAIL"]);
    assert.equal(payload.missionChannel, "CALL");
    assert.deepEqual(payload.emailTemplates, [{ subject: "Objet", body: "Corps" }]);
    assert.equal((payload.contacts as Array<{ asInterlocuteur: boolean }>)[0].asInterlocuteur, true);
    assert.equal(payload.startChecklist, true);
    assert.equal(payload.checklistStartDay, "2026-10-26");
    assert.deepEqual(payload.leexiImport, { leexiCallId: undefined, source: "paste", rawRecap: "Récap de l'appel de closing", callTitle: undefined, callDate: null, callDuration: undefined });
    const pb = payload.salesPlaybook as { phone_script: string; email_sequence: unknown[] };
    assert.equal(pb.phone_script, "Bonjour {{firstName}}", "a manual client still gets a playbook once there is content");
    assert.equal(pb.email_sequence.length, 1);
    assert.equal(buildCreatePayload({ ...initialForm("2026-10-26"), name: "X" }, null, { mode: "manual", recapText: "" }).leexiImport, undefined);
});

test("missing items point to the step that fixes them", () => {
    const items = missingItems({ ...initialForm("2026-10-26"), name: "X" });
    assert.ok(items.some((i) => i.label === "Email du client" && i.step === "client"));
    assert.ok(items.some((i) => i.label === "Date de lancement" && i.step === "launch"));
    assert.deepEqual(clientStepErrors({ ...initialForm("2026-10-26"), name: "", email: "pas-un-email" }), {
        name: "Le nom de l'entreprise est requis.",
        email: "Adresse email invalide.",
    });
});

test("a colleague invited without email is recognised by name, accents and hyphens aside", () => {
    const call = toLeexiCallSummary(
        { ...RAW_CALL, customers: [{ name: "Jean François Manière" }, { name: "Claudine Prost" }] },
        { ...CTX, internalNames: ["Jean-Francois Maniere"] },
    );
    assert.deepEqual(call.customers.map((c) => c.name), ["Claudine Prost"]);
    const pb = normalizePlaybook({ key_contacts: [{ name: "Jean-François Manière", role: "Manager" }, { name: "Claudine Prost", role: "DRH" }] }, { internalNames: ["Jean Francois Maniere"] });
    assert.deepEqual(pb.key_contacts.map((c) => c.name), ["Claudine Prost"]);
});

test("a summary that is the sales playbook is sent once", () => {
    const same = "# Rapport\nContenu identique";
    const recap = buildOnboardingRecap(
        toLeexiCallDetail({ ...RAW_CALL, summary: same, prompts: [{ title: "salesplaybook", completions: [same] }] }, CTX),
        "Captain Prospect",
    );
    assert.equal(recap.split("Contenu identique").length - 1, 1);
    assert.doesNotMatch(recap, /## Analyse commerciale de l'appel/);
});

test("the call recorder or the agency is never kept as the client's company", () => {
    assert.equal(normalizePlaybook({ company_name: "Leexi" }).company_name, "");
    assert.equal(normalizePlaybook({ company_name: "Captain Prospect" }, { agencyName: "Captain Prospect" }).company_name, "");
    assert.equal(normalizePlaybook({ company_name: "Club Dilivia" }, { agencyName: "Captain Prospect" }).company_name, "Club Dilivia");
});
