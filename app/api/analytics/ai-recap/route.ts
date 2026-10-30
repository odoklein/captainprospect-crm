/**
 * POST /api/analytics/ai-recap
 * AI-powered analysis of all call notes: status, objections, causes, recommendations.
 * Supports interactive follow-up questions.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireRole, withErrorHandler, errorResponse, successResponse } from "@/lib/api-utils";
import { z } from "zod";
import { integrationKey } from "@/lib/integrations/keys";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o";

const analysisSchema = z.object({
    executiveSummary: z.string().min(10),
    keyInsights: z.array(z.string().min(3)).min(3).max(8),
    objectionClusters: z.array(
        z.object({
            objection: z.string().min(2),
            frequency: z.enum(["LOW", "MEDIUM", "HIGH"]),
            whyItHappens: z.string().min(5),
            recommendedResponse: z.string().min(5),
        })
    ).max(6),
    disqualificationCauses: z.array(
        z.object({
            cause: z.string().min(2),
            signalInNotes: z.string().min(5),
            correctiveAction: z.string().min(5),
        })
    ).max(6),
    recommendations: z.array(
        z.object({
            title: z.string().min(3),
            priority: z.enum(["P1", "P2", "P3"]),
            expectedImpact: z.string().min(3),
            actionPlan: z.string().min(8),
        })
    ).min(3).max(6),
    next7DaysPlan: z.array(z.string().min(3)).min(3).max(7),
});

type StructuredAnalysis = z.infer<typeof analysisSchema>;

function toMarkdown(analysis: StructuredAnalysis): string {
    return [
        "## Synthèse exécutive",
        analysis.executiveSummary,
        "",
        "## Points clés",
        ...analysis.keyInsights.map((item) => `- ${item}`),
        "",
        "## Objections récurrentes",
        ...analysis.objectionClusters.map(
            (item) =>
                `- **${item.objection}** (${item.frequency})\n  - Cause probable: ${item.whyItHappens}\n  - Réponse recommandée: ${item.recommendedResponse}`
        ),
        "",
        "## Causes de disqualification",
        ...analysis.disqualificationCauses.map(
            (item) =>
                `- **${item.cause}**\n  - Signal dans les notes: ${item.signalInNotes}\n  - Correctif: ${item.correctiveAction}`
        ),
        "",
        "## Recommandations prioritaires",
        ...analysis.recommendations.map(
            (item) =>
                `- **[${item.priority}] ${item.title}**\n  - Impact attendu: ${item.expectedImpact}\n  - Plan d'action: ${item.actionPlan}`
        ),
        "",
        "## Plan 7 jours",
        ...analysis.next7DaysPlan.map((item, index) => `${index + 1}. ${item}`),
    ].join("\n");
}

const ACTION_RESULT_LABELS: Record<string, string> = {
    NO_RESPONSE: "Pas de réponse",
    BAD_CONTACT: "Mauvais contact",
    INTERESTED: "Intéressé",
    CALLBACK_REQUESTED: "Rappel demandé",
    MEETING_BOOKED: "Meeting booké",
    MEETING_CANCELLED: "Meeting annulé",
    INVALIDE: "Invalide",
    DISQUALIFIED: "Disqualifié",
    NOT_INTERESTED: "Pas intéressé",
    ENVOIE_MAIL: "Mail à envoyer",
    MAIL_ENVOYE: "Mail envoyé",
};

const requestSchema = z.object({
    from: z.string(),
    to: z.string(),
    missionIds: z.array(z.string()).optional().default([]),
    sdrIds: z.array(z.string()).optional().default([]),
    clientIds: z.array(z.string()).optional().default([]),
    listIds: z.array(z.string()).optional().default([]),
    followUp: z.string().optional(),
    previousRecap: z.string().optional(), // For follow-up: the assistant's previous recap
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER", "DEVELOPER"], request);

    const body = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
        return errorResponse("Paramètres invalides (from, to requis)", 400);
    }

    const { from, to, missionIds, sdrIds, clientIds, listIds, followUp, previousRecap } =
        parsed.data;

    const apiKey = integrationKey("OPENAI_API_KEY");
    if (!apiKey) {
        return errorResponse("OPENAI_API_KEY non configurée. L'analyse IA est indisponible.", 503);
    }

    const dateFrom = new Date(from);
    const dateTo = new Date(to);
    dateFrom.setHours(0, 0, 0, 0);
    dateTo.setHours(23, 59, 999);

    const where: Prisma.ActionWhereInput = {
        channel: "CALL",
        createdAt: { gte: dateFrom, lte: dateTo },
    };
    if (sdrIds.length > 0) where.sdrId = { in: sdrIds };
    if (missionIds.length > 0 || clientIds.length > 0) {
        where.campaign = {
            mission: {
                ...(missionIds.length > 0 && { id: { in: missionIds } }),
                ...(clientIds.length > 0 && { clientId: { in: clientIds } }),
            },
        };
    }
    if (listIds.length > 0) {
        where.OR = [
            { company: { listId: { in: listIds } } },
            { contact: { company: { listId: { in: listIds } } } },
        ];
    }

    const [basicStats, statusBreakdown, sdrPerf, actionsWithNotes] = await Promise.all([
        prisma.action.aggregate({
            where,
            _count: { id: true },
            _sum: { duration: true },
        }),
        prisma.action.groupBy({
            by: ["result"],
            where,
            _count: { id: true },
        }),
        prisma.action.findMany({
            where: { ...where, sdrId: { not: undefined } },
            select: { sdr: { select: { name: true } } },
            distinct: ["sdrId"],
        }),
        prisma.action.findMany({
            where: { ...where, note: { not: null } },
            select: { note: true, result: true },
            orderBy: { createdAt: "desc" },
            take: 500,
        }),
    ]);

    const statuses: Record<string, number> = {};
    statusBreakdown.forEach((s) => {
        statuses[s.result] = s._count.id;
    });

    const totalCalls = basicStats._count.id;
    const meetings = statuses["MEETING_BOOKED"] || 0;
    const conversionRate =
        totalCalls > 0 ? Math.round((meetings / totalCalls) * 10000) / 100 : 0;
    const noResponse = statuses["NO_RESPONSE"] || 0;
    const callbacks =
        (statuses["CALLBACK_REQUESTED"] || 0) + (statuses["INTERESTED"] || 0);
    const disqualified = statuses["DISQUALIFIED"] || 0;
    const notInterested = statuses["NOT_INTERESTED"] || 0;

    const notesWithStatus = actionsWithNotes
        .filter((a) => a.note && a.note.trim().length > 3)
        .map((a) => ({
            result: a.result,
            resultLabel: ACTION_RESULT_LABELS[a.result] || a.result,
            note: (a.note || "").trim().slice(0, 400),
        }));

    const periodLabel = `${dateFrom.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
    })} – ${dateTo.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
    })}`;

    const statsText = `
Période : ${periodLabel}

Statistiques :
- Total appels : ${totalCalls}
- RDV bookés : ${meetings}
- Taux de conversion : ${conversionRate}%
- Non-réponse : ${noResponse}
- Rappels / Intéressés : ${callbacks}
- Disqualifiés : ${disqualified}
- Pas intéressé : ${notInterested}
- Talk time total : ${Math.round((basicStats._sum.duration || 0) / 60)} min

Top SDR : ${sdrPerf[0]?.sdr?.name || "—"}
`;

    const notesText =
        notesWithStatus.length > 0
            ? `
Notes d'appel (chaque note avec son statut) — ${notesWithStatus.length} notes analysées :

${notesWithStatus
    .map(
        (n) =>
            `[${n.resultLabel}] ${n.note}`
    )
    .join("\n\n")}
`
            : "\nAucune note d'appel disponible pour cette période.";

    const systemPrompt = `Tu es un analyste commercial expert en prospection B2B. Tu analyses les notes d'appels SDR pour produire des synthèses actionnables.

Ta mission :
1. Analyser les statuts (non-réponse, disqualifiés, intéressés, meetings, etc.) et leurs tendances
2. Identifier les objections récurrentes mentionnées dans les notes (budget, timing, déjà un prestataire, pas le bon interlocuteur, etc.)
3. Mettre en évidence les causes racines des disqualifications et des refus
4. Donner des recommandations concrètes pour améliorer les résultats

Réponds en français, de façon structurée et professionnelle. Utilise des listes à puces quand c'est pertinent. Sois factuel et basé uniquement sur les données fournies.`;

    const suggestedFollowUps = [
        { id: "objections", label: "Analyser les objections en détail" },
        { id: "causes", label: "Causes des disqualifications" },
        { id: "recommandations", label: "Recommandations d'amélioration" },
        { id: "meetings", label: "Facteurs de succès des RDV bookés" },
        { id: "non_reponse", label: "Stratégies pour réduire la non-réponse" },
    ];

    let messages: { role: string; content: string }[] = [
        { role: "system", content: systemPrompt },
    ];

    const initialUserContent = `Voici les données de prospection pour la période sélectionnée.

${statsText}
${notesText}

Produis une synthèse IA complète : statuts, objections identifiées, causes des disqualifications, et recommandations prioritaires.`;

    if (followUp && previousRecap) {
        messages.push({ role: "user", content: initialUserContent });
        messages.push({ role: "assistant", content: previousRecap });
        messages.push({
            role: "user",
            content: `Question de suivi : ${followUp}\n\nRéponds de façon concise et actionnable à cette question, en t'appuyant sur les données et l'analyse ci-dessus.`,
        });
    } else {
        messages.push({ role: "user", content: initialUserContent });
    }

    const isFollowUp = Boolean(followUp && previousRecap);
    const basePayload = {
        model: OPENAI_MODEL,
        messages,
        temperature: isFollowUp ? 0.35 : 0.3,
        max_tokens: isFollowUp ? 1200 : 1700,
    };

    try {
        const res = await fetch(OPENAI_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(
                isFollowUp
                    ? basePayload
                    : {
                          ...basePayload,
                          response_format: {
                              type: "json_schema",
                              json_schema: {
                                  name: "manager_analytics_analysis",
                                  strict: true,
                                  schema: {
                                      type: "object",
                                      additionalProperties: false,
                                      required: [
                                          "executiveSummary",
                                          "keyInsights",
                                          "objectionClusters",
                                          "disqualificationCauses",
                                          "recommendations",
                                          "next7DaysPlan",
                                      ],
                                      properties: {
                                          executiveSummary: { type: "string" },
                                          keyInsights: {
                                              type: "array",
                                              items: { type: "string" },
                                          },
                                          objectionClusters: {
                                              type: "array",
                                              items: {
                                                  type: "object",
                                                  additionalProperties: false,
                                                  required: [
                                                      "objection",
                                                      "frequency",
                                                      "whyItHappens",
                                                      "recommendedResponse",
                                                  ],
                                                  properties: {
                                                      objection: { type: "string" },
                                                      frequency: {
                                                          type: "string",
                                                          enum: ["LOW", "MEDIUM", "HIGH"],
                                                      },
                                                      whyItHappens: { type: "string" },
                                                      recommendedResponse: { type: "string" },
                                                  },
                                              },
                                          },
                                          disqualificationCauses: {
                                              type: "array",
                                              items: {
                                                  type: "object",
                                                  additionalProperties: false,
                                                  required: [
                                                      "cause",
                                                      "signalInNotes",
                                                      "correctiveAction",
                                                  ],
                                                  properties: {
                                                      cause: { type: "string" },
                                                      signalInNotes: { type: "string" },
                                                      correctiveAction: { type: "string" },
                                                  },
                                              },
                                          },
                                          recommendations: {
                                              type: "array",
                                              items: {
                                                  type: "object",
                                                  additionalProperties: false,
                                                  required: [
                                                      "title",
                                                      "priority",
                                                      "expectedImpact",
                                                      "actionPlan",
                                                  ],
                                                  properties: {
                                                      title: { type: "string" },
                                                      priority: {
                                                          type: "string",
                                                          enum: ["P1", "P2", "P3"],
                                                      },
                                                      expectedImpact: { type: "string" },
                                                      actionPlan: { type: "string" },
                                                  },
                                              },
                                          },
                                          next7DaysPlan: {
                                              type: "array",
                                              items: { type: "string" },
                                          },
                                      },
                                  },
                              },
                          },
                      }
            ),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error("OpenAI ai-recap error:", err);
            return errorResponse(
                (err as { error?: { message?: string } })?.error?.message || "Erreur OpenAI",
                res.status
            );
        }

        const json = (await res.json()) as {
            choices?: { message?: { content?: string } }[];
        };
        const rawContent = json.choices?.[0]?.message?.content?.trim();

        if (!rawContent) {
            return errorResponse("Réponse vide de OpenAI", 500);
        }

        if (isFollowUp) {
            return successResponse({
                recap: rawContent,
                suggestedFollowUps,
                notesCount: notesWithStatus.length,
            });
        }

        let analysis: StructuredAnalysis;
        try {
            analysis = analysisSchema.parse(JSON.parse(rawContent));
        } catch (parseErr) {
            console.error("OpenAI ai-recap JSON parsing failed:", parseErr);
            return errorResponse("Format de réponse IA invalide", 500);
        }

        return successResponse({
            recap: toMarkdown(analysis),
            analysis,
            suggestedFollowUps,
            notesCount: notesWithStatus.length,
        });
    } catch (err) {
        console.error("OpenAI ai-recap request failed:", err);
        return errorResponse("Erreur de connexion à OpenAI", 500);
    }
});
