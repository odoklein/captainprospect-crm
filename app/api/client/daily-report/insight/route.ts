import { NextRequest } from 'next/server';
import { successResponse, errorResponse, requireRole, withErrorHandler } from '@/lib/api-utils';
import {
    buildDailyReport,
    buildRuleInsight,
    frenchDayLabel,
    parseDailyReportQuery,
} from '@/lib/client/daily-report';
import type { DailyInsight, DailyReport } from '@/lib/client/daily-report-types';
import { mistralChat } from '@/lib/ai/mistral';

// ============================================
// GET /api/client/daily-report/insight?day=&today=&tz=
// Short AI-written summary of the reported day. The model only receives
// aggregates (counts, rates, trend) — no prospect or employee names — and must
// not state a number that is not in them. Falls back to the rule-based summary
// when AI is not configured, fails, or answers something unusable.
// ============================================

const CACHE_TTL_MS = 6 * 3600_000;
const cache = new Map<string, { at: number; insight: DailyInsight }>();

function aggregatesFor(r: DailyReport) {
    return {
        jour: frenchDayLabel(r.day),
        jourPrecedent: r.previousDay ? frenchDayLabel(r.previousDay) : null,
        totaux: r.totals,
        totauxJourPrecedent: r.previous,
        tauxDecrocheEnPourcent: r.reachRate,
        sdrMobilises: r.sdrCount,
        missionsActives: r.activeMissions,
        tendance7JoursOuvres: r.trend.map((p) => ({ jour: p.day, appels: p.calls, rdv: p.meetings })),
        issuesDesActions: r.outcomes.map((o) => ({ issue: o.label, nombre: o.count })),
        moisEnCours: { rdvConfirmes: r.month.meetings, objectif: r.month.objective },
        rdvAujourdhui: r.todayMeetings.length,
        rdvParCommercial: r.byCommercial.map((c) => ({ rdvRecus: c.booked, rdvAujourdhui: c.today })),
    };
}

const SYSTEM_PROMPT = `Tu es l'analyste de Captain Prospect, agence de prospection B2B. Tu rédiges le résumé matinal
de l'activité de la veille pour le client (l'entreprise pour qui l'équipe prospecte).
Règles strictes :
- Français, ton professionnel, clair et chaleureux, vouvoiement.
- N'utilise QUE les chiffres fournis. N'invente aucun chiffre, nom, pourcentage ou tendance absent des données.
- Pas de superlatifs creux ; si l'activité est faible, dis-le sobrement et positivement.
- Réponds uniquement par un objet JSON : {"headline": string (max 60 caractères), "summary": string (2 phrases max, 280 caractères max), "recommendation": string (1 phrase actionnable pour le client, 160 caractères max)}.`;

function parseInsight(text: string | null): DailyInsight | null {
    if (!text) return null;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const raw = JSON.parse(match[0]) as Record<string, unknown>;
        const pick = (k: string, max: number) =>
            typeof raw[k] === 'string' && (raw[k] as string).trim() ? (raw[k] as string).trim().slice(0, max) : null;
        const headline = pick('headline', 80);
        const summary = pick('summary', 400);
        const recommendation = pick('recommendation', 220);
        if (!headline || !summary || !recommendation) return null;
        return { source: 'ai', headline, summary, recommendation };
    } catch {
        return null;
    }
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(['CLIENT'], request);
    const clientId = session.user.clientId;
    if (!clientId) return errorResponse('Aucun espace client rattaché', 403);

    const query = parseDailyReportQuery(request.nextUrl.searchParams);
    if (!query) return errorResponse('Période invalide', 400);

    const key = `${clientId}:${query.day}:${query.today}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return successResponse(hit.insight);

    const report = await buildDailyReport(clientId, query);
    const fallback = buildRuleInsight(report);

    const apiKey = process.env.MISTRAL_API_KEY;
    // Nothing to interpret: the rule summary says it as well as a model would.
    if (!apiKey || (report.totals.calls === 0 && report.totals.meetings === 0)) {
        return successResponse(fallback);
    }

    let insight: DailyInsight = fallback;
    try {
        const result = await mistralChat(apiKey, {
            model: 'mistral-small-latest',
            temperature: 0.3,
            maxTokens: 350,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: `Données de la journée (JSON) :\n${JSON.stringify(aggregatesFor(report))}` },
            ],
        });
        insight = parseInsight(result.message.content) ?? fallback;
    } catch (err) {
        console.warn('[daily-report/insight] AI unavailable, using rule summary:', err instanceof Error ? err.message : err);
    }

    cache.set(key, { at: Date.now(), insight });
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return successResponse(insight);
});
