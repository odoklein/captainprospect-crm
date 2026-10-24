import { NextRequest, after } from 'next/server';
import { z } from 'zod';
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
} from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { AiCallError, callJsonModel } from '@/lib/ai/json-call';
import { friendlyAiError } from '@/lib/analyse-ia/errors';
import { addDay, parisMidnight } from '@/lib/manager-home/today-rules';

// ============================================
// SCHEMA
// ============================================

const runAnalysisSchema = z.object({
    weekStart: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    weekEnd: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    missionIds: z.array(z.string()).optional().default([]),
    clientIds: z.array(z.string()).optional().default([]),
    sdrIds: z.array(z.string()).optional().default([]),
    label: z.string().optional(),
});

// ============================================
// DATA INGESTION — pull all context for the period
// ============================================

async function ingestData(
    weekStart: Date,
    weekEnd: Date,
    missionIds: string[],
    clientIds: string[],
    sdrIds: string[]
) {
    const actionWhere: any = {
        createdAt: { gte: weekStart, lte: weekEnd },
    };
    // Mission and client scopes combine: a client analysis covers all its missions.
    const missionScope: any = {};
    if (missionIds.length > 0) missionScope.id = { in: missionIds };
    if (clientIds.length > 0) missionScope.clientId = { in: clientIds };
    if (Object.keys(missionScope).length > 0) actionWhere.campaign = { mission: missionScope };
    if (sdrIds.length > 0) actionWhere.sdrId = { in: sdrIds };

    // Fetch actions with enrichment data
    const actions = await prisma.action.findMany({
        where: actionWhere,
        include: {
            contact: { select: { firstName: true, lastName: true, title: true } },
            company: { select: { name: true, industry: true, size: true } },
            campaign: {
                select: {
                    name: true,
                    icp: true,
                    pitch: true,
                    mission: {
                        select: {
                            name: true,
                            clientId: true,
                            client: { select: { name: true } },
                        },
                    },
                },
            },
            sdr: { select: { name: true, id: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500, // cap for prompt size
    });

    // Mission context (ICP, scripts, pitch)
    const missionQuery = missionScope;
    const missions = await prisma.mission.findMany({
        where: missionQuery,
        include: {
            campaigns: {
                select: {
                    id: true,
                    name: true,
                    icp: true,
                    pitch: true,
                    commsChannel: true,
                },
            },
            client: { select: { name: true } },
            sdrAssignments: {
                include: { sdr: { select: { name: true, id: true } } },
            },
        },
        take: 20,
    });

    // Aggregate metrics
    const totalCalls = actions.filter(a => a.channel === 'CALL').length;
    const totalEmails = actions.filter(a => a.channel === 'EMAIL').length;
    const totalLinkedIn = actions.filter(a => a.channel === 'LINKEDIN').length;
    const meetings = actions.filter(a => a.result === 'MEETING_BOOKED');
    const disqualified = actions.filter(a => a.result === 'DISQUALIFIED' || a.result === 'HORS_CIBLE');
    const callbackRequested = actions.filter(a => a.result === 'CALLBACK_REQUESTED');
    const notInterested = actions.filter(a => a.result === 'NOT_INTERESTED' || a.result === 'REFUS');

    // Result distribution
    const resultDist: Record<string, number> = {};
    for (const a of actions) {
        if (a.result) {
            resultDist[a.result] = (resultDist[a.result] || 0) + 1;
        }
    }

    // Call transcriptions (actions with callTranscription)
    const transcriptions = actions
        .filter(a => a.callTranscription && a.callTranscription.trim().length > 50)
        .slice(0, 30)
        .map(a => ({
            id: a.id,
            sdr: a.sdr?.name,
            company: a.company?.name,
            result: a.result,
            transcription: a.callTranscription!.slice(0, 800), // truncate for prompt
            summary: a.callSummary,
        }));

    // Action notes
    const notesWithContent = actions
        .filter(a => a.note && a.note.trim().length > 20)
        .slice(0, 80)
        .map(a => ({
            result: a.result,
            note: a.note!.slice(0, 300),
            company: a.company?.name,
            contactTitle: a.contact?.jobTitle,
            sdr: a.sdr?.name,
        }));

    // RDV fiches
    const rdvFiches = actions
        .filter(a => a.rdvFiche && a.result === 'MEETING_BOOKED')
        .slice(0, 20)
        .map(a => ({
            company: a.company?.name,
            rdvFiche: a.rdvFiche,
        }));

    // SDR performance
    const sdrPerf: Record<string, { name: string; calls: number; meetings: number; conversionRate: number }> = {};
    for (const a of actions) {
        const uid = a.sdrId || 'unknown';
        const name = a.sdr?.name || 'Inconnu';
        if (!sdrPerf[uid]) sdrPerf[uid] = { name, calls: 0, meetings: 0, conversionRate: 0 };
        if (a.channel === 'CALL') sdrPerf[uid].calls++;
        if (a.result === 'MEETING_BOOKED') sdrPerf[uid].meetings++;
    }
    for (const uid of Object.keys(sdrPerf)) {
        const p = sdrPerf[uid];
        p.conversionRate = p.calls > 0 ? Math.round((p.meetings / p.calls) * 1000) / 10 : 0;
    }

    // ICP data from missions
    const icpContexts = missions.flatMap(m =>
        m.campaigns.map(c => ({
            missionName: m.name,
            campaignName: c.name,
            icp: c.icp,
            pitch: c.pitch,
            channel: c.commsChannel,
        }))
    );

    const dataSnapshot = {
        period: { weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString() },
        actionCount: actions.length,
        callCount: totalCalls,
        emailCount: totalEmails,
        linkedInCount: totalLinkedIn,
        meetingCount: meetings.length,
        disqualifiedCount: disqualified.length,
        callbackCount: callbackRequested.length,
        notInterestedCount: notInterested.length,
        conversionRate: totalCalls > 0 ? Math.round((meetings.length / totalCalls) * 1000) / 10 : 0,
        resultDistribution: resultDist,
        sdrPerformance: Object.values(sdrPerf),
        missionCount: missions.length,
        icpContexts,
        transcriptionCount: transcriptions.length,
        notesCount: notesWithContent.length,
        rdvFicheCount: rdvFiches.length,
    };

    return {
        dataSnapshot,
        actions,
        missions,
        transcriptions,
        notesWithContent,
        rdvFiches,
        icpContexts,
        sdrPerf,
        resultDist,
        metrics: {
            totalCalls,
            totalEmails,
            totalLinkedIn,
            meetings: meetings.length,
            disqualified: disqualified.length,
            callbackRequested: callbackRequested.length,
            notInterested: notInterested.length,
            conversionRate: totalCalls > 0 ? Math.round((meetings.length / totalCalls) * 1000) / 10 : 0,
        },
    };
}

// ============================================
// BUILD ANALYSIS PROMPT
// ============================================

function buildAnalysisPrompt(data: Awaited<ReturnType<typeof ingestData>>, priorSummary?: string): string {
    const { dataSnapshot, transcriptions, notesWithContent, rdvFiches, icpContexts, sdrPerf, metrics } = data;

    const transcriptionBlock = transcriptions.length > 0
        ? transcriptions.map((t, i) =>
            `[Transcription ${i + 1}] SDR: ${t.sdr} | Résultat: ${t.result} | Entreprise: ${t.company}\n${t.transcription}`
        ).join('\n\n')
        : 'Aucune transcription disponible cette semaine.';

    const notesBlock = notesWithContent.length > 0
        ? notesWithContent.slice(0, 40).map((n, i) =>
            `[Note ${i + 1}] ${n.result} | ${n.company} (${n.contactTitle}) | SDR: ${n.sdr}\n${n.note}`
        ).join('\n\n')
        : 'Aucune note disponible.';

    const icpBlock = icpContexts.map(c =>
        `Mission: ${c.missionName} | Campagne: ${c.campaignName}\nICP: ${c.icp || 'Non défini'}\nPitch: ${c.pitch || 'Non défini'}\nCanal: ${c.channel}`
    ).join('\n\n');

    const rdvBlock = rdvFiches.length > 0
        ? rdvFiches.map((r, i) =>
            `[Fiche RDV ${i + 1}] ${r.company}\n${JSON.stringify(r.rdvFiche, null, 2).slice(0, 400)}`
        ).join('\n\n')
        : 'Aucune fiche RDV disponible.';

    const sdrPerfBlock = Object.values(sdrPerf).map(s =>
        `${s.name}: ${s.calls} appels, ${s.meetings} RDV, ${s.conversionRate}% conversion`
    ).join('\n');

    const priorBlock = priorSummary
        ? `\n\n===ANALYSE PRÉCÉDENTE (semaine dernière)===\n${priorSummary}`
        : '';

    return `Tu es un copilote stratégique IA expert en sales B2B et prospection téléphonique.
Tu reçois les données complètes d'une équipe SDR pour une semaine de travail et tu dois produire une analyse stratégique approfondie avec raisonnement multi-étapes.

===MÉTRIQUES DE LA SEMAINE===
Période: ${dataSnapshot.period.weekStart?.slice(0, 10)} au ${dataSnapshot.period.weekEnd?.slice(0, 10)}
Total actions: ${dataSnapshot.actionCount}
Appels: ${metrics.totalCalls}
Emails: ${metrics.totalEmails}
LinkedIn: ${metrics.totalLinkedIn}
RDV obtenus: ${metrics.meetings}
Taux de conversion: ${metrics.conversionRate}%
Disqualifiés: ${metrics.disqualified}
Pas intéressés: ${metrics.notInterested}
Rappels demandés: ${metrics.callbackRequested}

Distribution des résultats:
${Object.entries(dataSnapshot.resultDistribution || {}).map(([k, v]) => `${k}: ${v}`).join('\n')}

Performance SDR:
${sdrPerfBlock}

===CONTEXTE ICP & SCRIPTS===
${icpBlock}

===NOTES D'ACTION (échantillon)===
${notesBlock}

===TRANSCRIPTIONS D'APPELS (échantillon)===
${transcriptionBlock}

===FICHES RDV===
${rdvBlock}
${priorBlock}

===INSTRUCTIONS D'ANALYSE===
Raisonne en plusieurs étapes avant de produire ta réponse finale:

ÉTAPE 1 — VÉRIFICATION DE LA COHÉRENCE DES DONNÉES
- Vérifie si les données sont suffisantes (volume minimum: au moins 10 actions pour une analyse fiable)
- Identifie les contradictions ou anomalies dans les données
- Note les zones d'incertitude où les données sont éparses ou bruitées

ÉTAPE 2 — ANALYSE CAUSALE PROFONDE
- Pour chaque problème identifié, cherche la cause racine (pas juste le symptôme)
- Utilise les transcriptions et notes pour valider tes hypothèses avec des preuves directes
- Détecte les patterns répétitifs vs. incidents isolés

ÉTAPE 3 — COMPARAISON AVEC LA SEMAINE PRÉCÉDENTE (si disponible)
- Identifie les tendances (amélioration, dégradation, nouvelles problématiques)
- Note ce qui a évolué suite aux recommandations précédentes

ÉTAPE 4 — GÉNÉRATION DES RECOMMANDATIONS
- Priorise par impact potentiel et faisabilité immédiate
- Chaque recommandation doit avoir des citations directes des données sources
- Quantifie l'impact attendu quand c'est possible

Réponds UNIQUEMENT en JSON valide avec ce format exact:

{
  "executiveSummary": "string (2-3 paragraphes, synthèse stratégique)",
  "confidenceScore": 0.85,
  "dataQualityScore": 0.75,
  "uncertainties": ["string"],
  "topInsights": [
    {
      "insight": "string",
      "evidence": ["citation directe des notes/transcriptions"],
      "impact": "HIGH|MEDIUM|LOW",
      "confidence": 0.9
    }
  ],
  "rootCauses": [
    {
      "cause": "string",
      "evidence": ["citation"],
      "affectedArea": "script|icp|sdr_skill|market|process",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW"
    }
  ],
  "scriptImprovements": [
    {
      "section": "intro|discovery|objection|closing",
      "current": "version actuelle supposée",
      "suggested": "version améliorée",
      "rationale": "pourquoi ce changement",
      "expectedLift": "ex: +15% taux de passage"
    }
  ],
  "icpRefinements": [
    {
      "dimension": "secteur|taille|fonction|géographie|maturité",
      "finding": "ce qu'on observe dans les données",
      "action": "ajustement recommandé sur l'ICP",
      "confidence": 0.8
    }
  ],
  "objectionHandling": [
    {
      "objection": "verbatim ou paraphrase de l'objection",
      "frequency": "HIGH|MEDIUM|LOW",
      "currentResponse": "réponse actuelle si visible dans les données",
      "suggestedResponse": "réponse améliorée",
      "whyItWorks": "argumentation",
      "evidence": ["citations"]
    }
  ],
  "sdrCoachingActions": [
    {
      "sdrName": "string ou null pour équipe entière",
      "issue": "problème identifié",
      "action": "action de coaching concrète",
      "priority": "P1|P2|P3",
      "metric": "indicateur à suivre"
    }
  ],
  "recommendations": [
    {
      "id": "rec-1",
      "title": "string",
      "priority": "P1|P2|P3",
      "category": "script|icp|process|coaching|outreach|qualification",
      "expectedImpact": "description quantifiée",
      "confidenceScore": 0.8,
      "rationale": "raisonnement détaillé avec 'pourquoi'",
      "citations": ["preuves directes des données"],
      "actionSteps": ["étape concrète 1", "étape concrète 2"]
    }
  ],
  "expectedImpacts": [
    {
      "metric": "Taux de conversion appels→RDV",
      "current": "X%",
      "projected": "Y%",
      "confidence": 0.7
    }
  ],
  "deltaInsights": {
    "improved": ["ce qui s'est amélioré vs semaine dernière"],
    "degraded": ["ce qui a empiré"],
    "new": ["nouvelles problématiques émergentes"],
    "resolved": ["problèmes résolus suite aux actions"]
  },
  "trendAlerts": [
    {
      "metric": "string",
      "trend": "UP|DOWN|STABLE|VOLATILE",
      "severity": "CRITICAL|WARNING|INFO",
      "description": "string"
    }
  ],
  "next7DaysPlan": ["action prioritaire 1", "action prioritaire 2"]
}

Important:
- Si les données sont insuffisantes (<10 actions), baisse confidenceScore sous 0.4 et explique dans uncertainties
- Cite TOUJOURS des preuves directes (notes, verbatims, métriques spécifiques)
- Distingue clairement les observations des hypothèses
- Génère au minimum 3 topInsights, 2 rootCauses, 3 recommendations
- Ne génère QUE le JSON, sans texte avant ou après`;
}

/** "YYYY-MM-DD" bounds are Paris calendar days; ISO instants are kept as sent. */
function weekInstants(weekStart: string, weekEnd: string): { start: Date; end: Date } {
    const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    const start = isDay(weekStart) ? parisMidnight(weekStart) : new Date(weekStart);
    const end = isDay(weekEnd) ? new Date(parisMidnight(addDay(weekEnd, 1)).getTime() - 1) : new Date(weekEnd);
    return { start, end };
}

const SYSTEM_PROMPT = `Tu es un analyste stratégique expert en prospection commerciale B2B.
Tu analyses des données de terrain (notes, transcriptions, métriques) et produis des recommandations actionnables avec preuves.
Tu raisonnes en plusieurs étapes avant de conclure. Tu es précis, factuel et tu signales explicitement tes incertitudes.
Tu réponds toujours en JSON valide strictement conformé au format demandé.`;

/**
 * The slow part (data + model, 15–30 s) runs after the response, so a reverse
 * proxy timeout can't leave the run stuck and the page simply polls the row.
 */
async function generate(analysisId: string, body: z.infer<typeof runAnalysisSchema>, weekStart: Date, weekEnd: Date) {
    try {
        const startTime = Date.now();
        const ingestedData = await ingestData(weekStart, weekEnd, body.missionIds, body.clientIds, body.sdrIds);

        // Trend comparison only against an analysis of the same scope.
        const priorAnalysis = await prisma.weeklyAnalysis.findFirst({
            where: {
                status: 'completed',
                id: { not: analysisId },
                weekEnd: { lt: weekStart },
                clientIds: { equals: body.clientIds },
                missionIds: { equals: body.missionIds },
            },
            orderBy: { weekEnd: 'desc' },
        });

        const priorSummary = priorAnalysis
            ? `Executive Summary: ${priorAnalysis.executiveSummary.slice(0, 400)}\n` +
              `Recommandations clés: ${JSON.stringify((priorAnalysis.recommendations as any[]).slice(0, 3).map((r: any) => r.title))}\n` +
              `Confidence score: ${priorAnalysis.confidenceScore}`
            : undefined;

        const { parsed, tokens, model } = await callJsonModel({
            system: SYSTEM_PROMPT,
            user: buildAnalysisPrompt(ingestedData, priorSummary),
            maxTokens: 6000,
            timeoutMs: 180_000,
        });

        await prisma.weeklyAnalysis.update({
            where: { id: analysisId },
            data: {
                status: 'completed',
                dataSnapshot: ingestedData.dataSnapshot as any,
                executiveSummary: parsed.executiveSummary || '',
                confidenceScore: Math.min(1, Math.max(0, parsed.confidenceScore || 0.5)),
                dataQualityScore: Math.min(1, Math.max(0, parsed.dataQualityScore || 0.5)),
                uncertainties: Array.isArray(parsed.uncertainties) ? parsed.uncertainties : [],
                topInsights: parsed.topInsights || [],
                rootCauses: parsed.rootCauses || [],
                scriptImprovements: parsed.scriptImprovements || [],
                icpRefinements: parsed.icpRefinements || [],
                objectionHandling: parsed.objectionHandling || [],
                sdrCoachingActions: parsed.sdrCoachingActions || [],
                recommendations: parsed.recommendations || [],
                expectedImpacts: parsed.expectedImpacts || [],
                priorAnalysisId: priorAnalysis?.id || null,
                deltaInsights: parsed.deltaInsights || null,
                trendAlerts: parsed.trendAlerts || null,
                modelUsed: model,
                tokensUsed: tokens,
                durationMs: Date.now() - startTime,
            },
        });
    } catch (error: any) {
        const stored = error instanceof AiCallError ? error.toStored() : `UNKNOWN: ${error?.message || 'Erreur inconnue'}`;
        console.error('[analyse-ia] run failed', analysisId, stored);
        await prisma.weeklyAnalysis
            .update({ where: { id: analysisId }, data: { status: 'failed', errorMessage: stored } })
            .catch((e) => console.error('[analyse-ia] could not mark run as failed', e));
    }
}

// ============================================
// POST /api/analyse-ia/run → 202 { analysisId }; the page polls the history.
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);
    if (!process.env.OPENAI_API_KEY) {
        const friendly = friendlyAiError('MISSING_KEY: OPENAI_API_KEY non configurée');
        return errorResponse(`${friendly.title} — ${friendly.detail}`, 503);
    }

    const body = await validateRequest(request, runAnalysisSchema);
    const { start: weekStart, end: weekEnd } = weekInstants(body.weekStart, body.weekEnd);

    const placeholder = await prisma.weeklyAnalysis.create({
        data: {
            weekStart,
            weekEnd,
            missionIds: body.missionIds,
            clientIds: body.clientIds,
            sdrIds: body.sdrIds,
            label: body.label || null,
            status: 'running',
            dataSnapshot: {},
            executiveSummary: '',
            confidenceScore: 0,
            dataQualityScore: 0,
            uncertainties: [],
            topInsights: [],
            rootCauses: [],
            scriptImprovements: [],
            icpRefinements: [],
            objectionHandling: [],
            sdrCoachingActions: [],
            recommendations: [],
            expectedImpacts: [],
            createdById: session.user.id,
        },
    });

    after(() => generate(placeholder.id, body, weekStart, weekEnd));
    return successResponse({ analysisId: placeholder.id, status: 'running' }, 202);
});
