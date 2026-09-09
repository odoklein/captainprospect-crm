import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
    NotFoundError,
    ValidationError,
} from "@/lib/api-utils";
import { z } from "zod";

type ScriptCompanionRules = {
    scriptCompanion?: {
        drafts?: Record<string, { content: string; updatedAt: string }>;
        shared?: { content: string; updatedAt: string; updatedBy: string | null };
        aiDrafts?: Record<string, { content: string; updatedAt: string }>;
        aiShared?: { content: string; updatedAt: string; updatedBy: string | null };
        defaultTab?: "base" | "additional" | "ai";
        aiGeneratedAt?: string;
        aiGeneratedFrom?: "manual" | "weekly";
    };
};

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o";

const upsertDraftSchema = z.object({
    draft: z.string().optional(),
    kind: z.enum(["additional", "ai"]).optional().default("additional"),
    defaultTab: z.enum(["base", "additional", "ai"]).optional(),
});

const publishSchema = z.object({
    content: z.string().optional(),
    kind: z.enum(["additional", "ai"]).optional().default("additional"),
});

const regenerateAiSchema = z.object({
    force: z.boolean().optional().default(false),
    source: z.enum(["manual", "weekly"]).optional().default("manual"),
});

function parseScriptContent(script: string | null): string {
    if (!script) return "";
    try {
        const parsed = JSON.parse(script) as Record<string, unknown>;
        if (!parsed || typeof parsed !== "object") return script;
        const ordered = ["intro", "discovery", "objection", "closing"]
            .map((key) => {
                const value = parsed[key];
                return typeof value === "string" ? value.trim() : "";
            })
            .filter(Boolean);
        return ordered.join("\n\n");
    } catch {
        return script;
    }
}

async function buildImprovedAiScript(params: {
    campaignId: string;
    campaignName: string;
    missionName: string;
    objective: string;
    clientName: string;
    channel: string;
    icp: string;
    pitch: string;
    currentScript: string;
    notes: string[];
}): Promise<string | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    if (params.notes.length === 0) return null;

    const topNotes = params.notes.slice(0, 40).map((n, i) => `${i + 1}. ${n}`).join("\n");
    const prompt = `
Tu es un coach SDR expert. Ta mission: améliorer un script existant en te basant sur les retours d'appels réels.

Contexte:
- Client: ${params.clientName}
- Mission: ${params.missionName}
- Campagne: ${params.campaignName}
- Canal: ${params.channel}
- Objectif: ${params.objective}
- ICP: ${params.icp}
- Pitch: ${params.pitch}

Script actuel:
${params.currentScript || "(vide)"}

Commentaires d'appels (notes SDR):
${topNotes}

Instructions:
- Produis UN SEUL script amélioré, prêt à être utilisé tel quel.
- Le script doit corriger les points faibles vus dans les notes.
- Garde un style naturel, concret, orienté RDV.
- Français uniquement.
- Réponds uniquement avec le script final (pas d'explication).
`.trim();

    const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            messages: [
                { role: "system", content: "Tu améliores des scripts SDR B2B à partir de feedback terrain." },
                { role: "user", content: prompt },
            ],
            temperature: 0.5,
            max_tokens: 1800,
        }),
    });
    if (!response.ok) return null;
    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content.trim() : null;
}

