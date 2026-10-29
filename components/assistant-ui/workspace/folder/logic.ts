/**
 * Pure logic of the folder home (Captain AI workspace): token meter, memory
 * grouping, starter questions, file polling, board reordering, labels.
 * No React, no fetch: everything here is covered by logic.test.ts.
 *     npx tsx --test components/assistant-ui/workspace/folder/logic.test.ts
 */

import type {
    ConversationCard,
    ConversationsResponse,
    FileTextStatus,
    FolderFile,
    FolderKind,
    MemoriesResponse,
    MemoryItem,
    MemoryKind,
    MemoryScope,
    PinItem,
} from "@/lib/assistant/api-contract";

// ============================================
// Tabs
// ============================================

export type FolderTabId = "conversations" | "memoire" | "fichiers" | "tableau" | "agent";

export const FOLDER_TABS: ReadonlyArray<{ id: FolderTabId; label: string; agency: boolean }> = [
    { id: "conversations", label: "Conversations", agency: true },
    { id: "memoire", label: "Mémoire", agency: true },
    { id: "fichiers", label: "Fichiers", agency: false },
    { id: "tableau", label: "Tableau", agency: false },
    { id: "agent", label: "Agent", agency: false },
];

/** Tabs shown for a folder; the agency view (folderId null) keeps Conversations + Mémoire. */
export function visibleTabs(isAgency: boolean): FolderTabId[] {
    return FOLDER_TABS.filter((t) => !isAgency || t.agency).map((t) => t.id);
}

/** Unknown or hidden tab → the first visible one. */
export function resolveTab(tab: string, isAgency: boolean): FolderTabId {
    const tabs = visibleTabs(isAgency);
    return (tabs as string[]).includes(tab) ? (tab as FolderTabId) : tabs[0];
}

// ============================================
// Instructions: token meter and save label
// ============================================

/** Rough French token count (~3.6 chars per token), the same order as the server's. */
export function estimateTokens(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return Math.ceil(trimmed.length / 3.6);
}

/**
 * Tokens of the text being typed. When the server counted the saved text, its
 * ratio calibrates the estimate so the meter does not jump on save.
 */
export function liveTokens(text: string, saved: { text: string; tokens: number } | null): number {
    if (saved && text === saved.text) return saved.tokens;
    const raw = estimateTokens(text);
    if (!saved || saved.tokens <= 0) return raw;
    const savedRaw = estimateTokens(saved.text);
    if (savedRaw <= 0) return raw;
    const ratio = Math.min(2, Math.max(0.5, saved.tokens / savedRaw));
    return Math.round(raw * ratio);
}

export type MeterLevel = "ok" | "warn" | "over";

export function tokenMeter(tokens: number, max: number): { pct: number; level: MeterLevel } {
    if (max <= 0) return { pct: 0, level: tokens > 0 ? "over" : "ok" };
    const ratio = tokens / max;
    const level: MeterLevel = ratio > 1 ? "over" : ratio >= 0.8 ? "warn" : "ok";
    return { pct: Math.min(100, Math.max(0, Math.round(ratio * 100))), level };
}

/** « Enregistré · à l'instant », « … · il y a 12 s », « … · il y a 3 min », « … · il y a 2 h ». */
export function savedAgoLabel(savedAt: number, now: number): string {
    const s = Math.max(0, Math.floor((now - savedAt) / 1000));
    if (s < 2) return "Enregistré · à l'instant";
    if (s < 60) return `Enregistré · il y a ${s} s`;
    const min = Math.floor(s / 60);
    if (min < 60) return `Enregistré · il y a ${min} min`;
    return `Enregistré · il y a ${Math.floor(min / 60)} h`;
}

// ============================================
// Starter questions
// ============================================

export const DEFAULT_STARTERS: Record<FolderKind | "AGENCY", string[]> = {
    CLIENT: [
        "Où en est la mission cette semaine ?",
        "Quels contacts relancer en priorité ?",
        "Résume les derniers RDV pris et leur qualité.",
        "Quels sont les meilleurs créneaux d'appel pour ce client ?",
    ],
    GENERAL: [
        "Fais le point sur ce sujet à partir des fichiers du dossier.",
        "Quelles décisions avons-nous déjà prises ici ?",
        "Prépare une synthèse à partager avec l'équipe.",
        "Quelles questions restent ouvertes ?",
    ],
    AGENCY: [
        "Comment se porte l'agence cette semaine ?",
        "Quelles missions sont en retard sur leurs objectifs ?",
        "Combien de RDV ont été pris hier, par client ?",
        "Quels SDR ont le plus progressé ce mois-ci ?",
    ],
};

