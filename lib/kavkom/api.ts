// ============================================
// KAVKOM — PBX REST API client (server-only: the token never reaches a browser).
//
//   Base   https://api.kavkom.com/api/pbx/v1
//   Auth   X-API-TOKEN: <KAVKOM_API_TOKEN>; domain_uuid in the query (GET) or the body (POST)
//
//   POST active_call/call      { src, destination, src_cid_number?, auto_answer? } → { call_uuid }
//                              rings `src` (the SDR's extension) first, then bridges `destination`
//   POST active_call/kill      { call_uuid }
//   GET  extension/list        ?limit&page&with_user=1 → { data: [{ extension_uuid, extension, password, user_context, … }] }
//                              (password + user_context = the SIP login of the in-CRM phone, read for one user only)
//   GET  cdr/list              ?limit&page  filter[start_date|end_date|extension_uuid|number]
//   GET  cdr/get_file_link     ?uuid=<xml_cdr_uuid> → a link to the recording
// Reference: https://api.kavkom.com/docs/ · https://help.kavkom.com/en/api-integration/kavkom-api/
//
// Response shapes are read defensively (the reference shows few of them).
// ============================================

export const KAVKOM_API_BASE = "https://api.kavkom.com";

export class KavkomApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = "KavkomApiError";
    }
}

/** French message an SDR or a manager can act on. */
export function kavkomErrorMessage(e: unknown): string {
    if (e instanceof KavkomApiError) {
        if (e.status === 401 || e.status === 403) return "Kavkom refuse le jeton API. Vérifiez-le dans Paramètres → Téléphonie.";
        if (e.status === 404) return "Kavkom ne trouve pas cette ressource (domaine ou extension inconnus).";
        if (e.status === 422) return `Kavkom a refusé l'appel : ${e.message}`;
        if (e.status === 429) return "Kavkom limite le nombre de requêtes : réessayez dans quelques secondes.";
        if (e.status >= 500) return "Kavkom ne répond pas pour le moment. Réessayez dans un instant.";
        return `Kavkom a refusé la requête (${e.status}) : ${e.message}`;
    }
    if (e instanceof Error && e.name === "TimeoutError") return "Kavkom n'a pas répondu à temps.";
    return "Impossible de joindre Kavkom.";
}

export interface KavkomExtension {
    uuid: string;
    extension: string;
    enabled: boolean;
    callerIdNumber: string | null;
    name: string | null;
    userEmail: string | null;
}

type Rec = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** `data` may be the list, or { data: list }, or { items: list }. */
function listOf(json: unknown): Rec[] {
    const root = json as Rec | null;
    const candidates = [root, root?.data, (root?.data as Rec | undefined)?.data, root?.items, root?.result];
    const list = candidates.find(Array.isArray) as unknown[] | undefined;
    return (list ?? []).filter((x): x is Rec => !!x && typeof x === "object");
}

export function mapExtension(r: Rec): KavkomExtension | null {
    const extension = s(r.extension);
    const uuid = s(r.extension_uuid) ?? s(r.uuid);
    if (!extension || !uuid) return null;
    const user = (r.user && typeof r.user === "object" ? r.user : Array.isArray(r.users) ? r.users[0] : null) as Rec | null;
    const enabled = r.enabled;
    return {
        uuid,
        extension,
        enabled: !(enabled === false || enabled === "false" || enabled === 0 || enabled === "0"),
        callerIdNumber: s(r.outbound_caller_id_number) ?? s(r.effective_caller_id_number),
        name: s(r.effective_caller_id_name) ?? s(r.description) ?? s(user?.username) ?? s(user?.name),
        userEmail: (s(user?.user_email) ?? s(user?.email) ?? s(r.user_email) ?? s(r.email))?.toLowerCase() ?? null,
    };
}

/** The SIP login of one extension: never part of KavkomExtension, so a listing cannot leak it. */
export interface KavkomSipLogin {
    extension: string;
    password: string;
    /** FusionPBX's user_context: the SIP domain the extension registers on. */
    domain: string | null;
}

export function mapSipLogin(r: Rec, extension: string): KavkomSipLogin | null {
    if (s(r.extension) !== extension) return null;
    const password = s(r.password);
    if (!password) return null;
    const domain = s(r.user_context) ?? s(r.domain_name);
    return { extension, password, domain: domain && domain !== "default" ? domain : null };
}