async function maybeRefreshWeeklyAiScript(input: {
    campaignId: string;
    rules: ScriptCompanionRules;
    actorName: string | null;
    force: boolean;
    source: "manual" | "weekly";
}): Promise<{ refreshed: boolean; content?: string }> {
    const now = new Date();
    const previousAt = input.rules.scriptCompanion?.aiGeneratedAt;
    const hasFreshWeeklyContent =
        !input.force &&
        previousAt &&
        now.getTime() - new Date(previousAt).getTime() < 7 * 24 * 60 * 60 * 1000;
    if (hasFreshWeeklyContent) return { refreshed: false };

    const campaign = await prisma.campaign.findUnique({
        where: { id: input.campaignId },
        select: {
            id: true,
            name: true,
            script: true,
            icp: true,
            pitch: true,
            mission: {
                select: {
                    name: true,
                    objective: true,
                    channel: true,
                    client: { select: { name: true } },
                },
            },
        },
    });
    if (!campaign) throw new NotFoundError("Campagne introuvable");

    const fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const actions = await prisma.action.findMany({
        where: {
            campaignId: input.campaignId,
            createdAt: { gte: fromDate },
            note: { not: null },
        },
        select: { note: true },
        orderBy: { createdAt: "desc" },
        take: 80,
    });
    const notes = actions
        .map((a) => a.note?.trim() || "")
        .filter(Boolean);

    const improved = await buildImprovedAiScript({
        campaignId: campaign.id,
        campaignName: campaign.name,
        missionName: campaign.mission.name,
        objective: campaign.mission.objective,
        clientName: campaign.mission.client.name,
        channel: campaign.mission.channel,
        icp: campaign.icp,
        pitch: campaign.pitch,
        currentScript: parseScriptContent(campaign.script),
        notes,
    });
    if (!improved) return { refreshed: false };

    const stamp = now.toISOString();
    const nextRules: ScriptCompanionRules = {
        ...input.rules,
        scriptCompanion: {
            ...(input.rules.scriptCompanion ?? {}),
            aiShared: {
                content: improved,
                updatedAt: stamp,
                updatedBy: input.actorName,
            },
            aiGeneratedAt: stamp,
            aiGeneratedFrom: input.source,
        },
    };
    await prisma.campaign.update({
        where: { id: input.campaignId },
        data: { rules: nextRules as any },
    });
    return { refreshed: true, content: improved };
}

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(["SDR", "BOOKER", "MANAGER", "BUSINESS_DEVELOPER", "CLIENT"], request);
    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
        where: { id },
        select: { id: true, name: true, script: true, rules: true, missionId: true },
    });

    if (!campaign) throw new NotFoundError("Campagne introuvable");

    const rules = (campaign.rules ?? {}) as ScriptCompanionRules;
    await maybeRefreshWeeklyAiScript({
        campaignId: id,
        rules,
        actorName: session.user.name ?? "Auto IA",
        force: false,
        source: "weekly",
    });
    const refreshedCampaign = await prisma.campaign.findUnique({
        where: { id },
        select: { rules: true, script: true },
    });
    const effectiveRules = (refreshedCampaign?.rules ?? campaign.rules ?? {}) as ScriptCompanionRules;
    const draftEntry = rules.scriptCompanion?.drafts?.[session.user.id];
    const sharedEntry = effectiveRules.scriptCompanion?.shared;

    let baseScript = parseScriptContent((refreshedCampaign?.script as string | null) ?? campaign.script ?? null);

    if (!baseScript.trim() && campaign.missionId) {
        const fallbackCamp = await prisma.campaign.findFirst({
            where: {
                missionId: campaign.missionId,
                isActive: true,
                script: { not: null },
            },
            orderBy: { createdAt: "asc" },
            select: { script: true },
        });
        if (fallbackCamp?.script?.trim()) {
            baseScript = parseScriptContent(fallbackCamp.script);
        }
    }

    return successResponse({
        campaignId: campaign.id,
        campaignName: campaign.name,
        baseScript,
        additionalDraft: draftEntry?.content ?? "",
        additionalShared: sharedEntry?.content ?? "",
        aiDraft: effectiveRules.scriptCompanion?.aiDrafts?.[session.user.id]?.content ?? "",
        aiShared: effectiveRules.scriptCompanion?.aiShared?.content ?? "",
        defaultTab: effectiveRules.scriptCompanion?.defaultTab ?? "base",
        sharedUpdatedAt: sharedEntry?.updatedAt ?? null,
        sharedUpdatedBy: sharedEntry?.updatedBy ?? null,
        aiGeneratedAt: effectiveRules.scriptCompanion?.aiGeneratedAt ?? null,
        aiGeneratedFrom: effectiveRules.scriptCompanion?.aiGeneratedFrom ?? null,
    });
});

