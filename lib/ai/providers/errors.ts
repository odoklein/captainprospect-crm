/**
 * One error class for every provider. `kind` and `retryable` are what the
 * retry layer and the user-facing mapping read; `provider` says who failed.
 */

import type { ProviderId } from "./types";

export type ProviderErrorKind =
    | "timeout"
    | "cancelled"
    | "rate_limited"
    | "auth"
    | "bad_request"
    | "server"
    | "network"
    | "empty"
    /** No key, or no model allowed for this data class. */
    | "not_configured";

export class ProviderError extends Error {
    readonly kind: ProviderErrorKind;
    readonly retryable: boolean;
    readonly retryAfterMs?: number;
    readonly provider?: ProviderId;
    /** True once text was streamed to the caller: retrying would duplicate it. */
    partial = false;

    constructor(
        public readonly code: string,
        message: string,
        public readonly status: number = 500,
        public readonly userMessage: string = "Une erreur est survenue lors de l'appel au fournisseur d'IA.",
        options: {
            kind?: ProviderErrorKind;
            retryable?: boolean;
            retryAfterMs?: number;
            cause?: unknown;
            provider?: ProviderId;
        } = {},
    ) {
        super(message);
        this.name = "ProviderError";
        this.kind = options.kind ?? (status >= 500 ? "server" : "bad_request");
        this.retryable =
            options.retryable ?? (this.kind === "server" || this.kind === "network" || this.kind === "rate_limited");
        this.retryAfterMs = options.retryAfterMs;
        this.provider = options.provider;
        if (options.cause !== undefined) this.cause = options.cause;
    }
}

export function isProviderError(error: unknown): error is ProviderError {
    return error instanceof ProviderError;
}
