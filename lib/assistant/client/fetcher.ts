/**
 * Browser side of the Captain AI contract (lib/assistant/api-contract.ts):
 * unwraps the `{ success, data | error }` envelope and throws a typed error
 * carrying the French message and HTTP status, so SWR hooks and mutations
 * all fail the same way.
 */

import type { ApiResponse } from "../api-contract";

export class ApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

async function unwrap<T>(res: Response): Promise<T> {
    let body: ApiResponse<T> | null = null;
    try {
        body = (await res.json()) as ApiResponse<T>;
    } catch {
        body = null;
    }
    if (!res.ok || !body || body.success !== true) {
        const message =
            body && body.success === false && body.error
                ? body.error
                : res.status === 404
                  ? "Introuvable."
                  : "Le serveur n'a pas pu répondre. Réessaie dans un instant.";
        throw new ApiError(message, res.status);
    }
    return body.data;
}

/** SWR fetcher: `useSWR<FolderListResponse>(ASSISTANT_API.folders, apiGet)`. */
export async function apiGet<T>(url: string): Promise<T> {
    return unwrap<T>(await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" }));
}

export async function apiSend<T>(url: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<T> {
    return unwrap<T>(
        await fetch(url, {
            method,
            headers: body === undefined ? { Accept: "application/json" } : { "Content-Type": "application/json", Accept: "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        }),
    );
}

/** Multipart upload (files): the browser sets the boundary. */
export async function apiUpload<T>(url: string, form: FormData): Promise<T> {
    return unwrap<T>(await fetch(url, { method: "POST", body: form }));
}

/** Builds `url?a=1&b=2`, dropping null/undefined/"" values. */
export function withQuery(url: string, query: Record<string, string | number | boolean | null | undefined>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined || value === "") continue;
        params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
}
