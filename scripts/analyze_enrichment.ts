import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    // 1. Fetch Users
    const { data: users } = await supabase.from("User").select("id, name, email, role");
    const userMap = new Map((users || []).map(u => [u.id, u]));

    // 2. Fetch all lookups from 2026-10-01 to now
    const { data: lookups, error: lookupsErr } = await supabase
        .from("CompanyEnrichmentLookup")
        .select("*")
        .gte("createdAt", "2026-10-01T00:00:00")
        .order("createdAt", { ascending: true });

    if (lookupsErr || !lookups) {
        console.error("Lookups error:", lookupsErr);
        return;
    }

    const companyIds = [...new Set(lookups.map(l => l.companyId))];

    // Fetch companies
    const { data: companies } = await supabase
        .from("Company")
        .select("id, name, website, phone, country, industry, customData, status, listId, createdAt, updatedAt")
        .in("id", companyIds);
    const companyMap = new Map((companies || []).map(c => [c.id, c]));

    // Fetch actions for these companies (in chunks if needed, or all)
    // To be safe, fetch in chunks of 50 IDs
    let allActions: any[] = [];
    for (let i = 0; i < companyIds.length; i += 50) {
        const chunk = companyIds.slice(i, i + 50);
        const { data: acts } = await supabase
            .from("Action")
            .select("id, companyId, contactId, sdrId, campaignId, channel, result, note, duration, callbackDate, meetingType, createdAt")
            .in("companyId", chunk);
        if (acts) allActions.push(...acts);
    }

    // Fetch contacts for these companies
    let allContacts: any[] = [];
    for (let i = 0; i < companyIds.length; i += 50) {
        const chunk = companyIds.slice(i, i + 50);
        const { data: cts } = await supabase
            .from("Contact")
            .select("id, companyId, firstName, lastName, phone, mobilePhone, email, title, createdAt")
            .in("companyId", chunk);
        if (cts) allContacts.push(...cts);
    }

    // Sort actions by createdAt
    allActions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // 3. Breakdown by Period: Oct 1 vs Oct 2 vs Total
    const periods: Record<string, {
        label: string;
        lookupsCount: number;
        cacheHitCount: number;
        realSearchCount: number;
        companies: Set<string>;
        suggestionsTotal: number;
        suggestionsWithResults: number;
        noResultLookups: number;
        appliedByField: Record<string, number>;
        rejectedByField: Record<string, number>;
        pendingByField: Record<string, number>;
        generatedByField: Record<string, number>;
        sdrStats: Record<string, { searches: number; cacheHits: number; appliedCount: number; companies: Set<string> }>;
    }> = {
        "2026-10-01": {
            label: "Hier (Jeudi 1er Octobre 2026)",
            lookupsCount: 0, cacheHitCount: 0, realSearchCount: 0,
            companies: new Set(), suggestionsTotal: 0, suggestionsWithResults: 0, noResultLookups: 0,
            appliedByField: {}, rejectedByField: {}, pendingByField: {}, generatedByField: {},
            sdrStats: {}
        },
        "2026-10-02": {
            label: "Aujourd'hui (Vendredi 2 Octobre 2026 - Jusqu'à maintenant)",
            lookupsCount: 0, cacheHitCount: 0, realSearchCount: 0,
            companies: new Set(), suggestionsTotal: 0, suggestionsWithResults: 0, noResultLookups: 0,
            appliedByField: {}, rejectedByField: {}, pendingByField: {}, generatedByField: {},
            sdrStats: {}
        },
        "total": {
            label: "Total Global (Hier + Aujourd'hui)",
            lookupsCount: 0, cacheHitCount: 0, realSearchCount: 0,
            companies: new Set(), suggestionsTotal: 0, suggestionsWithResults: 0, noResultLookups: 0,
            appliedByField: {}, rejectedByField: {}, pendingByField: {}, generatedByField: {},
            sdrStats: {}
        }
    };

    for (const l of lookups) {
        const day = l.createdAt.slice(0, 10);
        const pList = [periods[day], periods["total"]].filter(Boolean);
        const sdrName = userMap.get(l.requestedById)?.name || l.requestedById || "Inconnu";

        const suggestions = Array.isArray(l.suggestions) ? l.suggestions : [];
        const hasResult = suggestions.length > 0;

        for (const p of pList) {
            p.lookupsCount++;
            if (l.cacheHit) p.cacheHitCount++;
            else p.realSearchCount++;

            p.companies.add(l.companyId);
            if (hasResult) p.suggestionsWithResults++;
            else p.noResultLookups++;

            if (!p.sdrStats[sdrName]) {
                p.sdrStats[sdrName] = { searches: 0, cacheHits: 0, appliedCount: 0, companies: new Set() };
            }
            p.sdrStats[sdrName].searches++;
            if (l.cacheHit) p.sdrStats[sdrName].cacheHits++;
            p.sdrStats[sdrName].companies.add(l.companyId);

            for (const s of suggestions) {
                p.suggestionsTotal++;
                p.generatedByField[s.field] = (p.generatedByField[s.field] || 0) + 1;
                if (s.status === "APPLIED") {
                    p.appliedByField[s.field] = (p.appliedByField[s.field] || 0) + 1;
                    p.sdrStats[sdrName].appliedCount++;
                } else if (s.status === "REJECTED") {
                    p.rejectedByField[s.field] = (p.rejectedByField[s.field] || 0) + 1;
                } else {
                    p.pendingByField[s.field] = (p.pendingByField[s.field] || 0) + 1;
                }
            }
        }
    }

    console.log("=================================================");
    console.log("           STATISTIQUES D'ENRICHISSEMENT IA       ");
    console.log("=================================================");

    for (const key of ["2026-10-01", "2026-10-02", "total"]) {
        const p = periods[key];
        console.log(`\n### ${p.label}`);
        console.log(`- Recherches totales: ${p.lookupsCount} (API réelles: ${p.realSearchCount}, Cache hits gratuits: ${p.cacheHitCount})`);
        console.log(`- Entreprises distinctes ciblées: ${p.companies.size}`);
        console.log(`- Recherches fructueuses (≥1 suggestion): ${p.suggestionsWithResults} (${((p.suggestionsWithResults/p.lookupsCount)*100).toFixed(1)}%)`);
        console.log(`- Recherches sans résultat: ${p.noResultLookups} (${((p.noResultLookups/p.lookupsCount)*100).toFixed(1)}%)`);
        console.log(`- Suggestions totales générées: ${p.suggestionsTotal}`);
        
        let totalApplied = Object.values(p.appliedByField).reduce((a, b) => a + b, 0);
        console.log(`- Informations validées/intégrées (APPLIED): ${totalApplied}`);
        console.log("  Détail des informations appliquées:");
        for (const [f, count] of Object.entries(p.appliedByField)) {
            console.log(`    * ${f.padEnd(12)}: ${count} appliquées (sur ${p.generatedByField[f] || 0} suggérées)`);
        }

        console.log("  Activité par SDR:");
        for (const [sdr, st] of Object.entries(p.sdrStats)) {
            console.log(`    * ${sdr.padEnd(15)}: ${st.searches} recherches (${st.companies.size} sociétés), ${st.appliedCount} champs appliqués`);
        }
    }

    // 4. ACTION AFTER ENRICHMENT ANALYSIS
    console.log("\n=================================================");
    console.log("     ANALYSE DES ACTIONS POST-ENRICHISSEMENT     ");
    console.log("=================================================");

    interface CompanyEnrichmentProfile {
        companyId: string;
        companyName: string;
        firstEnrichedAt: string;
        lastEnrichedAt: string;
        sdrNames: string[];
        appliedFields: string[];
        phoneAdded: string | null;
        websiteAdded: string | null;
        actionsAfter: any[];
        contactsAfter: any[];
        timeToFirstActionSec: number | null;
    }

    const companyProfiles: CompanyEnrichmentProfile[] = [];

    for (const compId of companyIds) {
        const comp = companyMap.get(compId);
        const compLookups = lookups.filter(l => l.companyId === compId);
        const firstEnrichedAt = compLookups[0].createdAt;
        const lastEnrichedAt = compLookups[compLookups.length - 1].createdAt;
        const firstTime = new Date(firstEnrichedAt).getTime();

        const sdrNames = [...new Set(compLookups.map(l => userMap.get(l.requestedById)?.name || "Inconnu"))];
        
        const appliedFields: string[] = [];
        let phoneAdded: string | null = null;
        let websiteAdded: string | null = null;

        for (const l of compLookups) {
            const sugs = Array.isArray(l.suggestions) ? l.suggestions : [];
            for (const s of sugs) {
                if (s.status === "APPLIED") {
                    if (!appliedFields.includes(s.field)) appliedFields.push(s.field);
                    if (s.field === "phone") phoneAdded = s.value;
                    if (s.field === "website") websiteAdded = s.value;
                }
            }
        }

        // Actions strictly after or within 30s before (to account for clock skew during session)
        const compActions = allActions.filter(a => a.companyId === compId);
        const actionsAfter = compActions.filter(a => new Date(a.createdAt).getTime() >= firstTime - 30000);

        // Contacts created after
        const compContacts = allContacts.filter(c => c.companyId === compId);
        const contactsAfter = compContacts.filter(c => new Date(c.createdAt).getTime() >= firstTime - 30000);

        let timeToFirstActionSec: number | null = null;
        if (actionsAfter.length > 0) {
            timeToFirstActionSec = Math.round((new Date(actionsAfter[0].createdAt).getTime() - firstTime) / 1000);
        }

        companyProfiles.push({
            companyId: compId,
            companyName: comp?.name || "Société Inconnue",
            firstEnrichedAt,
            lastEnrichedAt,
            sdrNames,
            appliedFields,
            phoneAdded,
            websiteAdded,
            actionsAfter,
            contactsAfter,
            timeToFirstActionSec
        });
    }

    // High level metrics
    const totalEnrichedCompanies = companyProfiles.length;
    const companiesWithActions = companyProfiles.filter(p => p.actionsAfter.length > 0);
    const companiesWithoutActions = companyProfiles.filter(p => p.actionsAfter.length === 0);
    const totalActions = companyProfiles.reduce((sum, p) => sum + p.actionsAfter.length, 0);

    console.log(`- Nombre d'entreprises analysées: ${totalEnrichedCompanies}`);
    console.log(`- Entreprises ayant fait l'objet d'une action post-enrichissement: ${companiesWithActions.length} (${((companiesWithActions.length/totalEnrichedCompanies)*100).toFixed(1)}%)`);
    console.log(`- Entreprises sans action enregistrée post-enrichissement: ${companiesWithoutActions.length} (${((companiesWithoutActions.length/totalEnrichedCompanies)*100).toFixed(1)}%)`);
    console.log(`- Total des actions post-enrichissement exécutées: ${totalActions}`);

    // Results breakdown
    const resultCounts: Record<string, number> = {};
    const channelCounts: Record<string, number> = {};
    let meetingsBooked = 0;
    let callbacksRequested = 0;
    let directConversations = 0; // answered calls, arguments, etc.
    let unreachables = 0; // no answer, answering machine, wrong number, etc.

    for (const p of companyProfiles) {
        for (const a of p.actionsAfter) {
            channelCounts[a.channel] = (channelCounts[a.channel] || 0) + 1;
            resultCounts[a.result] = (resultCounts[a.result] || 0) + 1;

            if (a.result === "MEETING_BOOKED") meetingsBooked++;
            if (a.result === "CALLBACK_REQUESTED") callbacksRequested++;
            if (["MEETING_BOOKED", "CALLBACK_REQUESTED", "NOT_INTERESTED", "REFUSAL", "QUALIFIED"].includes(a.result)) {
                directConversations++;
            }
            if (["NO_ANSWER", "VOICEMAIL", "WRONG_NUMBER", "UNREACHABLE", "BUSY"].includes(a.result)) {
                unreachables++;
            }
        }
    }

    console.log("\n--- Répartition des canaux d'action ---");
    for (const [ch, cnt] of Object.entries(channelCounts)) {
        console.log(`  * ${ch}: ${cnt} actions`);
    }

    console.log("\n--- Résultats commerciaux des appels / actions ---");
    for (const [res, cnt] of Object.entries(resultCounts)) {
        console.log(`  * ${res.padEnd(22)}: ${cnt}`);
    }

    console.log(`\n- RDV Décrochés (MEETING_BOOKED): ${meetingsBooked}`);
    console.log(`- Rappels programmés (CALLBACK_REQUESTED): ${callbacksRequested}`);

    // Time-to-action analysis
    const validTimes = companyProfiles
        .map(p => p.timeToFirstActionSec)
        .filter((t): t is number => t !== null && t >= 0 && t <= 3600); // within 1 hour
    if (validTimes.length > 0) {
        const avgSec = Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length);
        const medianSec = validTimes.sort((a, b) => a - b)[Math.floor(validTimes.length / 2)];
        console.log(`\n--- Vitesse d'exécution SDR après enrichissement ---`);
        console.log(`- Temps moyen avant premier appel: ${Math.round(avgSec / 60)} min ${avgSec % 60} s`);
        console.log(`- Médiane du temps avant premier appel: ${Math.round(medianSec / 60)} min ${medianSec % 60} s`);
    }

    // Impact of Phone Enrichment
    const companiesWithPhoneEnriched = companyProfiles.filter(p => p.appliedFields.includes("phone"));
    const companiesWithPhoneEnrichedAndAction = companiesWithPhoneEnriched.filter(p => p.actionsAfter.length > 0);
    console.log(`\n--- Impact spécifique de l'enrichissement Numéro de Téléphone ---`);
    console.log(`- Sociétés où un numéro a été trouvé et validé: ${companiesWithPhoneEnriched.length}`);
    console.log(`- Sociétés où le numéro a été appelé aussitôt: ${companiesWithPhoneEnrichedAndAction.length} (${((companiesWithPhoneEnrichedAndAction.length/companiesWithPhoneEnriched.length)*100).toFixed(1)}%)`);

    // List of notable commercial outcomes
    console.log("\n=================================================");
    console.log("       EXEMPLES ET SUCCÈS COMMERCIAUX POST-IA     ");
    console.log("=================================================");
    for (const p of companiesWithActions) {
        const notable = p.actionsAfter.filter(a => ["MEETING_BOOKED", "CALLBACK_REQUESTED", "NOT_INTERESTED", "REFUSAL"].includes(a.result) || a.note);
        if (notable.length > 0) {
            console.log(`\n🏢 Société: ${p.companyName}`);
            console.log(`   Champs enrichis: [${p.appliedFields.join(", ") || "Aucun"}] | SDR: ${p.sdrNames.join(", ")}`);
            for (const a of p.actionsAfter) {
                const sdr = userMap.get(a.sdrId)?.name || a.sdrId;
                console.log(`   📞 [${a.createdAt.slice(11, 19)}] ${a.channel} -> Résultat: ${a.result} (par ${sdr})`);
                if (a.note) console.log(`      Note SDR: "${a.note}"`);
                if (a.callbackDate) console.log(`      Rappel prévu: ${a.callbackDate}`);
            }
        }
    }
}

main().catch(console.error);
