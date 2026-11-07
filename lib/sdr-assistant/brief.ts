// ============================================
// SDR ASSISTANT — pre-call brief (server-only).
//
// What an SDR needs in the ten seconds before dialling: who this is, why the
// mission calls them, how to open, what to ask, what went wrong last time.
// Built from CRM data only (fiche, past exchanges and call summaries, the
// mission's pitch and script). Missing data is said, never filled in.
//
// Cached per prospect × mission against a hash of its inputs: a new action,
// an edited fiche or script makes the next request rebuild it.
// ============================================

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { AiCallError, callJsonModel } from "@/lib/ai/json-call";
import { ACTION_RESULT_LABELS } from "@/lib/types";

export interface PrecallBrief {
    /** Who they are and where things stand, 1–2 sentences. */
    context: string;
    /** Suggested opening angle for this prospect. */
    angle: string;
    talkingPoints: string[];
    questions: string[];
    /** Objections or sensitivities from past exchanges. */
    watchOut: string[];
}

export type BriefResult =
    | { status: "ready"; brief: PrecallBrief; generatedAt: string; cached: boolean }
    | { status: "unavailable"; reason: string };

const SYSTEM = `Tu prépares un SDR (prospection B2B par téléphone, en français) juste avant un appel.
On te donne les données du CRM sur le prospect, l'historique des échanges et la mission (offre, cible, script).

Réponds UNIQUEMENT avec un objet JSON :
{
  "context": "1 à 2 phrases : qui est le prospect et où en est la relation",
  "angle": "1 phrase : l'accroche conseillée pour ce prospect précis",
  "talkingPoints": ["argument de la mission pertinent pour ce prospect", ...],
  "questions": ["question de découverte à poser", ...],
  "watchOut": ["objection ou point sensible relevé lors des échanges passés", ...]
}

Règles :
- Utilise uniquement les données fournies. N'invente ni chiffre, ni nom, ni besoin.
- Si les données sont maigres (premier contact, fiche vide), dis-le dans "context" et reste général.
- "watchOut" est vide s'il n'y a eu aucun échange.
- 3 talkingPoints, 3 questions, 2 watchOut au maximum ; phrases courtes, directement utilisables à l'oral.`;

function list(v: unknown, max: number): string[] {
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().slice(0, 240)).slice(0, max);
}

export function normalizeBrief(raw: unknown): PrecallBrief | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const context = typeof o.context === "string" ? o.context.trim().slice(0, 600) : "";
    const angle = typeof o.angle === "string" ? o.angle.trim().slice(0, 300) : "";
    if (!context) return null;
    return {
        context,
        angle,
        talkingPoints: list(o.talkingPoints, 3),
        questions: list(o.questions, 3),
        watchOut: list(o.watchOut, 2),
    };
}

interface BriefInput {
    prospect: Record<string, string | null>;
    history: { date: string; status: string; note: string | null; summary: string | null }[];
    mission: { name: string; objective: string | null; offer: string | null; target: string | null; script: string | null };
}

/** Stable hash of what the brief is built from. */
export function briefHash(input: BriefInput): string {
    return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
}