/** The recording link in whatever key get_file_link puts it. */
export function fileLinkOf(json: unknown): string | null {
    const root = json as Rec | null;
    const scopes = [root, root?.data as Rec | undefined].filter((x): x is Rec => !!x && typeof x === "object");
    if (typeof root?.data === "string") scopes.unshift({ link: root.data });
    for (const scope of scopes) {
        for (const k of ["link", "url", "file_link", "fileLink", "download_url", "file"]) {
            const v = s(scope[k]);
            if (v && /^https:\/\//i.test(v)) return v;
        }
    }
    return null;
}

export class KavkomClient {
    constructor(
        private token: string,
        private domainUuid: string,
        private base = KAVKOM_API_BASE,
        private fetchImpl: typeof fetch = fetch,
        private timeoutMs = 10_000,
    ) {}

    private async request<T>(method: "GET" | "POST", path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
        const url = new URL(`/api/pbx/v1/${path}`, this.base);
        const all = { domain_uuid: this.domainUuid, ...params };
        let body: string | undefined;
        if (method === "GET") {
            for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
        } else {
            body = JSON.stringify(Object.fromEntries(Object.entries(all).filter(([, v]) => v !== undefined && v !== "")));
        }
        for (let attempt = 0; ; attempt++) {
            const res = await this.fetchImpl(url, {
                method,
                headers: { "X-API-TOKEN": this.token, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
                body,
                cache: "no-store",
                signal: AbortSignal.timeout(this.timeoutMs),
            });
            const json = (await res.json().catch(() => null)) as Rec | null;
            // GETs are safe to retry; a POST (originate, kill) is never sent twice.
            if (method === "GET" && (res.status === 429 || res.status >= 500) && attempt < 2) {
                await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
                continue;
            }
            if (!res.ok || json?.success === false) {
                const message = s(json?.message) ?? s((json?.errors as Rec | undefined)?.message) ?? res.statusText ?? "Kavkom API error";
                throw new KavkomApiError(res.ok ? 422 : res.status, message);
            }
            return json as T;
        }
    }

    /** Rings the extension, then the destination. Returns Kavkom's call_uuid. */
    async originate(input: { extension: string; destination: string; callerId?: string | null; autoAnswer?: boolean }): Promise<{ callUuid: string | null }> {
        const r = await this.request<Rec>("POST", "active_call/call", {
            src: input.extension,
            destination: input.destination,
            src_cid_number: input.callerId ?? undefined,
            auto_answer: input.autoAnswer ? "true" : undefined,
        });
        const data = (r.data && typeof r.data === "object" ? r.data : {}) as Rec;
        return { callUuid: s(r.call_uuid) ?? s(data.call_uuid) ?? s(r.uuid) ?? null };
    }

    async kill(callUuid: string): Promise<void> {
        await this.request("POST", "active_call/kill", { call_uuid: callUuid });
    }

    async listExtensions(): Promise<KavkomExtension[]> {
        const out: KavkomExtension[] = [];
        for (let page = 1; page <= 20; page++) {
            const r = await this.request<unknown>("GET", "extension/list", { limit: 500, page, with_user: 1 });
            const rows = listOf(r).map(mapExtension).filter((x): x is KavkomExtension => !!x);
            out.push(...rows);
            if (rows.length < 500) break;
        }
        return out;
    }

    /** The SIP login of one extension (in-CRM phone). Null when Kavkom does not return its password. */
    async sipLogin(extension: string): Promise<KavkomSipLogin | null> {
        const r = await this.request<unknown>("GET", "extension/list", { limit: 50, page: 1, "filter[search_query]": extension });
        for (const row of listOf(r)) {
            const login = mapSipLogin(row, extension);
            if (login) return login;
        }
        return null;
    }

    async listCdr(input: { from: string; to: string; page?: number; limit?: number }): Promise<Rec[]> {
        const r = await this.request<unknown>("GET", "cdr/list", {
            limit: input.limit ?? 100,
            page: input.page ?? 1,
            "filter[start_date]": input.from,
            "filter[end_date]": input.to,
        });
        return listOf(r);
    }

    async recordingLink(cdrUuid: string): Promise<string | null> {
        return fileLinkOf(await this.request<unknown>("GET", "cdr/get_file_link", { uuid: cdrUuid }));
    }
}
