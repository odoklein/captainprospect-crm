/**
 * The evidence of one turn.
 *
 * Each retrieval gets a short label (E1, E2…) that the model sees and cites;
 * the database id never reaches the model, so a citation can only point at
 * something this session registered. Fresh evidence from earlier turns of the
 * same conversation is loaded first, so a follow-up can cite and reuse it.
 *
 * `record` persists before it returns: a tool result reaches the model only
 * once its evidence row exists (or the store is known to be unavailable, in
 * which case the entry is flagged `persisted: false` and its citation cannot be
 * opened).
 */

import { randomUUID } from "node:crypto";
import { scrubSensitive } from "@/lib/ai/tools/redact";
import type { AssistantContext } from "@/lib/ai/tools/types";
import type { CitationRef, EvidenceStatus } from "../protocol";
import { collectStrings, extractFacts, periodFromArgs, periodOf, type EvidencePeriod, type Fact } from "./facts";
import {
    MAX_CACHED_PAYLOAD_BYTES,
    digest,
    evidenceArgsHash,
    evidenceTtlMs,
    mayCachePayload,
} from "./policy";
import { buildEvidenceSummary } from "./summary";
import { EvidenceStoreUnavailable, type EvidenceRow, type EvidenceStore } from "./store";

export interface EvidenceEntry {
    label: string;
    id: string;
    tool: string;
    toolLabel: string;
    status: EvidenceStatus;
    errorCode: string | null;
    summary: string;
    facts: Fact[];
    period: EvidencePeriod | null;
    retrievedAt: Date;
    expiresAt: Date;
    persisted: boolean;
    /** Loaded from an earlier turn of this conversation. */
    prior: boolean;
    /** Payload strings, in memory only (date and name checks). Null for prior entries. */
    strings: string[] | null;
    argsHash: string;
}

export interface RecordInput {
    tool: string;
    toolLabel: string;
    /** Validated arguments, or the raw ones when validation is what failed. */
    args: unknown;
    status: EvidenceStatus;
    errorCode?: string | null;
    data?: unknown;
}

const PRIOR_LIMIT = 8;

export class EvidenceSession {
    readonly entries: EvidenceEntry[] = [];
    private storeUsable: boolean;

    constructor(
        private readonly params: {
            store: EvidenceStore | null;
            runId: string;
            ctx: AssistantContext;
            now: () => Date;
            /** False when the run row could not be created: nothing can reference it. */
            storeUsable: boolean;
            toolLabel: (tool: string) => string;
        },
    ) {
        this.storeUsable = params.storeUsable && !!params.store;
    }

    get persistenceAvailable(): boolean {
        return this.storeUsable;
    }

    private nextLabel(): string {
        return `E${this.entries.length + 1}`;
    }

    private scope() {
        return {
            clientId: this.params.ctx.project?.clientId ?? null,
            missionId: this.params.ctx.project?.missionId ?? null,
        };
    }

    hashArgs(tool: string, args: unknown): string {
        return evidenceArgsHash(tool, args, this.scope());
    }

    /** Fresh evidence from earlier turns of this conversation, labelled first. */
    async loadPrior(): Promise<void> {
        const { store, ctx } = this.params;
        if (!this.storeUsable || !store || !ctx.conversationId) return;
        let rows: EvidenceRow[] = [];
        try {
            rows = await store.listFresh({ conversationId: ctx.conversationId, userId: ctx.userId, now: this.params.now(), limit: PRIOR_LIMIT });
        } catch {
            return;
        }
        const scope = this.scope();
        for (const row of rows.reverse()) {
            // Belt and braces: a conversation never changes project, but a row
            // from another scope must never be cited here.
            if (row.clientId !== scope.clientId || row.missionId !== scope.missionId) continue;
            if (this.entries.some((e) => e.id === row.id)) continue;
            this.entries.push({
                label: this.nextLabel(),
                id: row.id,
                tool: row.tool,
                toolLabel: this.params.toolLabel(row.tool),
                status: row.status,
                errorCode: row.errorCode,
                summary: row.summary,
                facts: row.facts,
                period: row.period,
                retrievedAt: row.retrievedAt,
                expiresAt: row.expiresAt,
                persisted: true,
                prior: true,
                strings: null,
                argsHash: row.argsHash,
            });
        }
    }

