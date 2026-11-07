/**
 * In-turn compaction of tool messages.
 *
 * Within one turn every tool payload is re-sent on each later model call, so
 * the input grows quadratically with the number of iterations. The evidence
 * session already holds a summary and the numeric facts of every result, so an
 * old payload can be replaced by that digest without losing what the model
 * needs to finish: the figures are still there, and a fresh identical call is
 * served from the evidence cache (`MAX_CACHED_PAYLOAD_BYTES`) without a query.
 *
 * Everything here is pure: the runtime calls `shouldCompact` before a model
 * call and swaps in the messages `compactToolMessages` returns. The caller
 * decides what is protected (labels cited in the current draft, labels a
 * visual was drawn from) because only it knows the draft.
 */

import type { ChatMessage } from "@/lib/ai/providers/types";

export interface CompactionFact {
    key: string;
    value: number;
    unit?: string | null;
    entity?: string | null;
}

export interface CompactionEntry {
    label: string;
    tool: string;
    summary: string;
    facts: ReadonlyArray<CompactionFact>;
}

export interface CompactionOptions {
    /** Input budget of the tier; tool messages above a quarter of it trigger compaction. */
    budgetTokens: number;
    /** Iterations whose tool messages stay raw, counted from the end. Default 2. */
    keepLastIterations?: number;
    /** Labels that must stay raw: cited in the draft or used by a visual. */
    protectLabels?: ReadonlySet<string>;
    entries: ReadonlyArray<CompactionEntry>;
    /** Token estimator; the default is calibrated on French JSON. */
    estimate?: (text: string) => number;
}

export interface CompactionResult {
    messages: ChatMessage[];
    /** Tool messages rewritten by this pass. */
    compacted: number;
    /** Estimated tool-message tokens before and after. */
    before: number;
    after: number;
}

type ToolMessage = Extract<ChatMessage, { role: "tool" }>;

const DEFAULT_KEEP_LAST_ITERATIONS = 2;
const TOOL_SHARE_TRIGGER = 0.25;
const MAX_RENDERED_FACTS = 40;
const MAX_ENTITY_CHARS = 48;

export const COMPACTION_HINT =
    "Relance le même outil avec les mêmes arguments pour le détail : le résultat frais est resservi sans nouvelle requête.";

const LABEL_PATTERN = /\[(E\d+)\]/g;

/** ~3.6 characters per token: JSON with French strings and many digits. */
export function defaultTokenEstimate(text: string): number {
    return Math.ceil(text.length / 3.6);
}

/** Evidence labels cited `[E12]`-style in a text, in order of first appearance. */
export function citedLabels(text: string): Set<string> {
    const labels = new Set<string>();
    for (const match of text.matchAll(LABEL_PATTERN)) labels.add(match[1]);
    return labels;
}

export function estimateToolTokens(messages: ChatMessage[], estimate: (text: string) => number = defaultTokenEstimate): number {
    let total = 0;
    for (const message of messages) {
        if (message.role === "tool") total += estimate(message.content);
    }
    return total;
}

// -- Message classification ---------------------------------------------------

interface RawEnvelope {
    tool: string | null;
    source: string;
}

/**
 * A tool message is a candidate only when it is the envelope `wrapToolPayload`
 * produces for a successful, labelled result. Errors keep their explanation,
 * already-compacted digests are final, and anything else (visual
 * acknowledgements, refusals, free text) is not ours to touch.
 */
function readRawEnvelope(content: string): RawEnvelope | null {
    // Cheap pre-checks: most non-candidates never contain a source key at all.
    if (!content.includes("\"source\"")) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        return null;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.source !== "string" || record.source.length === 0) return null;
    if ("error" in record) return null;
    if (record._compacted === true) return null;
    return { tool: typeof record.tool === "string" ? record.tool : null, source: record.source };
}

/**
 * Iteration index of every message: an iteration starts at each assistant
 * message carrying tool calls and holds the tool messages that follow it.
 * Tool messages before the first such assistant message get index -1, which
 * makes them older than everything.
 */
function iterationIndexes(messages: ChatMessage[]): { indexes: number[]; total: number } {
    const indexes: number[] = new Array<number>(messages.length);
    let current = -1;
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) current += 1;
        indexes[i] = current;
    }
    return { indexes, total: current + 1 };
}