export function briefPrompt(input: BriefInput): string {
    const p = input.prospect;
    const lines = Object.entries(p)
        .filter(([, v]) => v)
        .map(([k, v]) => `- ${k} : ${v}`);
    const hist = input.history.length
        ? input.history
              .map((h) => `- ${h.date} · ${h.status}${h.note ? ` · note : « ${h.note} »` : ""}${h.summary ? `\n  résumé d'appel : ${h.summary}` : ""}`)
              .join("\n")
        : "- aucun échange enregistré (premier contact)";
    const m = input.mission;
    return [
        "PROSPECT",
        lines.join("\n") || "- fiche quasi vide",
        "",
        "HISTORIQUE (du plus récent au plus ancien)",
        hist,
        "",
        "MISSION",
        `- nom : ${m.name}`,
        m.objective ? `- objectif : ${m.objective}` : null,
        m.offer ? `- offre / pitch : ${m.offer}` : null,
        m.target ? `- cible : ${m.target}` : null,
        m.script ? `- extrait du script :\n${m.script}` : null,
    ]
        .filter((x) => x !== null)
        .join("\n");
}

async function collectInput(args: { contactId: string | null; companyId: string; missionId: string }): Promise<BriefInput | null> {
    const [contact, company, mission] = await Promise.all([
        args.contactId
            ? prisma.contact.findUnique({ where: { id: args.contactId }, select: { firstName: true, lastName: true, title: true, companyId: true } })
            : null,
        prisma.company.findUnique({
            where: { id: args.companyId },
            select: { name: true, industry: true, size: true, country: true, website: true, list: { select: { missionId: true } } },
        }),
        prisma.mission.findUnique({
            where: { id: args.missionId },
            select: {
                name: true,
                objective: true,
                campaigns: { where: { isActive: true }, orderBy: { createdAt: "asc" }, take: 1, select: { pitch: true, icp: true, script: true } },
            },
        }),
    ]);
    if (!company || !mission) return null;
    // The prospect must belong to the mission it is briefed for.
    if (company.list.missionId !== args.missionId) return null;
    if (contact && contact.companyId !== args.companyId) return null;

    const actions = await prisma.action.findMany({
        where: args.contactId ? { OR: [{ contactId: args.contactId }, { companyId: args.companyId, contactId: null }] } : { companyId: args.companyId },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { createdAt: true, result: true, note: true, callSummary: true },
    });
    const statusLabels = new Map(
        (await prisma.actionStatusDefinition.findMany({ where: { scopeType: "GLOBAL" }, select: { code: true, label: true } })).map((s) => [s.code, s.label]),
    );

    const camp = mission.campaigns[0];
    return {
        prospect: {
            nom: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") || null : null,
            poste: contact?.title ?? null,
            société: company.name,
            secteur: company.industry,
            taille: company.size,
            pays: company.country,
            site: company.website,
        },
        history: actions.map((a) => ({
            date: a.createdAt.toISOString().slice(0, 10),
            status: statusLabels.get(a.result) || ACTION_RESULT_LABELS[a.result] || a.result,
            note: a.note?.trim().slice(0, 400) || null,
            summary: a.callSummary?.trim().slice(0, 600) || null,
        })),
        mission: {
            name: mission.name,
            objective: mission.objective?.trim() || null,
            offer: camp?.pitch?.trim().slice(0, 1500) || null,
            target: camp?.icp?.trim().slice(0, 600) || null,
            script: camp?.script?.trim().slice(0, 1500) || null,
        },
    };
}

/** The brief for a prospect, from cache when nothing changed. */
export async function getPrecallBrief(args: {
    contactId: string | null;
    companyId: string;
    missionId: string;
    userId: string;
    refresh?: boolean;
}): Promise<BriefResult> {
    const input = await collectInput(args);
    if (!input) return { status: "unavailable", reason: "Prospect ou mission introuvable" };

    const targetId = args.contactId ?? args.companyId;
    const hash = briefHash(input);
    const cached = await prisma.prospectBrief.findUnique({ where: { targetId_missionId: { targetId, missionId: args.missionId } } });
    if (cached && cached.inputHash === hash && !args.refresh) {
        const brief = normalizeBrief(cached.data);
        if (brief) return { status: "ready", brief, generatedAt: cached.updatedAt.toISOString(), cached: true };
    }

    try {
        const { parsed, model } = await callJsonModel({
            system: SYSTEM,
            user: briefPrompt(input),
            maxTokens: 600,
            temperature: 0.3,
            timeoutMs: 30_000,
            surface: "precall_brief",
            dataClass: "raw_crm",
            userId: args.userId,
            missionId: args.missionId,
        });
        const brief = normalizeBrief(parsed);
        if (!brief) return { status: "unavailable", reason: "Réponse de l'IA inutilisable" };
        const saved = await prisma.prospectBrief.upsert({
            where: { targetId_missionId: { targetId, missionId: args.missionId } },
            create: { targetId, missionId: args.missionId, inputHash: hash, data: brief as unknown as object, model },
            update: { inputHash: hash, data: brief as unknown as object, model },
        });
        return { status: "ready", brief, generatedAt: saved.updatedAt.toISOString(), cached: false };
    } catch (err) {
        if (err instanceof AiCallError) {
            const reason =
                err.code === "MISSING_KEY" ? "IA non configurée" : err.code === "QUOTA" ? "Crédits IA épuisés" : err.code === "TIMEOUT" ? "L'IA n'a pas répondu à temps" : "Brief indisponible";
            return { status: "unavailable", reason };
        }
        console.error("[sdr-assistant/brief] failed", err);
        return { status: "unavailable", reason: "Brief indisponible" };
    }
}
