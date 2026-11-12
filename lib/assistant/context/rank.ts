/**
 * Memory ranking of the context pack (Captain AI v4), pure so the choice a
 * turn makes is unit-testable and reproducible: the same candidates, question
 * and clock always yield the same block.
 */

import { normalizeMemoryContent } from "../memory/normalize";

export type MemoryScopeName = "AGENCY" | "FOLDER" | "USER";

export interface MemoryCandidate {
    id: string;
    scope: MemoryScopeName;
    kind: string;
    content: string;
    pinned: boolean;
    useCount: number;
    updatedAt: Date;
    missionId: string | null;
}

export interface RankQuery {
    question: string;
    missionId: string | null;
    now: Date;
}

export interface MemorySelection {
    chosen: MemoryCandidate[];
    dropped: number;
}

/** Goals and decisions outrank raw facts: they steer the answer, facts only inform it. */
const KIND_WEIGHT: Record<string, number> = {
    GOAL: 1.0,
    DECISION: 0.9,
    PREFERENCE: 0.8,
    FACT: 0.7,
    CONTACT: 0.6,
};
const DEFAULT_KIND_WEIGHT = 0.5;
const RECENCY_HALF_LIFE_DAYS = 90;
const MIN_TOKEN_LENGTH = 4;
const DAY_MS = 86_400_000;

/**
 * Function words of 4+ letters (shorter ones never pass the length filter),
 * accent-free because normalizeMemoryContent strips accents before matching.
 */
const STOPWORDS = new Set<string>([
    "dans", "avec", "pour", "sans", "sous", "vers", "chez", "entre", "etre", "avoir", "sont", "fait", "faire",
    "plus", "moins", "tres", "trop", "bien", "aussi", "comme", "tout", "tous", "toute", "toutes", "autre", "autres",
    "meme", "memes", "alors", "ainsi", "cela", "ceci", "celui", "celle", "ceux", "celles", "quel", "quelle", "quels",
    "quelles", "quand", "comment", "pourquoi", "combien", "peut", "peux", "pouvons", "pouvez", "peuvent", "dois",
    "doit", "devons", "devez", "doivent", "veux", "veut", "voulons", "voulez", "veulent", "avons", "avez", "avait",
    "avaient", "aurait", "sera", "seront", "serait", "etait", "etaient", "sommes", "etes", "suis", "cette", "chaque",
    "depuis", "pendant", "avant", "apres", "encore", "deja", "jamais", "toujours", "elle", "elles", "nous", "vous",
    "leur", "leurs", "notre", "votre", "dont", "donc", "mais", "quoi", "merci", "bonjour", "cest", "sils",
    "lors", "lorsque", "puis", "donne", "donner", "montre", "montrer", "dire", "faut", "fais",
    "this", "that", "with", "from", "what", "which", "have", "will", "would", "about", "there", "their", "they",
    "them", "then", "than", "also", "into", "been", "were", "your", "some", "more", "most", "over", "such", "only",
    "when", "where", "does", "please",
]);

/** Normalised words of 4+ letters, stopwords removed; the overlap vocabulary of question and memory. */
export function contentTokens(text: string): Set<string> {
    const out = new Set<string>();
    for (const word of normalizeMemoryContent(text).split(" ")) {
        if (word.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(word)) out.add(word);
    }
    return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter += 1;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
}

/**
 * 3·pinned + kind + 1.5·recency + 2·Jaccard + 0.5·mission + 0.25·use.
 * Pinned dominates on purpose: a manager pinning a memory means "always".
 */
export function scoreMemory(m: MemoryCandidate, q: RankQuery): number {
    return scoreWithTokens(m, q, contentTokens(q.question));
}

function scoreWithTokens(m: MemoryCandidate, q: RankQuery, questionTokens: Set<string>): number {
    const ageDays = Math.max(0, (q.now.getTime() - m.updatedAt.getTime()) / DAY_MS);
    const recency = Math.exp(-ageDays / RECENCY_HALF_LIFE_DAYS);
    const overlap = jaccard(questionTokens, contentTokens(m.content));
    const mission = q.missionId && m.missionId === q.missionId ? 1 : 0;
    const use = Math.min(Math.max(m.useCount, 0), 4) / 4;
    return (
        (m.pinned ? 3 : 0) +
        (KIND_WEIGHT[m.kind] ?? DEFAULT_KIND_WEIGHT) +
        1.5 * recency +
        2 * overlap +
        0.5 * mission +
        0.25 * use
    );
}

interface Scored {
    m: MemoryCandidate;
    score: number;
}

/** Score desc, then most recently updated, then id: never depends on input order. */
function compareScored(a: Scored, b: Scored): number {
    if (b.score !== a.score) return b.score - a.score;
    const dt = b.m.updatedAt.getTime() - a.m.updatedAt.getTime();
    if (dt !== 0) return dt;
    return a.m.id < b.m.id ? -1 : a.m.id > b.m.id ? 1 : 0;
}

/**
 * Picks memories within a token budget: first the best of each scope that has
 * one (so a single chatty layer cannot starve the others), then the rest by
 * score, skipping what does not fit. `estimate` prices a candidate the way it
 * will be rendered, so the caller controls what "fits" means.
 */
export function selectMemories(
    candidates: MemoryCandidate[],
    q: RankQuery,
    budgetTokens: number,
    estimate: (m: MemoryCandidate) => number,
): MemorySelection {
    const questionTokens = contentTokens(q.question);
    const ranked = candidates
        .map((m): Scored => ({ m, score: scoreWithTokens(m, q, questionTokens) }))
        .sort(compareScored);

    const chosen = new Set<string>();
    let used = 0;
    const take = (s: Scored): void => {
        const cost = estimate(s.m);
        if (used + cost > budgetTokens) return;
        used += cost;
        chosen.add(s.m.id);
    };

    const seenScopes = new Set<MemoryScopeName>();
    for (const s of ranked) {
        if (seenScopes.has(s.m.scope)) continue;
        seenScopes.add(s.m.scope);
        take(s);
    }
    for (const s of ranked) {
        if (!chosen.has(s.m.id)) take(s);
    }

    const picked = ranked.filter((s) => chosen.has(s.m.id)).map((s) => s.m);
    return { chosen: picked, dropped: candidates.length - picked.length };
}
