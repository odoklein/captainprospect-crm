// Tiny fetch wrapper: always resolves to `data` or throws an Error carrying the
// API's French message, so every caller can show it as-is.

export class ApiError extends Error {
    status: number;
    payload: unknown;
    constructor(message: string, status: number, payload: unknown) {
        super(message);
        this.status = status;
        this.payload = payload;
    }
}

export async function apiJson<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<{ data: T; meta?: any }> {
    const { json, ...rest } = init ?? {};
    let res: Response;
    try {
        res = await fetch(url, {
            ...rest,
            headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers || {}) } : rest.headers,
            body: json !== undefined ? JSON.stringify(json) : rest.body,
        });
    } catch {
        throw new ApiError("Connexion impossible. Vérifiez votre réseau puis réessayez.", 0, null);
    }
    let payload: any = null;
    try {
        payload = await res.json();
    } catch {
        payload = null;
    }
    if (!res.ok || payload?.success === false) {
        const message = payload?.error || (res.status === 403 ? "Accès refusé" : `Erreur ${res.status}`);
        throw new ApiError(message, res.status, payload);
    }
    return { data: payload?.data as T, meta: payload?.meta };
}

export function errorMessage(error: unknown, fallback = "Une erreur est survenue"): string {
    return error instanceof Error && error.message ? error.message : fallback;
}
