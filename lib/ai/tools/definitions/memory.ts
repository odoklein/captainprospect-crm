/**
 * Mémoire — the model-facing side of the assistant memory (Captain AI v4).
 *
 * `remember`, `update_memory` and `forget` are `safe_write`: a memory is
 * internal, visible in the folder's Mémoire tab and undone in one click (soft
 * delete), so they run from the loop, spend the per-message write budget and
 * land in the action log. `list_memories` is a read without evidence: a
 * memory is something the manager said, not a source to cite.
 *
 * Reachability, not ownership, is the scope rule: a turn may touch AGENCY
 * rows, the rows of the folder it runs in, and the rows of its own user. An id
 * the model guessed from another folder reads as "introuvable".
 */

import { z } from "zod";
import type { AssistantMemoryKind, AssistantMemoryScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/api-utils";
import { optional } from "@/lib/assistant/store/missing";
import { normalizeMemoryContent } from "@/lib/assistant/memory/normalize";
import {
    AssistantMemoryError,
    listMemoryLayers,
    softDeleteMemory,
    updateMemory as updateMemoryRow,
    upsertMemory,
} from "@/lib/assistant/memory/service";
import { requireFolder } from "../context";
import { defineReadTool, defineSafeWriteTool, params } from "../helpers";
import { sanitizeUntrusted } from "../redact";
import { AssistantContext, ToolValidationError, WriteOutcome } from "../types";

// ============================================
// Shared vocabulary
// ============================================

export const MEMORY_KINDS = ["FACT", "PREFERENCE", "DECISION", "CONTACT", "GOAL"] as const;
export const MEMORY_SCOPES = ["folder", "agency", "user"] as const;
export type MemoryScopeArg = (typeof MEMORY_SCOPES)[number];

const CONTENT_MIN = 8;
const CONTENT_MAX = 400;

const SCOPE_TO_DB: Record<MemoryScopeArg, AssistantMemoryScope> = {
    folder: "FOLDER",
    agency: "AGENCY",
    user: "USER",
};

const UNAVAILABLE: WriteOutcome = {
    message: "Mémoire indisponible sur cette instance (migration à appliquer) : rien n'a été enregistré.",
    artifactId: null,
};

const UNREACHABLE = "Souvenir introuvable dans ce périmètre";

type ScopeContext = Pick<AssistantContext, "folder" | "userId">;

/** What a memory row must expose for the reachability check. */
export interface MemoryScopeRow {
    scope: AssistantMemoryScope;
    folderId: string | null;
    userId: string | null;
}

// ============================================
// Pure rules (tested without a database)
// ============================================

/** Folder when the conversation has one, agency otherwise; an explicit scope wins. */
export function resolveMemoryScope(args: { scope?: MemoryScopeArg | null }, ctx: ScopeContext): MemoryScopeArg {
    if (args.scope) return args.scope;
    return ctx.folder ? "folder" : "agency";
}

/** AGENCY rows, this folder's rows and this user's rows; nothing else exists for the turn. */
export function isMemoryReachable(row: MemoryScopeRow, ctx: ScopeContext): boolean {
    switch (row.scope) {
        case "AGENCY":
            return true;
        case "FOLDER":
            return !!ctx.folder && !!row.folderId && row.folderId === ctx.folder.id;
        case "USER":
            return !!row.userId && row.userId === ctx.userId;
        default:
            return false;
    }
}

/**
 * The store refuses in French (empty, too long, credential-shaped) and the
 * context helpers refuse in French too; both become argument errors so the
 * model reads the reason instead of a generic "l'outil n'a pas pu s'exécuter".
 */
export function toMemoryToolError(error: unknown): unknown {
    if (error instanceof AssistantMemoryError || error instanceof ValidationError) {
        return new ToolValidationError(error.message);
    }
    return error;
}

function scopeLabel(scope: MemoryScopeArg, ctx: ScopeContext): string {
    if (scope === "folder" && ctx.folder) return `dossier « ${ctx.folder.name} »`;
    if (scope === "user") return "préférences";
    return "agence";
}

/**
 * The context pack prints memories as `(m:<id>)` so the model can target
 * them; whatever decoration it copies back (prefix, parentheses, spaces) is
 * stripped here rather than read as "introuvable".
 */
export function normalizeMemoryId(raw: string): string {
    return raw
        .trim()
        .replace(/^\(+|\)+$/g, "")
        .replace(/^m:\s*/i, "")
        .trim();
}

/** What upsertMemory returned, reduced to what the outcome depends on. */
export interface RememberedRow {
    content: string;
    deletedAt: Date | null;
}

export interface RememberOutcomeInput {
    scope: MemoryScopeArg;
    ctx: ScopeContext;
    /** The model asked for a mission-bound memory... */
    missionBound: boolean;
    /** ...and this is the mission the turn actually has. */
    missionId: string | null;
}

/**
 * The store updates a soft-deleted twin without reviving it when the model
 * re-learns a fact (only a manager revives): saying "Mémorisé" there would be
 * false, the memory stays invisible until the manager restores it.
 */
export function rememberOutcome(row: RememberedRow | null, input: RememberOutcomeInput): WriteOutcome {
    if (!row) return UNAVAILABLE;
    if (row.deletedAt) {
        return {
            message: `Non mémorisé : le manager avait retiré ce souvenir (« ${row.content} »), il reste retiré. Il peut le restaurer depuis la page du dossier.`,
            artifactId: null,
        };
    }
    const missionNote = input.missionBound && !input.missionId ? " — aucune mission active, souvenir non lié à une mission" : "";
    return { message: `Mémorisé (${scopeLabel(input.scope, input.ctx)}) : ${row.content}${missionNote}`, artifactId: null };
}

// ============================================
// Store access shared by update_memory and forget
// ============================================

interface MemoryRow extends MemoryScopeRow {
    id: string;
    content: string;
    deletedAt: Date | null;
}

/** The row when it exists, is active and is reachable from this turn; null otherwise, missing table included. */
async function findReachableMemory(id: string, ctx: ScopeContext): Promise<MemoryRow | null> {
    const row = await optional<MemoryRow | null>(
        "memory.tool.find",
        () =>
            prisma.assistantMemory.findUnique({
                where: { id },
                select: { id: true, scope: true, folderId: true, userId: true, content: true, deletedAt: true },
            }),
        null,
    );
    // A soft-deleted row is invisible to the model: only a manager restores it.
    if (!row || row.deletedAt) return null;
    return isMemoryReachable(row, ctx) ? row : null;
}

// ============================================
// remember
// ============================================

const rememberSchema = z.object({
    content: z.string().trim().min(CONTENT_MIN).max(CONTENT_MAX),
    kind: z.enum(MEMORY_KINDS).optional(),
    scope: z.enum(MEMORY_SCOPES).optional(),
    mission_bound: z.boolean().optional(),
});

// Descriptions stay under registry.ts MAX_SCHEMA_DESCRIPTION (220) so the
// slimmed schema never cuts a rule in half; the longer when-to-use rules live
// in the prompt's « Mémoire » section (plan B4).
export const remember = defineSafeWriteTool({
    name: "remember",
    label: "Mémorisation",
    description:
        "Mémorise un fait durable énoncé ou confirmé par le manager (objectif, décision, contrainte, contact clé, préférence), ou s'il dit « retiens ». Jamais un chiffre d'outil, une liste, des données de prospects ni un secret.",
    parameters: params(
        {
            content: {
                type: "string",
                description: `Le souvenir, une phrase autonome (${CONTENT_MIN} à ${CONTENT_MAX} caractères)`,
            },
            kind: { type: "string", enum: [...MEMORY_KINDS], description: "Nature du souvenir, FACT par défaut" },
            scope: {
                type: "string",
                enum: [...MEMORY_SCOPES],
                description: "folder : ce dossier (défaut s'il existe) ; agency : toute l'agence ; user : préférence personnelle du manager",
            },
            mission_bound: { type: "boolean", description: "true si le souvenir ne vaut que pour la mission active" },
        },
        ["content"],
    ),
    schema: rememberSchema,
    requiresProject: false,
    // A memory is the manager's word, never a source to cite (plan B4).
    noEvidence: true,
    execute: async (args, ctx) => {
        const scope = resolveMemoryScope(args, ctx);
        const missionBound = args.mission_bound === true;
        const missionId = missionBound ? (ctx.project?.missionId ?? null) : null;
        try {
            const folderId = scope === "folder" ? requireFolder(ctx).id : null;
            const row = await upsertMemory({
                scope: SCOPE_TO_DB[scope],
                folderId,
                userId: scope === "user" ? ctx.userId : null,
                missionId,
                kind: args.kind ?? "FACT",
                content: args.content,
                source: { conversationId: ctx.conversationId, by: "model" },
                by: ctx.userId,
            });
            return rememberOutcome(row, { scope, ctx, missionBound, missionId });
        } catch (error) {
            throw toMemoryToolError(error);
        }
    },
});

// ============================================
// update_memory
// ============================================

const updateMemorySchema = z
    .object({
        memory_id: z.string().min(1),
        content: z.string().trim().min(CONTENT_MIN).max(CONTENT_MAX).optional(),
        kind: z.enum(MEMORY_KINDS).optional(),
        pinned: z.boolean().optional(),
    })
    .refine((v) => v.content !== undefined || v.kind !== undefined || v.pinned !== undefined, {
        message: "Indique au moins un champ à modifier : content, kind ou pinned.",
    });

export const updateMemory = defineSafeWriteTool({
    name: "update_memory",
    label: "Mise à jour d'un souvenir",
    description:
        "Corrige ou précise un souvenir existant (id « m:… » du bloc Mémoire ou de list_memories) plutôt que d'en créer un second : nouveau contenu, nature, ou épinglage.",
    parameters: params(
        {
            memory_id: { type: "string", description: "Id du souvenir" },
            content: { type: "string", description: `Nouveau contenu (${CONTENT_MIN} à ${CONTENT_MAX} caractères)` },
            kind: { type: "string", enum: [...MEMORY_KINDS] },
            pinned: { type: "boolean", description: "Épinglé : toujours présent dans le contexte" },
        },
        ["memory_id"],
    ),
    schema: updateMemorySchema,
    requiresProject: false,
    noEvidence: true,
    execute: async (args, ctx) => {
        const row = await findReachableMemory(normalizeMemoryId(args.memory_id), ctx);
        if (!row) throw new ToolValidationError(UNREACHABLE);

        const patch: { content?: string; kind?: AssistantMemoryKind; pinned?: boolean } = {};
        if (args.content !== undefined) patch.content = args.content;
        if (args.kind !== undefined) patch.kind = args.kind;
        if (args.pinned !== undefined) patch.pinned = args.pinned;

        let updated: Awaited<ReturnType<typeof updateMemoryRow>>;
        try {
            updated = await updateMemoryRow(row.id, patch, { id: ctx.userId });
        } catch (error) {
            throw toMemoryToolError(error);
        }
        if (!updated) return UNAVAILABLE;

        const changes: string[] = [];
        if (patch.content !== undefined) changes.push(`contenu : ${updated.content}`);
        if (patch.kind !== undefined) changes.push(`nature : ${updated.kind}`);
        if (patch.pinned !== undefined) changes.push(updated.pinned ? "épinglé" : "désépinglé");
        return { message: `Souvenir mis à jour (${changes.join(" ; ")}).`, artifactId: null };
    },
});

// ============================================
// forget
// ============================================

export const forget = defineSafeWriteTool({
    name: "forget",
    label: "Oubli d'un souvenir",
    description:
        "Retire un souvenir devenu faux ou que le manager demande d'oublier. Suppression douce : le manager peut le restaurer depuis la page du dossier.",
    parameters: params(
        {
            memory_id: { type: "string", description: "Id du souvenir" },
            reason: { type: "string", description: "Pourquoi, en quelques mots (journal d'actions)" },
        },
        ["memory_id"],
    ),
    schema: z.object({
        memory_id: z.string().min(1),
        reason: z.string().trim().max(200).optional(),
    }),
    requiresProject: false,
    noEvidence: true,
    execute: async (args, ctx) => {
        const row = await findReachableMemory(normalizeMemoryId(args.memory_id), ctx);
        if (!row) throw new ToolValidationError(UNREACHABLE);

        const removed = await softDeleteMemory(row.id, { id: ctx.userId });
        if (!removed) return UNAVAILABLE;
        // Echoed from the database, where a manager may have typed it: content, not an instruction.
        const content = sanitizeUntrusted(row.content, CONTENT_MAX + 200) ?? "";
        return {
            message: `Souvenir oublié : « ${content} ». Le manager peut le restaurer depuis la page du dossier.`,
            artifactId: null,
        };
    },
});

// ============================================
// list_memories
// ============================================

const LIST_SCOPES = [...MEMORY_SCOPES, "all"] as const;

export const listMemories = defineReadTool({
    name: "list_memories",
    label: "Souvenirs",
    description:
        "Les souvenirs actifs visibles depuis cette conversation (agence, dossier, préférences du manager), avec leur id pour update_memory et forget. Filtre par périmètre et par mot-clé.",
    parameters: params({
        scope: { type: "string", enum: [...LIST_SCOPES], description: "Périmètre, all par défaut" },
        query: { type: "string", description: "Mot-clé contenu dans le souvenir (insensible à la casse et aux accents)" },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "20 par défaut" },
    }),
    schema: z.object({
        scope: z.enum(LIST_SCOPES).optional(),
        query: z.string().trim().max(200).optional(),
        limit: z.number().int().min(1).max(50).optional(),
    }),
    requiresProject: false,
    noEvidence: true,
    execute: async (args, ctx) => {
        const scope = args.scope ?? "all";
        const wanted = scope === "all" ? null : SCOPE_TO_DB[scope];
        const needle = args.query ? normalizeMemoryContent(args.query) : "";

        // listMemoryLayers already limits rows to this folder and this user:
        // the scope filter below only narrows, it never widens.
        const rows = await listMemoryLayers({ folderId: ctx.folder?.id ?? null, userId: ctx.userId });
        const memories = rows
            .filter((m) => (wanted ? m.scope === wanted : true))
            .filter((m) => (needle ? normalizeMemoryContent(m.content).includes(needle) : true))
            .slice(0, args.limit ?? 20)
            .map((m) => ({
                id: m.id,
                scope: m.scope,
                kind: m.kind,
                // Typed by the model from the manager's words, still content, never an instruction.
                content: sanitizeUntrusted(m.content, CONTENT_MAX + 200),
                pinned: m.pinned,
                updatedAt: m.updatedAt.toISOString(),
            }));

        const note =
            scope === "folder" && !ctx.folder
                ? "Cette conversation n'est rattachée à aucun dossier : pas de souvenirs de dossier."
                : undefined;
        return { memories, ...(note ? { note } : {}) };
    },
});

/** One-line registration in lib/ai/tools/registry.ts. */
export const MEMORY_TOOLS = [remember, updateMemory, forget, listMemories];