/** The folder's own questions first, then the defaults of its kind; deduplicated, at most `max`. */
export function starterQuestions(kind: FolderKind | "AGENCY", provided: readonly string[] | null | undefined, max = 4): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const q of [...(provided ?? []), ...DEFAULT_STARTERS[kind]]) {
        const clean = q.trim();
        const key = clean.toLocaleLowerCase("fr").replace(/\s+/g, " ");
        if (!clean || seen.has(key)) continue;
        seen.add(key);
        out.push(clean);
        if (out.length >= max) break;
    }
    return out;
}

// ============================================
// Conversations
// ============================================

/** Flattens useSWRInfinite pages, dropping duplicates a shifting cursor can produce. */
export function flattenConversationPages(pages: ReadonlyArray<ConversationsResponse | undefined> | undefined): ConversationCard[] {
    const out: ConversationCard[] = [];
    const seen = new Set<string>();
    for (const page of pages ?? []) {
        for (const item of page?.items ?? []) {
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            out.push(item);
        }
    }
    return out;
}

export function initialsOf(name: string | null | undefined): string {
    const parts = (name ?? "").split(/\s+/).filter(Boolean);
    return parts.map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "?";
}

// ============================================
// Memory
// ============================================

export const MEMORY_CONTENT_MAX = 600;

export const MEMORY_KINDS: ReadonlyArray<{ kind: MemoryKind; label: string }> = [
    { kind: "FACT", label: "Fait" },
    { kind: "PREFERENCE", label: "Préférence" },
    { kind: "DECISION", label: "Décision" },
    { kind: "CONTACT", label: "Contact" },
    { kind: "GOAL", label: "Objectif" },
];

export function memoryKindLabel(kind: MemoryKind): string {
    return MEMORY_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

export type MemoryLayer = "agency" | "folder" | "user";

export function layerOfScope(scope: MemoryScope): MemoryLayer {
    return scope === "AGENCY" ? "agency" : scope === "FOLDER" ? "folder" : "user";
}

/** Pinned first, then most recently updated. */
export function sortMemories(items: readonly MemoryItem[]): MemoryItem[] {
    return [...items].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
    });
}

export interface MemoryGroup {
    layer: MemoryLayer;
    label: string;
    items: MemoryItem[];
    /** Items of the layer before the kind filter (for « 0 sur 4 »). */
    total: number;
}

/**
 * The layers visible from a folder. The agency view has no folder layer.
 * `kind` null = every kind; deleted items only when `includeDeleted`.
 */
export function groupMemories(
    data: MemoriesResponse | undefined,
    opts: { folderName: string | null; kind: MemoryKind | null; includeDeleted: boolean },
): MemoryGroup[] {
    const layers: Array<{ layer: MemoryLayer; label: string; items: MemoryItem[] }> = [
        { layer: "agency", label: "Agence", items: data?.agency ?? [] },
    ];
    if (opts.folderName !== null) layers.push({ layer: "folder", label: `Dossier « ${opts.folderName} »`, items: data?.folder ?? [] });
    layers.push({ layer: "user", label: "Mes préférences", items: data?.user ?? [] });
    return layers.map(({ layer, label, items }) => {
        const live = opts.includeDeleted ? items : items.filter((m) => !m.deletedAt);
        const filtered = opts.kind ? live.filter((m) => m.kind === opts.kind) : live;
        return { layer, label, items: sortMemories(filtered), total: live.length };
    });
}

export function memoryKindCounts(data: MemoriesResponse | undefined, includeDeleted: boolean, withFolder: boolean): Record<MemoryKind | "ALL", number> {
    const counts: Record<MemoryKind | "ALL", number> = { ALL: 0, FACT: 0, PREFERENCE: 0, DECISION: 0, CONTACT: 0, GOAL: 0 };
    const all = [...(data?.agency ?? []), ...(withFolder ? (data?.folder ?? []) : []), ...(data?.user ?? [])];
    for (const m of all) {
        if (!includeDeleted && m.deletedAt) continue;
        counts[m.kind] += 1;
        counts.ALL += 1;
    }
    return counts;
}

/** Applies `fn` to the item with `id`, whichever layer holds it. */
export function mapMemory(data: MemoriesResponse, id: string, fn: (m: MemoryItem) => MemoryItem | null): MemoriesResponse {
    const apply = (list: MemoryItem[]) => list.flatMap((m) => (m.id === id ? (fn(m) ?? []) : [m]));
    return { ...data, agency: apply(data.agency), folder: apply(data.folder), user: apply(data.user) };
}