interface Candidate {
    index: number;
    message: ToolMessage;
    envelope: RawEnvelope;
    entry: CompactionEntry;
}

function eligibleCandidates(messages: ChatMessage[], options: CompactionOptions): Candidate[] {
    const keepLast = Math.max(0, options.keepLastIterations ?? DEFAULT_KEEP_LAST_ITERATIONS);
    const { indexes, total } = iterationIndexes(messages);
    const lastRawIteration = total - keepLast;
    const byLabel = new Map<string, CompactionEntry>();
    for (const entry of options.entries) byLabel.set(entry.label, entry);

    const out: Candidate[] = [];
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        if (message.role !== "tool") continue;
        if (indexes[i] >= lastRawIteration) continue;
        const envelope = readRawEnvelope(message.content);
        if (!envelope) continue;
        if (options.protectLabels?.has(envelope.source)) continue;
        const entry = byLabel.get(envelope.source);
        if (!entry) continue;
        out.push({ index: i, message, envelope, entry });
    }
    return out;
}

// -- Rendering ----------------------------------------------------------------

function renderUnit(unit: string | null | undefined): string {
    if (!unit || unit === "count") return "";
    if (unit === "pct") return "%";
    return ` ${unit}`;
}

function renderEntity(entity: string | null | undefined): string {
    if (!entity) return "";
    const clean = entity.replace(/[;\n\r]+/g, ",").trim();
    if (clean.length === 0) return "";
    return `=${clean.length > MAX_ENTITY_CHARS ? `${clean.slice(0, MAX_ENTITY_CHARS)}…` : clean}`;
}

/** `key[=entity] value[unit]; ...`, capped so a wide table does not undo the saving. */
export function renderFacts(facts: ReadonlyArray<CompactionFact>, max = MAX_RENDERED_FACTS): string {
    const parts: string[] = [];
    for (const fact of facts) {
        if (parts.length >= max) break;
        if (!Number.isFinite(fact.value)) continue;
        parts.push(`${fact.key}${renderEntity(fact.entity)} ${fact.value}${renderUnit(fact.unit)}`);
    }
    const rendered = parts.join("; ");
    return facts.length > parts.length ? `${rendered}; … (${facts.length - parts.length} autres)` : rendered;
}

function compactedContent(candidate: Candidate): string {
    return JSON.stringify({
        tool: candidate.envelope.tool ?? candidate.entry.tool,
        source: candidate.envelope.source,
        _compacted: true,
        summary: candidate.entry.summary,
        facts: renderFacts(candidate.entry.facts),
        hint: COMPACTION_HINT,
    });
}

// -- Public entry points ------------------------------------------------------

function overBudget(toolTokens: number, options: CompactionOptions): boolean {
    return toolTokens > options.budgetTokens * TOOL_SHARE_TRIGGER;
}

/** True when tool messages weigh more than a quarter of the budget and at least one can be rewritten. */
export function shouldCompact(messages: ChatMessage[], options: CompactionOptions): boolean {
    const estimate = options.estimate ?? defaultTokenEstimate;
    if (!overBudget(estimateToolTokens(messages, estimate), options)) return false;
    return eligibleCandidates(messages, options).length > 0;
}

/**
 * Rewrite the eligible tool messages into their evidence digest. Order, ids
 * and every other message are kept as they are; the input array and its
 * messages are never mutated. Running it twice yields the same messages,
 * because a digest is never a candidate again. Below the budget it is a copy:
 * the same gate as `shouldCompact`, so a caller cannot compact by accident.
 */
export function compactToolMessages(messages: ChatMessage[], options: CompactionOptions): CompactionResult {
    const estimate = options.estimate ?? defaultTokenEstimate;
    const before = estimateToolTokens(messages, estimate);
    const candidates = overBudget(before, options) ? eligibleCandidates(messages, options) : [];
    if (candidates.length === 0) return { messages: messages.slice(), compacted: 0, before, after: before };

    const replacements = new Map<number, string>();
    for (const candidate of candidates) replacements.set(candidate.index, compactedContent(candidate));

    const next: ChatMessage[] = messages.map((message, index) => {
        const content = replacements.get(index);
        if (content === undefined || message.role !== "tool") return message;
        return { ...message, content };
    });
    return { messages: next, compacted: candidates.length, before, after: estimateToolTokens(next, estimate) };
}
