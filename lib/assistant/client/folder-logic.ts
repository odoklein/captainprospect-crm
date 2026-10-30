/**
 * Pure logic of the Captain AI folder home: tabs, token meter, memory
 * grouping, starter questions, file statuses and polling, upload labels, board
 * reordering, folder colours, French counts. No React, no fetch, no import
 * from components/ (the hooks in folder-hooks.ts and the UI both read it).
 *     npx tsx --test components/assistant-ui/workspace/folder/logic.test.ts
 *
 * components/assistant-ui/workspace/folder/logic.ts re-exports this module.
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
} from "../api-contract";

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

/** A count in a tab badge: hidden at 0, capped at « 999+ ». */
export function tabCountLabel(n: number | undefined): string | null {
    if (n === undefined || !Number.isFinite(n) || n <= 0) return null;
    return n > 999 ? "999+" : String(Math.floor(n));
}

// ============================================
// French counts
// ============================================

/** « 1 souvenir », « 1 204 souvenirs », « 0 fichier » (French: 0 and 1 are singular). */
export function countLabel(n: number, one: string, many: string): string {
    return `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;
}

// ============================================
// Folder colour
// ============================================

export type FolderTone = "emerald" | "amber" | "rose" | "indigo" | "teal" | "violet" | "slate";

export const FOLDER_TONES: readonly FolderTone[] = ["emerald", "amber", "rose", "indigo", "teal", "violet", "slate"];
const DERIVED_TONES: readonly FolderTone[] = ["indigo", "teal", "emerald", "amber", "rose", "slate"];

/** Tone or CSS colour of a folder: a tone name, a hex, a --ds token, else derived from the name. */
export function folderColor(color: string | null, name: string): { tone: FolderTone } | { css: string } {
    const c = (color ?? "").trim();
    if ((FOLDER_TONES as readonly string[]).includes(c)) return { tone: c as FolderTone };
    if (/^#[0-9a-f]{3,8}$/i.test(c)) return { css: c };
    if (c.startsWith("--")) return { css: `var(${c})` };
    if (c.startsWith("ds-")) return { css: `var(--${c})` };
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return { tone: DERIVED_TONES[h % DERIVED_TONES.length] };
}

/** Normalised lucide icon key of a folder (« Building2 », « bar-chart-3 » → « building2 », « barchart3 »). */
export function folderIconKey(icon: string | null): string {
    return (icon ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
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

/** First non-empty line of the instructions, for the collapsed editor. */
export function instructionsPreview(text: string | null | undefined): string {
    for (const line of (text ?? "").split("\n")) {
        const clean = line.trim();
        if (clean) return clean;
    }
    return "";
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

/** Radix Select cannot hold "": the « Toutes les missions » option uses this value. */
export const ALL_MISSIONS = "__all__";

/** Mission id to send with a new conversation (null = every mission). */
export function missionIdFromSelect(value: string | null | undefined): string | null {
    return value && value !== ALL_MISSIONS ? value : null;
}

/** Title typed in an inline rename: trimmed, spaces collapsed, capped; null = nothing to save. */
export function cleanTitle(value: string, previous: string, max = 120): string | null {
    const next = value.trim().replace(/\s+/g, " ").slice(0, max);
    return next && next !== previous ? next : null;
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

/** Character counter level of a bounded text (memory content): amber from 90 %, red at the cap. */
export function charCountLevel(length: number, max: number): MeterLevel {
    if (length >= max) return "over";
    if (length >= max * 0.9) return "warn";
    return "ok";
}

/** Toggle-group value ↔ kind filter (Radix ToggleGroup gives "" when the active item is clicked again). */
export function kindFromToggle(value: string): MemoryKind | null {
    return MEMORY_KINDS.some((k) => k.kind === value) ? (value as MemoryKind) : null;
}

// ============================================
// Files
// ============================================

export function filesNeedPolling(files: readonly FolderFile[] | undefined): boolean {
    return (files ?? []).some((f) => f.status === "PENDING" || f.status === "PROCESSING");
}

export type StatusTone = "emerald" | "amber" | "rose" | "violet" | "slate";
/** Badge variant of components/ui/shadcn/badge. */
export type StatusBadge = "success" | "ai" | "secondary" | "danger" | "warning" | "outline";

export const FILE_STATUS: Record<FileTextStatus, { label: string; tone: StatusTone; badge: StatusBadge; spinner: boolean; pulse: boolean; hint: string }> = {
    READY: { label: "Prêt", tone: "emerald", badge: "success", spinner: false, pulse: false, hint: "Indexé : Captain peut le citer." },
    PROCESSING: { label: "Indexation…", tone: "violet", badge: "ai", spinner: true, pulse: true, hint: "Extraction du texte en cours." },
    PENDING: { label: "En attente", tone: "slate", badge: "secondary", spinner: false, pulse: true, hint: "L'indexation va démarrer." },
    FAILED: { label: "Échec", tone: "rose", badge: "danger", spinner: false, pulse: false, hint: "L'indexation a échoué. Tu peux relancer." },
    NEEDS_OCR: { label: "PDF scanné (OCR)", tone: "amber", badge: "warning", spinner: false, pulse: false, hint: "Ce PDF est une image : son texte n'a pas pu être lu." },
    UNSUPPORTED: { label: "Non pris en charge", tone: "slate", badge: "outline", spinner: false, pulse: false, hint: "Ce format ne peut pas être lu par Captain." },
};

export function fileStatusView(status: FileTextStatus) {
    return FILE_STATUS[status] ?? FILE_STATUS.PENDING;
}

/** Tooltip text of a file's status: the server's error when it failed, else the status hint. */
export function fileStatusHint(file: Pick<FolderFile, "status" | "error">): string {
    if (file.error && (file.status === "FAILED" || file.status === "NEEDS_OCR")) return file.error;
    return fileStatusView(file.status).hint;
}

export function fileIsIndexing(file: Pick<FolderFile, "status">): boolean {
    return file.status === "PENDING" || file.status === "PROCESSING";
}

/** Re-indexing makes sense once a file settled, unless its format cannot be read at all. */
export function canReindex(file: Pick<FolderFile, "status">): boolean {
    return !fileIsIndexing(file) && file.status !== "UNSUPPORTED";
}

/** « 3 fichiers · 2 prêts · 1 en cours d'indexation ». */
export function filesSummary(files: readonly Pick<FolderFile, "status">[]): string {
    if (files.length === 0) return "Aucun fichier";
    const ready = files.filter((f) => f.status === "READY").length;
    const working = files.filter(fileIsIndexing).length;
    const parts = [countLabel(files.length, "fichier", "fichiers"), `${ready} prêt${ready > 1 ? "s" : ""}`];
    if (working) parts.push(`${working} en cours d'indexation`);
    return parts.join(" · ");
}

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

export type UploadState = "queued" | "uploading" | "done" | "error";

/** Right-hand label of an upload row. */
export function uploadStatusLabel(state: UploadState, progress: number): string {
    if (state === "error") return "Échec";
    if (state === "queued") return "En file";
    if (state === "done") return "Envoyé";
    return `${Math.round(Math.min(1, Math.max(0, progress)) * 100)} %`;
}

/** Progress bar value (0-100) of an upload row: a sliver as soon as it starts, so it reads as moving. */
export function uploadProgressValue(state: UploadState, progress: number): number {
    if (state === "queued") return 0;
    if (state === "done") return 100;
    return Math.max(3, Math.round(Math.min(1, Math.max(0, progress)) * 100));
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

/** Visual kinds that need the full board width. */
export const WIDE_VISUALS: ReadonlySet<string> = new Set(["table", "kpi_row", "heatmap"]);

/** Puts a pin back after an undone removal, in its place. */
export function restorePin(pins: readonly PinItem[], pin: PinItem): PinItem[] {
    return sortPins([...pins.filter((p) => p.id !== pin.id), pin]);
}
