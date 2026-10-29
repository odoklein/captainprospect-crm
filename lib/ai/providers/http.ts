/**
 * HTTP plumbing shared by the wires: one abort signal per call with a
 * time-to-first-byte timer that becomes an idle timer once the stream flows,
 * error mapping from an HTTP response, and a line-based SSE reader.
 */

import { ProviderError } from "./errors";
import type { ProviderId } from "./types";

export function retryAfterMs(response: Response): number | undefined {
    const ms = response.headers.get("retry-after-ms");
    if (ms && Number.isFinite(Number(ms))) return Number(ms);
    const header = response.headers.get("retry-after");
    if (!header) return undefined;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const date = Date.parse(header);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

export async function errorFromResponse(response: Response, provider: ProviderId, label: string): Promise<ProviderError> {
    const errorJson = await response.json().catch(() => ({}));
    const rawMessage =
        (errorJson as { error?: { message?: string; code?: string } })?.error?.message || response.statusText;
    const errCode = (errorJson as { error?: { code?: string } })?.error?.code || `HTTP_${response.status}`;

    if (response.status === 401 || response.status === 403) {
        return new ProviderError("AUTH_ERROR", rawMessage, 401, `Clé API ${label} invalide ou expirée.`, {
            kind: "auth",
            retryable: false,
            provider,
        });
    }
    if (response.status === 429) {
        // "insufficient_quota" is a billing state, not a burst: retrying cannot help.
        return new ProviderError(
            "RATE_LIMITED",
            rawMessage,
            429,
            `Le quota ${label} est dépassé ou la limite de requêtes par minute a été atteinte.`,
            { kind: "rate_limited", retryable: errCode !== "insufficient_quota", retryAfterMs: retryAfterMs(response), provider },
        );
    }
    if (response.status === 408 || response.status === 409 || response.status >= 500) {
        return new ProviderError(
            errCode,
            `${label} API error (${response.status}): ${rawMessage}`,
            response.status,
            "Le service d'intelligence artificielle est momentanément indisponible.",
            { kind: "server", retryable: true, retryAfterMs: retryAfterMs(response), provider },
        );
    }
    return new ProviderError(
        errCode,
        `${label} API error (${response.status}): ${rawMessage}`,
        response.status,
        `Erreur ${label} : ${rawMessage}`,
        { kind: "bad_request", retryable: false, provider },
    );
}

/**
 * One signal for one HTTP call: the caller's (turn cancelled / deadline) plus
 * this call's own timer. `timedOut()` tells the two apart afterwards.
 */
export function callSignal(caller: AbortSignal | undefined, timeoutMs: number | undefined) {
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (ms: number | undefined) => {
        if (timer) clearTimeout(timer);
        if (!ms) return;
        timer = setTimeout(() => {
            timedOut = true;
            controller.abort(new Error("provider timeout"));
        }, ms);
    };
    arm(timeoutMs);
    const onAbort = () => controller.abort(caller?.reason);
    if (caller?.aborted) controller.abort(caller.reason);
    else caller?.addEventListener("abort", onAbort, { once: true });
    return {
        signal: controller.signal,
        timedOut: () => timedOut,
        /** Restart the clock — the idle timeout while a stream flows. */
        rearm: arm,
        dispose: () => {
            if (timer) clearTimeout(timer);
            caller?.removeEventListener("abort", onAbort);
        },
    };
}

export type CallSignal = ReturnType<typeof callSignal>;

export function abortError(timedOut: boolean, caller: AbortSignal | undefined, cause: unknown, provider: ProviderId): ProviderError {
    if (timedOut) {
        return new ProviderError(
            "TIMEOUT",
            "provider request timed out",
            504,
            "Le service d'intelligence artificielle met trop de temps à répondre.",
            { kind: "timeout", retryable: true, cause, provider },
        );
    }
    return new ProviderError("CANCELLED", "Request cancelled", 499, "Requête annulée.", {
        kind: "cancelled",
        retryable: false,
        cause: caller?.reason ?? cause,
        provider,
    });
}

export function networkError(err: unknown, provider: ProviderId): ProviderError {
    return new ProviderError(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : "Network failure calling the AI provider",
        502,
        "Impossible de contacter le service d'intelligence artificielle. Vérifiez la connexion réseau.",
        { kind: "network", retryable: true, cause: err, provider },
    );
}

export function truncatedStreamError(provider: ProviderId): ProviderError {
    return new ProviderError(
        "STREAM_TRUNCATED",
        "Stream ended before its terminal event",
        502,
        "La réponse du service d'intelligence artificielle a été interrompue.",
        { kind: "network", retryable: true, provider },
    );
}

export function emptyResponseError(provider: ProviderId): ProviderError {
    return new ProviderError("EMPTY_RESPONSE", "The provider returned no output", 502, "L'assistant n'a renvoyé aucune réponse.", {
        kind: "empty",
        retryable: true,
        provider,
    });
}

/** Wraps a thrown value from `fetch` or stream reading into a ProviderError. */
export function toProviderError(err: unknown, call: CallSignal, caller: AbortSignal | undefined, provider: ProviderId): ProviderError {
    if (err instanceof ProviderError) return err;
    if (call.signal.aborted) return abortError(call.timedOut(), caller, err, provider);
    return networkError(err, provider);
}

export function jsonHeaders(apiKey: string): Record<string, string> {
    return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` };
}

/**
 * Reads a text/event-stream body line by line and hands every `data:` payload
 * to `onData`, including the literal "[DONE]" sentinel. `event:` lines are
 * ignored: both wires repeat the event type inside the JSON.
 */
export async function readSse(
    body: ReadableStream<Uint8Array>,
    hooks: { onData: (payload: string) => void; onChunk?: () => void },
): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const handle = (line: string) => {
        if (!line.startsWith("data:")) return;
        const payload = line.slice(5).trim();
        if (payload) hooks.onData(payload);
    };
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hooks.onChunk?.();
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).replace(/\r$/, "");
            buffer = buffer.slice(newline + 1);
            handle(line);
        }
    }
    if (buffer.trim()) handle(buffer.trim());
}
