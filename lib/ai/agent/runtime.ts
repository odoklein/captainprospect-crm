/**
 * One turn of the Assistant Projet: model ↔ tools loop, evidence, verification.
 *
 * What it adds to the original loop, without changing who may do what:
 *  - a turn deadline and client cancellation, propagated to the provider call
 *    and checked between tool calls;
 *  - bounded retries on transient provider errors, then an optional fallback
 *    model — never after text was streamed, never on a 4xx;
 *  - streaming events (text, tool progress, phases) through `onEvent`;
 *  - an evidence record for every read, persisted before the model sees it;
 *  - confirmation cards built from validated, authorised arguments only;
 *  - deterministic verification of the answer, one repair, then explicit
 *    "non vérifié" marks for whatever still fails.
 *
 * The registry, guard, zod schemas and risk tiers are unchanged and still the
 * only path to data.
 */

import { randomUUID } from "node:crypto";
import { ProviderError } from "@/lib/ai/providers/errors";
import { providerChatFn } from "@/lib/ai/providers";
import { resolveModel } from "@/lib/ai/providers/catalog";
import {
    EMPTY_USAGE,
    addUsage,
    type ChatCallRequest,
    type ChatCallResponse,
    type ChatMessage,
    type ToolSpec,
    type Usage,
} from "@/lib/ai/providers/types";
import type { AiUsageEntry } from "@/lib/ai/ledger";
import { calculateTokenCost } from "@/lib/ai/usage";
import { authorizeToolCall } from "@/lib/ai/tools/guard";
import { getTool, toProviderTools } from "@/lib/ai/tools/registry";
import { executeToolCall, serializeToolResult } from "@/lib/ai/tools/executor";
import {
    ToolAuthorizationError,
    ToolNotFoundError,
    ToolValidationError,
    type AssistantContext,
    type PendingActionCard,
} from "@/lib/ai/tools/types";
import { checkVisualNumbers } from "@/lib/assistant/visuals/check";
import type { VisualSpec } from "@/lib/assistant/visuals/spec";
import type { AssistantModelConfig, TurnPlan } from "./models";
import { withRetry } from "./retry";
import { EvidenceSession } from "./evidence/session";
import type { EvidenceStore } from "./evidence/store";
import { verifyAnswer, unverifiedClaims as toUnverifiedClaims, type VerificationResult } from "./verify/verifier";
import { annotateAnswer, buildRepairPrompt, stripInvalidCitations } from "./verify/annotate";
import type {
    AssistantErrorPayload,
    CitationRef,
    PendingActionPayload,
    StreamEvent,
    TraceStep,
    TurnStatus,
    TurnUsage,
    StoredVisual,
    UnverifiedClaim,
    VerificationReport,
} from "./protocol";

/** A repair is only attempted with at least this much of the deadline left. */
const REPAIR_MIN_REMAINING_MS = 8_000;

/** More than this many visuals in one answer is a dashboard, not an answer. */
const MAX_VISUALS = 6;

export interface ChatTurn {
    role: "user" | "assistant";
    content: string;
}

/** One provider call, in the neutral shape (see lib/ai/providers/types). */
export type ChatRequest = ChatCallRequest;
export type ChatResponse = ChatCallResponse;
export type ChatFn = (request: ChatRequest) => Promise<ChatResponse>;

/**
 * The production chat function: routes each model to its provider with the
 * agency's keys, and refuses an endpoint that may not see CRM data.
 * `apiKey` overrides the stored OpenAI key (scripts, evals).
 */
export function providerChat(options: { apiKey?: string } = {}): ChatFn {
    return providerChatFn({ dataClass: "raw_crm", apiKey: options.apiKey });
}

/** @deprecated use providerChat({ apiKey }). Kept for the legacy loop and scripts. */
export function openAIChatFn(apiKey?: string): ChatFn {
    return providerChat(apiKey ? { apiKey } : {});
}

