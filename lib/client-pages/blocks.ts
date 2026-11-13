// Client workspace pages: the editor document stored in ClientPage.blocks.
// Plain, typed blocks rather than HTML: safe to render, easy for the assistant
// to read later, and small enough to validate on every save.

import { z } from "zod";

export const BLOCK_TYPES = ["paragraph", "h2", "h3", "bullet", "todo", "quote", "callout", "divider", "callQueue"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const MAX_BLOCKS = 600;
export const MAX_BLOCK_TEXT = 8000;
export const MAX_TITLE = 200;

export const blockSchema = z.object({
    id: z.string().min(1).max(40),
    type: z.enum(BLOCK_TYPES),
    text: z.string().max(MAX_BLOCK_TEXT).default(""),
    checked: z.boolean().optional(),
    /** callQueue: the mission whose call queue the block shows. */
    missionId: z.string().max(40).nullable().optional(),
});

export const blocksSchema = z.array(blockSchema).max(MAX_BLOCKS);

export type Block = z.infer<typeof blockSchema>;

export function newBlockId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function block(type: BlockType, text = "", extra: Partial<Block> = {}): Block {
    return { id: newBlockId(), type, text, ...extra };
}

/** Reads whatever is stored; drops anything malformed instead of failing the page. */
export function readBlocks(value: unknown): Block[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        const parsed = blockSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
    });
}

export const PAGE_TEMPLATES = {
    blank: { label: "Page vide", title: "", blocks: () => [block("paragraph")] },
    brief: {
        label: "Brief de mission",
        title: "Brief de mission",
        blocks: () => [
            block("h2", "Contexte et objectif"),
            block("paragraph"),
            block("h2", "Cible"),
            block("bullet", "Secteurs : "),
            block("bullet", "Taille d’entreprise : "),
            block("bullet", "Fonctions visées : "),
            block("h2", "Checklist de lancement"),
            block("todo", "Cible et segmentation validées"),
            block("todo", "Script d’appel relu"),
            block("todo", "Liste de prospects importée et dédoublonnée"),
            block("todo", "Planning et répartition de l’équipe"),
            block("h2", "File d’appels"),
            block("callQueue", "", { missionId: null }),
        ],
    },
    launch: {
        label: "Compte rendu de lancement",
        title: "Compte rendu du lancement",
        blocks: () => [
            block("callout", "Participants, date et durée de la réunion."),
            block("h2", "Décisions"),
            block("bullet"),
            block("h2", "Actions"),
            block("todo"),
            block("h2", "Points ouverts"),
            block("bullet"),
        ],
    },
    procedure: {
        label: "Procédure",
        title: "Procédure",
        blocks: () => [
            block("callout", "À quoi sert cette procédure et quand l’appliquer."),
            block("h2", "Étapes"),
            block("todo"),
            block("h2", "Cas particuliers"),
            block("bullet"),
        ],
    },
} as const;

export type PageTemplate = keyof typeof PAGE_TEMPLATES;
export const PAGE_TEMPLATE_IDS = Object.keys(PAGE_TEMPLATES) as PageTemplate[];
