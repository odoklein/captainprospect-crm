// ============================================
// LEEXI PAYLOADS → CRM SHAPES (pure, no I/O — npm run test:client-onboarding)
//
// Shapes checked against the live public API on 2026-10-26:
//   GET /v1/calls       → { data: RawLeexiCall[], pagination: { page, items, count, pages } }
//   GET /v1/calls/:uuid → { data: RawLeexiCall } (+ simple_transcript, transcript)
// A call has a `uuid` (no `id`), `performed_at` (no `date`), external people in
// `customers`, our own people in `participating_users` / `owner`, the HubSpot
// deal in `deal`, and Leexi's AI outputs in `summary` and `prompts[]`
// (one of them is a custom « salesplaybook » prompt on some calls).
// ============================================

export interface RawLeexiPerson {
    uuid?: string | null;
    name?: string | null;
    email?: string | null;
    phone_number?: string | null;
}

export interface RawLeexiCall {
    uuid?: string | null;
    id?: string | null;
    title?: string | null;
    performed_at?: string | null;
    created_at?: string | null;
    duration?: number | null;
    leexi_url?: string | null;
    summary?: string | null;
    simple_transcript?: string | null;
    conversation_type?: { slug?: string | null } | null;
    deal?: {
        name?: string | null;
        status?: string | null;
        crm?: string | null;
        stage?: { name?: string | null } | null;
    } | null;
    owner?: RawLeexiPerson | null;
    participating_users?: RawLeexiPerson[] | null;
    customers?: RawLeexiPerson[] | null;
    prompts?: Array<{ title?: string | null; category?: string | null; completions?: unknown[] | null }> | null;
    tasks?: Array<{ subject?: string | null; active?: boolean | null }> | null;
}

export interface LeexiPerson {
    name: string;
    email: string | null;
    phone: string | null;
}

export interface LeexiDeal {
    name: string;
    stage: string | null;
    status: string | null;
}

export interface LeexiCallSummary {
    id: string;
    title: string;
    /** performed_at (ISO) */
    date: string | null;
    /** Seconds. */
    duration: number;
    url: string | null;
    /** Leexi conversation type slug (sales_phone, sales_visio_demo, custom…). */
    type: string | null;
    /** Best guess of the prospect's company, for display and matching. */
    companyName: string;
    /** External participants, without our own team and note-taker bots. */
    customers: LeexiPerson[];
    /** Our own people on the call. */
    users: string[];
    deal: LeexiDeal | null;
    hasSummary: boolean;
    hasSalesPlaybook: boolean;
    /** Start of Leexi's summary, markdown headings stripped. */
    preview: string;
    /** Strings a CRM client name can match: deal, company, domains, people, title. */
    matchKeys: string[];
}

export interface LeexiCallDetail extends LeexiCallSummary {
    summary: string;
    salesPlaybook: string;
    followUpTasks: string[];
    transcript: string;
}

export interface NormalizeContext {
    /** Our own email domains (brand email domains + website host). */
    internalDomains: string[];
    /**
     * Our own people (CRM staff). Leexi lists a colleague who joined from a
     * calendar invite as a « customer » without email: only the name gives it away.
     */
    internalNames?: string[];
}