export interface RuntimeDeps {
    chat: ChatFn;
    /** Null = no ledger (tables missing): evidence stays in memory for this turn. */
    store: EvidenceStore | null;
    /** Receives one entry per model call (lib/ai/ledger recordAiUsage in production). */
    ledger?: (entry: AiUsageEntry) => void;
    /** Ledger surface name; "assistant.chat" by default. */
    surface?: string;
    now?: () => Date;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface AgentTurnInput {
    systemPrompt: string;
    /** Prior turns plus the new user message last. */
    history: ChatTurn[];
    ctx: AssistantContext;
    config: AssistantModelConfig;
    /** Depth, model, fallback, deadline and budgets for this turn (see planTurn). */
    plan: TurnPlan;
    /** Client cancellation (request aborted, stream cancelled). */
    signal?: AbortSignal;
    runId?: string;
    onEvent?: (event: StreamEvent) => void;
    /** Names the answer may use without a source (user, client, mission, brand). */
    knownNames?: string[];
}

export interface ProposedAction {
    tool: string;
    args: Record<string, unknown>;
    card: PendingActionCard;
}

export interface AgentTurnResult {
    runId: string;
    status: TurnStatus;
    answer: string;
    proposedAction: PendingActionPayload | null;
    trace: TraceStep[];
    citations: CitationRef[];
    unverifiedClaims: UnverifiedClaim[];
    verification: VerificationReport;
    visuals: StoredVisual[];
    model: string;
    fallbackUsed: boolean;
    usage: TurnUsage;
    iterations: number;
    retries: number;
    toolCalls: number;
    latencyMs: number;
    firstTokenMs: number | null;
    error: AssistantErrorPayload | null;
    evidencePersisted: boolean;
}

/** Why the turn's signal fired. */
export class TurnAbort extends Error {
    constructor(readonly reason: "deadline" | "client") {
        super(reason === "deadline" ? "turn deadline exceeded" : "cancelled by client");
        this.name = "TurnAbort";
    }
}

const NO_VERIFICATION: VerificationReport = { checked: 0, verified: 0, failed: 0, repaired: false, skipped: true };

function parseArgs(raw: string): unknown {
    try {
        return JSON.parse(raw || "{}");
    } catch {
        return {};
    }
}

/** Keeps the stored arguments small: ids and filters, never a pasted essay. */
function compactArgs(raw: string): Record<string, unknown> {
    const parsed = parseArgs(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (value === undefined || value === null || value === "") continue;
        out[key] = typeof value === "string" && value.length > 120 ? `${value.slice(0, 117)}…` : value;
    }
    return out;
}

/** Domain errors thrown on purpose carry a French message worth showing; anything else does not. */
function describeErrorMessage(error: unknown): string {
    if (error instanceof Error && (error.name === "Error" || error.name === "NotFoundError" || error.name === "ValidationError")) {
        return error.message;
    }
    return "données introuvables";
}

export function toAssistantError(error: unknown): AssistantErrorPayload {
    if (error instanceof TurnAbort) {
        return error.reason === "deadline"
            ? { code: "timeout", message: "La réponse a pris trop de temps et a été interrompue. Réessaie, éventuellement avec une question plus ciblée.", retryable: true }
            : { code: "cancelled", message: "Réponse interrompue.", retryable: true };
    }
    if (error instanceof ProviderError) {
        switch (error.kind) {
            case "rate_limited":
                return { code: "rate_limited", message: error.userMessage, retryable: error.retryable };
            case "auth":
                return { code: "provider_auth", message: "L'assistant est mal configuré (clé du fournisseur refusée).", retryable: false };
            case "not_configured":
                return { code: "not_configured", message: error.userMessage, retryable: false };
            case "bad_request":
                return { code: "internal", message: "Le fournisseur d'IA a refusé la requête.", retryable: false };
            default:
                return { code: "provider_unavailable", message: error.userMessage, retryable: true };
        }
    }
    return { code: "internal", message: "L'assistant n'a pas pu répondre.", retryable: false };
}

export async function runAgentTurn(input: AgentTurnInput, deps: RuntimeDeps): Promise<AgentTurnResult> {
    const now = deps.now ?? (() => new Date());
    const { ctx, config, plan } = input;
    const runId = input.runId ?? randomUUID();
    const startedAt = Date.now();
    const deadlineAt = startedAt + plan.deadlineMs;
    const emit = (event: StreamEvent) => {
        try {
            input.onEvent?.(event);
        } catch {
            // A closed stream must not break the turn: it still has to be saved.
        }
    };

    // -- cancellation ---------------------------------------------------------
    const turn = new AbortController();
    const deadlineTimer = setTimeout(() => turn.abort(new TurnAbort("deadline")), plan.deadlineMs);
    const onClientAbort = () => turn.abort(new TurnAbort("client"));
    if (input.signal?.aborted) turn.abort(new TurnAbort("client"));
    else input.signal?.addEventListener("abort", onClientAbort, { once: true });
    const checkAbort = () => {
        if (turn.signal.aborted) throw turn.signal.reason instanceof TurnAbort ? turn.signal.reason : new TurnAbort("client");
    };

    // -- accounting -----------------------------------------------------------
    let usage: Usage = EMPTY_USAGE;
    let costEur = 0;
    let modelCalls = 0;
    let provider = resolveModel(plan.model).provider;
    let model = plan.model;
    let fallbackUsed = false;
    let retries = 0;
    let iterations = 0;
    let toolCalls = 0;
    let firstTokenMs: number | null = null;
    let draft = "";
    const trace: TraceStep[] = [];
    const visuals: StoredVisual[] = [];

    const session = new EvidenceSession({
        store: deps.store,
        runId,
        ctx,
        now,
        storeUsable: !!deps.store,
        toolLabel: (name) => getTool(name)?.label ?? name,
    });

    /** One provider call: retries, then the fallback model, all inside the deadline. */
    const callModel = async (messages: ChatMessage[], tools: ToolSpec[] | undefined): Promise<ChatResponse> => {
        const models = [plan.model, ...(plan.fallback ? [plan.fallback] : [])];
        let lastError: unknown;
        for (let i = 0; i < models.length; i++) {
            const candidate = models[i];
            let wroteText = false;
            let callStartedAt = Date.now();
            try {
                const response = await withRetry(
                    () => {
                        checkAbort();
                        draft = "";
                        callStartedAt = Date.now();
                        return deps.chat({
                            messages,
                            tools,
                            model: candidate,
                            temperature: config.temperature,
                            maxOutputTokens: plan.maxTokens,
                            // The fallback is a classic model: the effort only matters to the planned one.
                            reasoningEffort: candidate === plan.model ? plan.reasoningEffort : "none",
                            cacheKey: ctx.conversationId ?? runId,
                            signal: turn.signal,
                            timeoutMs: Math.min(plan.providerTimeoutMs, Math.max(1, deadlineAt - Date.now())),
                            idleTimeoutMs: plan.idleTimeoutMs,
                            onReasoningDelta: (text) => emit({ type: "reasoning", text }),
                            onTextDelta: (text) => {
                                if (!wroteText) emit({ type: "phase", phase: "writing" });
                                wroteText = true;
                                if (firstTokenMs === null) firstTokenMs = Date.now() - startedAt;
                                draft += text;
                                emit({ type: "delta", text });
                            },
                        });
                    },
                    {
                        maxRetries: config.maxRetries,
                        deadlineAt,
                        signal: turn.signal,
                        isRetryable: (e) => e instanceof ProviderError && e.retryable && !e.partial && !turn.signal.aborted,
                        retryAfterMs: (e) => (e instanceof ProviderError ? e.retryAfterMs : undefined),
                        sleep: deps.sleep,
                        onRetry: ({ attempt, delayMs }) => {
                            retries += 1;
                            emit({ type: "retry", attempt, delayMs });
                        },
                    },
                );
                model = response.model || candidate;
                provider = response.provider;
                modelCalls += 1;
                const callUsage = response.usage ?? EMPTY_USAGE;
                usage = addUsage(usage, callUsage);
                costEur += calculateTokenCost(callUsage, model).costEur;
                deps.ledger?.({
                    surface: deps.surface ?? "assistant.chat",
                    model,
                    usage: callUsage,
                    latencyMs: Date.now() - callStartedAt,
                    tier: plan.depth,
                    dataClass: "raw_crm",
                    userId: ctx.userId,
                    clientId: ctx.project?.clientId ?? null,
                    missionId: ctx.project?.missionId ?? null,
                    conversationId: ctx.conversationId ?? null,
                    runId,
                });
                return response;
            } catch (error) {
                lastError = error;
                checkAbort();
                const canFallback =
                    i < models.length - 1 &&
                    error instanceof ProviderError &&
                    !error.partial &&
                    (error.retryable || error.status === 404);
                if (!canFallback) throw error;
                fallbackUsed = true;
                if (wroteText) emit({ type: "reset" });
            }
        }
        throw lastError;
    };

    /**
     * A visual the model drew: its figures are checked against this turn's
     * sources, it is kept for the message and sent to the browser, and the model
     * is told its number (for the `[[visuel N]]` marker) and any figure to fix.
     */
    const registerVisual = (data: unknown): string => {
        const { visual, from } = data as { visual: VisualSpec; from: string | null };
        const same = visuals.findIndex((v) => v.spec.kind === visual.kind && v.spec.title === visual.title);
        if (same < 0 && visuals.length >= MAX_VISUALS) {
            return JSON.stringify({ error: { code: "too_many_visuals", message: `${MAX_VISUALS} visuels au maximum par réponse.` } });
        }
        const check = checkVisualNumbers(visual, session.entries.filter((e) => e.status === "OK"));
        const entry = from ? session.resolve(from) : undefined;
        const stored: StoredVisual = {
            id: same >= 0 ? visuals[same].id : `v${visuals.length + 1}`,
            spec: visual,
            ...(check.unverified.length > 0 ? { unverified: check.unverified } : {}),
            source: entry?.args ? { tool: entry.tool, args: entry.args, label: entry.toolLabel } : null,
            question: (input.history[input.history.length - 1]?.content ?? "").slice(0, 300),
        };
        if (same >= 0) visuals[same] = stored;
        else visuals.push(stored);
        emit({ type: "visual", visual: stored });
        const number = (same >= 0 ? same : visuals.length - 1) + 1;
        return JSON.stringify({
            affiche: true,
            numero: number,
            marqueur: `[[visuel ${number}]]`,
            ...(check.unverified.length > 0
                ? {
                      avertissement: `Ces valeurs ne se retrouvent pas dans les sources consultées : ${check.unverified.slice(0, 8).join(", ")}. Rappelle show_visual avec les bons chiffres (même kind et même title : il remplace le visuel), ou retire-les.`,
                  }
                : {}),
        });
    };

    const finish = (partial: Omit<AgentTurnResult, "runId" | "trace" | "visuals" | "model" | "fallbackUsed" | "usage" | "iterations" | "retries" | "toolCalls" | "latencyMs" | "firstTokenMs" | "evidencePersisted">): AgentTurnResult => ({
        runId,
        trace,
        visuals,
        model,
        fallbackUsed,
        usage: {
            promptTokens: usage.inputTokens,
            completionTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            cachedInputTokens: usage.cachedInputTokens,
            reasoningTokens: usage.reasoningTokens,
            costEur: Math.round(costEur * 1_000_000) / 1_000_000,
            model,
            provider,
            calls: modelCalls,
        },
        iterations,
        retries,
        toolCalls,
        latencyMs: Date.now() - startedAt,
        firstTokenMs,
        evidencePersisted: session.persistenceAvailable,
        ...partial,
    });

    const citationsFor = (text: string, verification: VerificationResult | null): CitationRef[] => {
        const labels = new Set<string>(verification?.citedLabels ?? []);
        for (const n of verification?.numbers ?? []) if (n.status === "verified" && n.evidence) labels.add(n.evidence);
        for (const m of text.matchAll(/\[(E\d{1,3})\]/g)) labels.add(m[1]);
        return [...labels]
            .map((label) => session.resolve(label))
            .filter((e): e is NonNullable<typeof e> => !!e)
            .map((e) => session.citation(e));
    };

    const verify = (text: string) =>
        verifyAnswer(text, session.entries, { question: input.history[input.history.length - 1]?.content ?? "", now: now(), knownNames: input.knownNames ?? [] });

    try {
        emit({ type: "start", runId, model: plan.model });
        await session.loadPrior();
        checkAbort();

        const priorIndex = session.priorIndex();
        const messages: ChatMessage[] = [
            {
                role: "system",
                content: priorIndex
                    ? `${input.systemPrompt}\n\n## Sources déjà consultées dans cette conversation (encore fraîches)\n${priorIndex}\nTu peux les citer avec leur étiquette. Pour en relire le détail, rappelle le même outil avec les mêmes arguments : le résultat sera réutilisé sans nouvelle requête.`
                    : input.systemPrompt,
            },
            ...input.history.map((m) => ({ role: m.role, content: m.content })),
        ];

        let toolBudget = plan.toolCalls;
        const tools = toProviderTools(ctx);

        for (let iteration = 1; iteration <= plan.iterations; iteration++) {
            iterations = iteration;
            checkAbort();
            emit({ type: "phase", phase: "thinking" });
            // Once the budget is spent — or on the last round — the tools are
            // withdrawn, so the turn ends on an answer, not an unanswered call.
            const result = await callModel(messages, toolBudget > 0 && iteration < plan.iterations ? tools : undefined);
            const calls = result.toolCalls;

            if (calls.length === 0) {
                return finish(await finalizeAnswer((result.text ?? "").trim(), messages));
            }
            // Text streamed before tool calls is preamble, not the answer.
            if (draft) emit({ type: "reset" });

            // -- confirm tools: validated and authorised before any card ------
            const confirmCalls = calls.filter((c) => getTool(c.name)?.risk === "confirm");
            const rejected = new Map<string, string>();
            for (const call of confirmCalls) {
                const tool = getTool(call.name)!;
                let args: Record<string, unknown>;
                try {
                    args = authorizeToolCall(tool, tool.name, parseArgs(call.arguments), ctx) as Record<string, unknown>;
                } catch (error) {
                    if (error instanceof ToolValidationError || error instanceof ToolAuthorizationError || error instanceof ToolNotFoundError) {
                        rejected.set(call.id, JSON.stringify({ tool: tool.name, error: { code: error.code, message: error.message } }));
                        continue;
                    }
                    throw error;
                }

                let card: PendingActionCard;
                try {
                    card = tool.describe
                        ? await tool.describe(args, ctx)
                        : { title: tool.label, details: [], warning: null, confirmLabel: "Confirmer", danger: false };
                } catch (error) {
                    const lead = (result.text ?? "").trim();
                    const answer = `${lead ? `${lead}\n\n` : ""}Je n'ai pas pu préparer cette action : ${describeErrorMessage(error)}`;
                    // A refusal from the domain ("aucun destinataire prêt") is an answer, not a crash.
                    return finish({
                        status: "complete",
                        answer,
                        proposedAction: null,
                        citations: [],
                        unverifiedClaims: [],
                        verification: NO_VERIFICATION,
                        error: null,
                    });
                }

                const lead = (result.text ?? "").trim();
                const verification = lead ? verify(lead) : null;
                const answer = verification && verification.failed > 0 ? annotateAnswer(lead, verification) : lead;
                return finish({
                    status: "action_proposed",
                    answer,
                    proposedAction: { tool: tool.name, args, card, state: "pending", proposedAt: now().toISOString() },
                    citations: citationsFor(answer, verification),
                    unverifiedClaims: verification ? toUnverifiedClaims(verification) : [],
                    verification: verification
                        ? { checked: verification.checked, verified: verification.verified, failed: verification.failed, repaired: false, skipped: verification.checked === 0 }
                        : NO_VERIFICATION,
                    error: null,
                });
            }

            messages.push({
                role: "assistant",
                content: result.text,
                toolCalls: calls,
                ...(result.providerItems ? { providerItems: result.providerItems } : {}),
            });
            emit({ type: "phase", phase: "tools" });

            for (const call of calls) {
                const refused = rejected.get(call.id);
                if (refused) {
                    messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: refused });
                    continue;
                }
                if (turn.signal.aborted || toolBudget <= 0) {
                    messages.push({
                        role: "tool",
                        toolCallId: call.id,
                        name: call.name,
                        content: JSON.stringify({ error: { code: "tool_budget_exhausted", message: "Budget d'outils épuisé pour cette demande." } }),
                    });
                    continue;
                }
                toolBudget -= 1;
                toolCalls += 1;

                const label = getTool(call.name)?.label ?? call.name;
                emit({ type: "tool_start", id: call.id, tool: call.name, label });
                const execution = await executeToolCall(
                    { id: call.id, name: call.name, arguments: call.arguments },
                    ctx,
                    { evidence: session },
                );
                const step: TraceStep = {
                    tool: execution.tool,
                    label: execution.label,
                    ok: execution.ok,
                    durationMs: execution.durationMs,
                    ...(execution.error ? { errorCode: execution.error.code } : {}),
                    ...(execution.cached ? { cached: true } : {}),
                    ...(execution.evidence ? { evidence: execution.evidence } : {}),
                };
                trace.push({ ...step, args: compactArgs(call.arguments) });
                emit({ type: "tool_end", id: call.id, ...step });
                messages.push({
                    role: "tool",
                    toolCallId: call.id,
                    name: call.name,
                    content: execution.ok && execution.tool === "show_visual" ? registerVisual(execution.data) : serializeToolResult(execution),
                });
            }
            checkAbort();
        }