    /**
     * A still-fresh identical retrieval: same tool, same validated arguments,
     * same scope. Returns the payload to hand back to the model.
     */
    async reuse(tool: string, argsHash: string): Promise<{ entry: EvidenceEntry; payload: unknown } | null> {
        const { store, ctx } = this.params;
        if (!this.storeUsable || !store || !ctx.conversationId || !mayCachePayload(tool)) return null;
        let row: EvidenceRow | null = null;
        try {
            row = await store.findReusable({ conversationId: ctx.conversationId, userId: ctx.userId, tool, argsHash, now: this.params.now() });
        } catch {
            return null;
        }
        if (!row || row.payload === null) return null;
        const scope = this.scope();
        if (row.clientId !== scope.clientId || row.missionId !== scope.missionId) return null;

        let entry = this.entries.find((e) => e.id === row!.id);
        if (!entry) {
            entry = {
                label: this.nextLabel(),
                id: row.id,
                tool: row.tool,
                toolLabel: this.params.toolLabel(row.tool),
                status: row.status,
                errorCode: row.errorCode,
                summary: row.summary,
                facts: row.facts,
                period: row.period,
                retrievedAt: row.retrievedAt,
                expiresAt: row.expiresAt,
                persisted: true,
                prior: true,
                strings: null,
                argsHash: row.argsHash,
            };
            this.entries.push(entry);
        }
        entry.strings = collectStrings(row.payload);
        return { entry, payload: row.payload };
    }

    async record(input: RecordInput): Promise<EvidenceEntry> {
        const now = this.params.now();
        const { ctx, runId, store } = this.params;
        const scrubbed = input.data === undefined ? undefined : scrubSensitive(input.data);
        // The payload's own window wins; otherwise the one the arguments asked for.
        const period = input.status === "ERROR" ? null : periodOf(scrubbed, now) ?? periodFromArgs(input.args, now);
        const facts = input.status === "OK" ? extractFacts(scrubbed, now, period) : [];
        const argsHash = this.hashArgs(input.tool, input.args);
        const summary = buildEvidenceSummary({ toolLabel: input.toolLabel, status: input.status, errorCode: input.errorCode, facts, period });

        const serialized = scrubbed === undefined ? "" : JSON.stringify(scrubbed);
        const keepPayload =
            input.status !== "ERROR" && mayCachePayload(input.tool) && serialized.length > 0 && serialized.length <= MAX_CACHED_PAYLOAD_BYTES;

        const entry: EvidenceEntry = {
            label: this.nextLabel(),
            id: `ev_${randomUUID().replace(/-/g, "")}`,
            tool: input.tool,
            toolLabel: input.toolLabel,
            status: input.status,
            errorCode: input.errorCode ?? null,
            summary,
            facts,
            period,
            retrievedAt: now,
            expiresAt: new Date(now.getTime() + evidenceTtlMs(input.tool)),
            persisted: false,
            prior: false,
            strings: scrubbed === undefined ? [] : collectStrings(scrubbed),
            argsHash,
        };

        if (this.storeUsable && store && ctx.conversationId) {
            try {
                await store.insertEvidence({
                    id: entry.id,
                    runId,
                    conversationId: ctx.conversationId,
                    userId: ctx.userId,
                    clientId: ctx.project?.clientId ?? null,
                    missionId: ctx.project?.missionId ?? null,
                    tool: input.tool,
                    argsHash,
                    args: scrubSensitive(input.args ?? {}),
                    status: input.status,
                    errorCode: entry.errorCode,
                    summary,
                    facts,
                    period,
                    resultDigest: scrubbed === undefined ? null : digest(scrubbed),
                    payload: keepPayload ? scrubbed : null,
                    retrievedAt: now,
                    expiresAt: entry.expiresAt,
                });
                entry.persisted = true;
            } catch (error) {
                if (error instanceof EvidenceStoreUnavailable) this.storeUsable = false;
                console.warn("[assistant.evidence] not persisted", input.tool, error instanceof Error ? error.message : error);
            }
        }

        this.entries.push(entry);
        return entry;
    }

    resolve(label: string): EvidenceEntry | undefined {
        return this.entries.find((e) => e.label === label);
    }

    citation(entry: EvidenceEntry): CitationRef {
        return {
            label: entry.label,
            evidenceId: entry.persisted ? entry.id : null,
            tool: entry.tool,
            toolLabel: entry.toolLabel,
            status: entry.status,
            summary: entry.summary,
            retrievedAt: entry.retrievedAt.toISOString(),
        };
    }

    /** The "already consulted" block for the system prompt of a follow-up. */
    priorIndex(): string | null {
        const prior = this.entries.filter((e) => e.prior);
        if (prior.length === 0) return null;
        return prior.map((e) => `- [${e.label}] ${e.summary}`).join("\n");
    }
}