/** "Jean-François  Manière" → "jean francois maniere" */
export function personKey(name: string): string {
    return name
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

// Calendly's note-taker shows up with Cyrillic look-alike letters, hence "calendly".
const BOT_NAME = /note\s*-?\s*taker|calendly|fireflies|otter\.ai|read\.ai|tl;?dv|present to all|meeting bot|\bbot\b|recorder/i;

const GENERIC_DOMAINS = new Set([
    "gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "live.com", "live.fr",
    "msn.com", "yahoo.com", "yahoo.fr", "icloud.com", "me.com", "mac.com", "orange.fr", "wanadoo.fr", "free.fr",
    "sfr.fr", "laposte.net", "neuf.fr", "bbox.fr", "aol.com", "proton.me", "protonmail.com", "gmx.fr", "gmx.com",
]);

function str(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}

export function emailDomain(email: string | null | undefined): string | null {
    const at = str(email).toLowerCase().split("@");
    return at.length === 2 && at[1].includes(".") ? at[1] : null;
}

/** "octofilms.fr" → "Octofilms"; generic mailboxes give nothing. */
export function domainCompany(domain: string | null): string {
    if (!domain || GENERIC_DOMAINS.has(domain)) return "";
    const stem = domain.replace(/^www\./, "").split(".")[0] ?? "";
    return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : "";
}

/** Website guess from the external participants' email domains. */
export function websiteFromCustomers(customers: LeexiPerson[]): string {
    for (const c of customers) {
        const d = emailDomain(c.email);
        if (d && !GENERIC_DOMAINS.has(d)) return `https://www.${d.replace(/^www\./, "")}`;
    }
    return "";
}

/** "Calipso - Michael benhamou" → "Calipso". */
function dealCompany(dealName: string): string {
    return dealName.split(/\s+[-–—|]\s+/)[0]?.trim() ?? "";
}

/** Leexi task subjects come as "🧪 Préparer un test … (short)". */
export function cleanTaskSubject(subject: string): string {
    return subject
        .replace(/^[^\p{L}\p{N}«"(]+/u, "")
        .replace(/\s*\((short|medium|long)\)\s*$/i, "")
        .trim();
}

function promptText(raw: RawLeexiCall, title: string): string {
    const prompt = (raw.prompts ?? []).find((p) => str(p?.title).toLowerCase() === title);
    return (prompt?.completions ?? []).filter((c): c is string => typeof c === "string").join("\n\n").trim();
}

const PREVIEW_CHARS = 600;

/** Leexi summaries open with "# Rapport détaillé…" then "## Mise en contexte": keep the prose. */
export function summaryPreview(summary: string): string {
    const prose = summary
        .split(/\r?\n/)
        .filter((l) => l.trim() && !/^\s*#/.test(l))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    return prose.length > PREVIEW_CHARS ? `${prose.slice(0, PREVIEW_CHARS).trimEnd()}…` : prose;
}

function toPerson(p: RawLeexiPerson | null | undefined): LeexiPerson | null {
    const name = str(p?.name);
    const email = str(p?.email) || null;
    if (!name && !email) return null;
    return { name: name || email || "", email, phone: str(p?.phone_number) || null };
}

export function toLeexiCallSummary(raw: RawLeexiCall, ctx: NormalizeContext): LeexiCallSummary {
    const internal = new Set(ctx.internalDomains.map((d) => d.toLowerCase()));
    const users = [raw.owner, ...(raw.participating_users ?? [])]
        .map((p) => str(p?.name))
        .filter((n, i, all) => n && all.indexOf(n) === i);
    const ourPeople = new Set([...users, ...(ctx.internalNames ?? [])].map(personKey).filter(Boolean));

    const customers = (raw.customers ?? [])
        .map(toPerson)
        .filter((p): p is LeexiPerson => !!p)
        .filter((p) => {
            const d = emailDomain(p.email);
            if (d && internal.has(d)) return false;
            if (ourPeople.has(personKey(p.name))) return false;
            return !BOT_NAME.test(p.name);
        });

    const deal = raw.deal && str(raw.deal.name)
        ? { name: str(raw.deal.name), stage: str(raw.deal.stage?.name) || null, status: str(raw.deal.status) || null }
        : null;

    const domains = customers.map((c) => emailDomain(c.email)).filter((d): d is string => !!d && !GENERIC_DOMAINS.has(d));
    const companyName = (deal && dealCompany(deal.name)) || domainCompany(domains[0] ?? null) || "";
    const title = str(raw.title) || "Appel sans titre";
    const summary = str(raw.summary);

    return {
        id: str(raw.uuid) || str(raw.id),
        title,
        date: str(raw.performed_at) || str(raw.created_at) || null,
        duration: typeof raw.duration === "number" && raw.duration > 0 ? Math.round(raw.duration) : 0,
        url: str(raw.leexi_url) || null,
        type: str(raw.conversation_type?.slug) || null,
        companyName,
        customers,
        users,
        deal,
        hasSummary: summary.length > 0,
        hasSalesPlaybook: promptText(raw, "salesplaybook").length > 0,
        preview: summaryPreview(summary),
        matchKeys: [
            deal ? dealCompany(deal.name) : "",
            companyName,
            ...domains.map((d) => d.split(".")[0]),
            ...customers.map((c) => c.name),
            title,
        ].filter((k, i, all) => k && all.indexOf(k) === i),
    };
}

export function toLeexiCallDetail(raw: RawLeexiCall, ctx: NormalizeContext): LeexiCallDetail {
    return {
        ...toLeexiCallSummary(raw, ctx),
        summary: str(raw.summary),
        salesPlaybook: promptText(raw, "salesplaybook"),
        followUpTasks: (raw.tasks ?? [])
            .filter((t) => t?.active !== false)
            .map((t) => cleanTaskSubject(str(t?.subject)))
            .filter(Boolean),
        transcript: str(raw.simple_transcript),
    };
}

/** Body of a list or detail response: `{ data }` today, a bare array/object tolerated. */
export function unwrapLeexi<T>(body: unknown): T | null {
    if (body && typeof body === "object" && "data" in body) return (body as { data: T }).data ?? null;
    return (body as T) ?? null;
}

function fmtDuration(seconds: number): string {
    const min = Math.round(seconds / 60);
    return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : `${min} min`;
}

const TRANSCRIPT_FALLBACK_CHARS = 60_000;

/**
 * The text the playbook extractor reads for a Leexi call: who was on the call
 * (so the model can tell our people from the client's), the deal, Leexi's own
 * summary and sales playbook, and the follow-up tasks. Falls back to the raw
 * transcript while Leexi has not produced a summary yet.
 */
export function buildOnboardingRecap(call: LeexiCallDetail, agencyName: string): string {
    const lines: string[] = [];
    const date = call.date ? new Date(call.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }) : null;
    lines.push(`Appel enregistré : ${call.title}${date ? ` — ${date}` : ""}${call.duration ? `, ${fmtDuration(call.duration)}` : ""}`);
    if (call.users.length) lines.push(`Équipe ${agencyName} : ${call.users.join(", ")}`);
    if (call.customers.length) {
        lines.push(`Participants côté client : ${call.customers.map((c) => (c.email ? `${c.name} <${c.email}>` : c.name)).join(", ")}`);
    }
    if (call.deal) lines.push(`Deal CRM : ${call.deal.name}${call.deal.stage ? ` (étape : ${call.deal.stage})` : ""}`);

    if (call.summary) lines.push("", "## Résumé de l'appel", call.summary);
    // On « Salesplaybook » calls Leexi's summary is that prompt's output: send it once.
    if (call.salesPlaybook && call.salesPlaybook.trim() !== call.summary.trim()) {
        lines.push("", "## Analyse commerciale de l'appel", call.salesPlaybook);
    }
    if (call.followUpTasks.length) lines.push("", "## Tâches de suivi", ...call.followUpTasks.map((t) => `- ${t}`));
    if (!call.summary && !call.salesPlaybook && call.transcript) {
        lines.push("", "## Transcription", call.transcript.slice(0, TRANSCRIPT_FALLBACK_CHARS));
    }
    return lines.join("\n").trim();
}

/** Accent- and case-insensitive text for search. */
export function searchable(text: string): string {
    return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function callMatchesQuery(call: LeexiCallSummary, query: string): boolean {
    const terms = searchable(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return true;
    const hay = searchable([
        call.title,
        call.companyName,
        call.deal?.name ?? "",
        ...call.customers.flatMap((c) => [c.name, c.email ?? ""]),
        ...call.users,
    ].join(" "));
    return terms.every((t) => hay.includes(t));
}
