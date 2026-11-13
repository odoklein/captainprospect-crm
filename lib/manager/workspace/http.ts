// Shared fetch helpers for the manager workspace data layer (React Query).
// Every API route answers { success, data, error } (lib/api-utils); these
// unwrap it and throw an Error carrying the French message on failure, so
// queries show it in ErrorState and mutations in a toast.

export class ApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = "ApiError";
    }
}

async function unwrap<T>(res: Response): Promise<T> {
    let json: { success?: boolean; data?: T; error?: string } | null = null;
    try {
        json = await res.json();
    } catch {
        // Non-JSON answer (proxy error page, empty body).
    }
    if (!res.ok || !json?.success) {
        throw new ApiError(json?.error || (res.status === 404 ? "Introuvable" : "Erreur réseau, réessayez."), res.status);
    }
    return json.data as T;
}

export async function apiGet<T>(url: string, init?: RequestInit): Promise<T> {
    return unwrap<T>(await fetch(url, init));
}

export async function apiSend<T>(url: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
    return unwrap<T>(await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    }));
}

export const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404;