export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(["SDR", "BOOKER", "MANAGER", "BUSINESS_DEVELOPER"], request);
    const { id } = await params;
    const data = await validateRequest(request, upsertDraftSchema);

    const campaign = await prisma.campaign.findUnique({
        where: { id },
        select: { id: true, rules: true },
    });
    if (!campaign) throw new NotFoundError("Campagne introuvable");

    const now = new Date().toISOString();
    const rules = (campaign.rules ?? {}) as ScriptCompanionRules;
    const currentDrafts = rules.scriptCompanion?.drafts ?? {};
    const currentAiDrafts = rules.scriptCompanion?.aiDrafts ?? {};

    if (data.draft === undefined && data.defaultTab === undefined) {
        throw new ValidationError("Aucune modification fournie");
    }

    const nextRules: ScriptCompanionRules = {
        ...rules,
        scriptCompanion: {
            drafts:
                data.kind === "additional" && data.draft !== undefined
                    ? {
                        ...currentDrafts,
                        [session.user.id]: {
                            content: data.draft,
                            updatedAt: now,
                        },
                    }
                    : currentDrafts,
            aiDrafts:
                data.kind === "ai" && data.draft !== undefined
                    ? {
                        ...currentAiDrafts,
                        [session.user.id]: {
                            content: data.draft,
                            updatedAt: now,
                        },
                    }
                    : currentAiDrafts,
            shared: rules.scriptCompanion?.shared,
            aiShared: rules.scriptCompanion?.aiShared,
            defaultTab: data.defaultTab ?? rules.scriptCompanion?.defaultTab ?? "base",
        },
    };

    await prisma.campaign.update({
        where: { id },
        data: { rules: nextRules as any },
    });

    return successResponse({ saved: true });
});

export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(["SDR", "BOOKER", "MANAGER", "BUSINESS_DEVELOPER"], request);
    const { id } = await params;
    const data = await validateRequest(request, publishSchema);

    const campaign = await prisma.campaign.findUnique({
        where: { id },
        select: { id: true, rules: true },
    });
    if (!campaign) throw new NotFoundError("Campagne introuvable");

    const rules = (campaign.rules ?? {}) as ScriptCompanionRules;
    const kind = data.kind ?? "additional";
    const draftEntry =
        kind === "ai"
            ? rules.scriptCompanion?.aiDrafts?.[session.user.id]
            : rules.scriptCompanion?.drafts?.[session.user.id];
    const sharedContent = (data.content ?? draftEntry?.content ?? "").trim();

    if (!sharedContent) {
        throw new ValidationError("Aucun contenu à partager");
    }

    const now = new Date().toISOString();
    const nextRules: ScriptCompanionRules = {
        ...rules,
        scriptCompanion: {
            drafts: {
                ...(rules.scriptCompanion?.drafts ?? {}),
                ...(kind === "additional" ? { [session.user.id]: { content: sharedContent, updatedAt: now } } : {}),
            },
            aiDrafts: {
                ...(rules.scriptCompanion?.aiDrafts ?? {}),
                ...(kind === "ai" ? { [session.user.id]: { content: sharedContent, updatedAt: now } } : {}),
            },
            shared:
                kind === "additional"
                    ? {
                        content: sharedContent,
                        updatedAt: now,
                        updatedBy: session.user.name ?? null,
                    }
                    : rules.scriptCompanion?.shared,
            aiShared:
                kind === "ai"
                    ? {
                        content: sharedContent,
                        updatedAt: now,
                        updatedBy: session.user.name ?? null,
                    }
                    : rules.scriptCompanion?.aiShared,
            defaultTab: rules.scriptCompanion?.defaultTab ?? "base",
        },
    };

    await prisma.campaign.update({
        where: { id },
        data: { rules: nextRules as any },
    });

    return successResponse({ shared: true });
});

export const PATCH = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(["MANAGER", "BUSINESS_DEVELOPER", "BOOKER"], request);
    const { id } = await params;
    const data = await validateRequest(request, regenerateAiSchema);

    const campaign = await prisma.campaign.findUnique({
        where: { id },
        select: { id: true, rules: true },
    });
    if (!campaign) throw new NotFoundError("Campagne introuvable");

    const refreshed = await maybeRefreshWeeklyAiScript({
        campaignId: id,
        rules: (campaign.rules ?? {}) as ScriptCompanionRules,
        actorName: session.user.name ?? "Manager",
        force: data.force ?? true,
        source: data.source ?? "manual",
    });

    return successResponse({
        refreshed: refreshed.refreshed,
        aiScript: refreshed.content ?? null,
    });
});