        return finish({
            status: "partial",
            answer: "Je n'ai pas réussi à aboutir après plusieurs recherches. Reformule en précisant ce que tu cherches.",
            proposedAction: null,
            citations: [],
            unverifiedClaims: [],
            verification: NO_VERIFICATION,
            error: null,
        });
    } catch (error) {
        const payload = toAssistantError(error);
        if (!(error instanceof TurnAbort) && !(error instanceof ProviderError)) {
            console.error("[assistant.runtime] turn failed", error);
        }
        const status: TurnStatus =
            error instanceof TurnAbort ? (error.reason === "deadline" ? "timeout" : "cancelled") : "failed";
        const partialText = draft.trim();
        return finish({
            status,
            // Text already on screen is kept, but never presented as a finished answer.
            answer: partialText ? `${partialText}\n\n*(${payload.message})*` : payload.message,
            proposedAction: null,
            citations: [],
            unverifiedClaims: partialText ? [{ kind: "number", text: "réponse incomplète", reason: "réponse interrompue avant vérification" }] : [],
            verification: NO_VERIFICATION,
            error: payload,
        });
    } finally {
        clearTimeout(deadlineTimer);
        input.signal?.removeEventListener("abort", onClientAbort);
    }

    async function finalizeAnswer(
        text: string,
        messages: ChatMessage[],
    ): Promise<Omit<AgentTurnResult, "runId" | "trace" | "visuals" | "model" | "fallbackUsed" | "usage" | "iterations" | "retries" | "toolCalls" | "latencyMs" | "firstTokenMs" | "evidencePersisted">> {
        const answerText = text || "Je n'ai pas de réponse à donner.";
        emit({ type: "phase", phase: "verifying" });
        let current = answerText;
        let result = verify(current);
        let repaired = false;

        if (result.failed > 0 && deadlineAt - Date.now() > REPAIR_MIN_REMAINING_MS) {
            emit({ type: "phase", phase: "repairing" });
            emit({ type: "reset" });
            try {
                const repair = await callModel(
                    [...messages, { role: "assistant", content: current }, { role: "user", content: buildRepairPrompt(result, session.entries) }],
                    undefined,
                );
                const candidate = (repair.text ?? "").trim();
                if (candidate) {
                    const second = verify(candidate);
                    repaired = true;
                    // Keep whichever version has fewer unsupported claims.
                    if (second.failed <= result.failed) {
                        current = candidate;
                        result = second;
                    }
                }
            } catch (error) {
                if (error instanceof TurnAbort) throw error;
                // The repair is best-effort: the original draft is annotated instead.
            }
        }

        const answer = result.failed > 0 ? annotateAnswer(current, result) : stripInvalidCitations(current, result);
        return {
            status: result.failed > 0 ? "partial" : "complete",
            answer,
            proposedAction: null,
            citations: citationsFor(answer, result),
            unverifiedClaims: toUnverifiedClaims(result),
            verification: {
                checked: result.checked,
                verified: result.verified,
                failed: result.failed,
                repaired,
                skipped: result.checked === 0,
            },
            error: null,
        };
    }
}