/** Adds (or replaces by id) an item in the layer of its scope, at the top. */
export function upsertMemory(data: MemoriesResponse, item: MemoryItem, replaceId?: string): MemoriesResponse {
    const drop = new Set([item.id, replaceId].filter(Boolean) as string[]);
    const strip = (list: MemoryItem[]) => list.filter((m) => !drop.has(m.id));
    const next = { ...data, agency: strip(data.agency), folder: strip(data.folder), user: strip(data.user) };
    const layer = layerOfScope(item.scope);
    next[layer] = [item, ...next[layer]];
    return next;
}

// ============================================
// Files
// ============================================

export function filesNeedPolling(files: readonly FolderFile[] | undefined): boolean {
    return (files ?? []).some((f) => f.status === "PENDING" || f.status === "PROCESSING");
}

export type StatusTone = "emerald" | "amber" | "rose" | "violet" | "slate";

export const FILE_STATUS: Record<FileTextStatus, { label: string; tone: StatusTone; pulse: boolean; hint: string }> = {
    READY: { label: "Prêt", tone: "emerald", pulse: false, hint: "Indexé : Captain peut le citer." },
    PROCESSING: { label: "Indexation…", tone: "violet", pulse: true, hint: "Extraction du texte en cours." },
    PENDING: { label: "En attente", tone: "slate", pulse: true, hint: "L'indexation va démarrer." },
    FAILED: { label: "Échec", tone: "rose", pulse: false, hint: "L'indexation a échoué. Tu peux relancer." },
    NEEDS_OCR: { label: "PDF scanné", tone: "amber", pulse: false, hint: "Ce PDF est une image : aucun texte n'a pu être extrait." },
    UNSUPPORTED: { label: "Non pris en charge", tone: "slate", pulse: false, hint: "Ce format ne peut pas être lu par Captain." },
};

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    if (bytes < 1024) return `${bytes} o`;
    const units = ["Ko", "Mo", "Go"];
    let value = bytes / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i += 1;
    }
    return `${value.toLocaleString("fr-FR", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[i]}`;
}

/** French reason for a file the dropzone refused. */
export function rejectionReason(code: string, maxBytes: number): string {
    if (code === "file-too-large") return `plus de ${formatBytes(maxBytes)}`;
    if (code === "file-invalid-type") return "format non pris en charge";
    if (code === "too-many-files") return "trop de fichiers à la fois";
    return "refusé";
}

/** Prepends uploaded files, replacing any with the same id. */
export function mergeFiles(current: readonly FolderFile[], added: readonly FolderFile[]): FolderFile[] {
    const ids = new Set(added.map((f) => f.fileId));
    return [...added, ...current.filter((f) => !ids.has(f.fileId))];
}

// ============================================
// Board (pins)
// ============================================

/** The pins list, whatever envelope the route uses (array, { items }, { pins }). */
export function normalizePins(data: unknown): PinItem[] {
    const list = Array.isArray(data)
        ? data
        : data && typeof data === "object"
          ? ((data as { items?: unknown }).items ?? (data as { pins?: unknown }).pins)
          : null;
    if (!Array.isArray(list)) return [];
    return (list as PinItem[]).filter((p) => p && typeof p.id === "string");
}

export function sortPins(pins: readonly PinItem[]): PinItem[] {
    return [...pins].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
}

/**
 * Moves a pin one step up or down. Returns the reordered list (positions
 * swapped with the neighbour) and the two PATCHes to send, or null at an edge.
 */
export function movePin(
    pins: readonly PinItem[],
    id: string,
    dir: -1 | 1,
): { pins: PinItem[]; patches: Array<{ id: string; position: number }> } | null {
    const sorted = sortPins(pins);
    const i = sorted.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return null;
    const a = sorted[i];
    const b = sorted[j];
    // Equal positions (never reordered): fall back to the indices.
    const posA = a.position === b.position ? i : a.position;
    const posB = a.position === b.position ? j : b.position;
    const next = sorted.map((p) => (p.id === a.id ? { ...p, position: posB } : p.id === b.id ? { ...p, position: posA } : p));
    return {
        pins: sortPins(next),
        patches: [
            { id: a.id, position: posB },
            { id: b.id, position: posA },
        ],
    };
}

/** The StoredVisual inside a pin, when it has a drawable spec. */
export function pinVisual<T = unknown>(pin: PinItem): T | null {
    const v = pin.visual as { spec?: { kind?: unknown } } | null;
    if (!v || typeof v !== "object" || !v.spec || typeof v.spec !== "object" || typeof v.spec.kind !== "string") return null;
    return v as T;
}
