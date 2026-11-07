/**
 * One non-streaming OpenAI Responses call with a file input (PDF OCR).
 *
 * The chat wires carry text messages only; a document goes in as an
 * `input_file` part (base64 data URL + filename) next to an `input_text`
 * prompt, which vision-capable models read page by page (text layer plus page
 * images). `store: false`, no tools, no stream: one JSON answer whose
 * `output[].content[].output_text` parts are concatenated.
 *
 * Residency and keys are checked by the caller (index.ts providerFileCallFn),
 * like every other wire.
 */

import { ProviderError } from "./errors";
import { callSignal, errorFromResponse, jsonHeaders, toProviderError, emptyResponseError } from "./http";
import { endpointModelId, type ModelSpec } from "./catalog";
import { parseResponsesUsage } from "./openai-responses";
import type { Usage } from "./types";

const PROVIDER = "openai" as const;

export interface FileInputCallRequest {
    /** Catalog id; must be served by OpenAI. */
    model: string;
    /** The instruction that goes with the file. */
    prompt: string;
    file: { filename: string; mimeType: string; data: Uint8Array };
    maxOutputTokens: number;
    /** Whole-call budget (non-streaming: headers and body). */
    timeoutMs: number;
    signal?: AbortSignal;
    temperature?: number;
}

export interface FileInputCallResponse {
    text: string;
    usage: Usage | null;
    model: string;
    /** The answer stopped early (max_output_tokens or content filter). */
    incomplete: string | null;
}

/** Base64 data URL of the file, as `input_file.file_data` expects it. */
export function fileDataUrl(mimeType: string, data: Uint8Array): string {
    return `data:${mimeType};base64,${Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64")}`;
}

export function buildFileInputBody(
    request: FileInputCallRequest,
    spec: ModelSpec,
    env: Record<string, string | undefined> = process.env,
): Record<string, unknown> {
    const body: Record<string, unknown> = {
        model: endpointModelId(spec, env),
        store: false,
        stream: false,
        max_output_tokens: Math.min(request.maxOutputTokens, spec.maxOutput),
        input: [
            {
                role: "user",
                content: [
                    { type: "input_file", filename: request.file.filename, file_data: fileDataUrl(request.file.mimeType, request.file.data) },
                    { type: "input_text", text: request.prompt },
                ],
            },
        ],
    };
    // A reasoning model keeps its default effort: accepted values differ per generation.
    if (spec.temperature === "always" && request.temperature !== undefined) body.temperature = request.temperature;
    return body;
}

interface RawResponse {
    model?: string;
    status?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    output_text?: string;
    usage?: Parameters<typeof parseResponsesUsage>[0];
    incomplete_details?: { reason?: string } | null;
    error?: { code?: string; message?: string } | null;
}

/** The text parts of a Responses JSON body. Exported for tests. */
export function parseFileInputResponse(raw: RawResponse, fallbackModel: string): FileInputCallResponse {
    if (raw.status === "failed" || raw.error) {
        throw new ProviderError(raw.error?.code ?? "RESPONSE_FAILED", raw.error?.message ?? "response failed", 502,
            "Le service d'intelligence artificielle n'a pas pu lire le document.", { kind: "server", retryable: true, provider: PROVIDER });
    }
    const parts: string[] = [];
    for (const item of raw.output ?? []) {
        if (item.type !== "message") continue;
        for (const c of item.content ?? []) if (c.type === "output_text" && typeof c.text === "string") parts.push(c.text);
    }
    const text = parts.length > 0 ? parts.join("") : typeof raw.output_text === "string" ? raw.output_text : "";
    return {
        text,
        usage: parseResponsesUsage(raw.usage),
        model: raw.model ?? fallbackModel,
        incomplete: raw.status === "incomplete" ? raw.incomplete_details?.reason ?? "incomplete" : null,
    };
}

export type FileInputFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<Response>;

/** One call against `${baseUrl}/responses`. `fetchImpl` is the test seam. */
export async function callResponsesWithFile(
    request: FileInputCallRequest,
    options: { baseUrl: string; apiKey: string; spec: ModelSpec; env?: Record<string, string | undefined>; fetchImpl?: FileInputFetch },
): Promise<FileInputCallResponse> {
    const doFetch: FileInputFetch = options.fetchImpl ?? ((url, init) => fetch(url, init));
    const call = callSignal(request.signal, request.timeoutMs);
    try {
        const response = await doFetch(`${options.baseUrl}/responses`, {
            method: "POST",
            headers: jsonHeaders(options.apiKey),
            body: JSON.stringify(buildFileInputBody(request, options.spec, options.env)),
            signal: call.signal,
        });
        if (!response.ok) throw await errorFromResponse(response, PROVIDER, "OpenAI");
        const parsed = parseFileInputResponse((await response.json()) as RawResponse, request.model);
        if (!parsed.text.trim() && !parsed.incomplete) throw emptyResponseError(PROVIDER);
        return parsed;
    } catch (err) {
        throw toProviderError(err, call, request.signal, PROVIDER);
    } finally {
        call.dispose();
    }
}
