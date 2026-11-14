// ============================================
// NOUVEAUTÉS (pure rules) — what the Console may push, who sees an entry, and
// what a manager can answer to an update offer. No Prisma, no Next: tested by
//     npm run test:changelog
// ============================================

export const ENTRY_KINDS = ["RELEASE", "ANNOUNCEMENT"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const CATEGORIES = ["feature", "maintenance", "info", "billing"] as const;
export type Category = (typeof CATEGORIES)[number];

export const NOTE_TYPES = ["new", "improved", "fixed"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const DECISIONS = ["NOW", "WINDOW", "POSTPONE"] as const;
export type Decision = (typeof DECISIONS)[number];

/** Roles that see an entry whose audience is empty: every staff role, not the client portal. */
export const STAFF_ROLES = ["SDR", "BOOKER", "MANAGER", "DEVELOPER", "BUSINESS_DEVELOPER", "COMMERCIAL"] as const;
const ALL_ROLES = [...STAFF_ROLES, "CLIENT"] as const;

/** Only a MANAGER answers an update offer. */
export const OFFER_ROLE = "MANAGER";

export const POSTPONE_DAYS = 7;

export type ReleaseNote = { type: NoteType; title: string; body?: string; module?: string };

export type ChangelogInput = {
    externalId: string;
    kind: EntryKind;
    category: Category | null;
    severity: "info" | "warning";
    title: string;
    body: string;
    notes: ReleaseNote[];
    version: string | null;
    audience: string[];
    ctaLabel: string | null;
    ctaUrl: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    publishedAt: Date | null;
    /** undefined = leave the stored offer as it is; null = withdraw it. */
    offer?: OfferInput | null;
};

export type OfferInput = {
    tag: string;
    migration: boolean;
    security: boolean;
    deadline: Date | null;
    window: string | null;
};

type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,99}$/;
const TAG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function str(v: unknown): string | null {
    return typeof v === "string" ? v.trim() : null;
}

function optDate(v: unknown, key: string, errors: Record<string, string>): Date | null {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string" && typeof v !== "number") {
        errors[key] = "Date ISO attendue";
        return null;
    }
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
        errors[key] = "Date ISO attendue";
        return null;
    }
    return d;
}

/** A CTA link is a path inside the CRM ("/manager/…") or an https URL. */
export function isSafeCtaUrl(url: string): boolean {
    if (url.startsWith("/") && !url.startsWith("//")) return true;
    try {
        return new URL(url).protocol === "https:";
    } catch {
        return false;
    }
}

/** Validates a PUT /api/instance/changelog body (the Console's shape, lowercase kinds accepted). */
export function validateChangelogInput(raw: unknown): Result<ChangelogInput> {
    const errors: Record<string, string> = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: { body: "Objet attendu" } };
    const b = raw as Record<string, unknown>;

    const externalId = str(b.externalId) ?? "";
    if (!EXTERNAL_ID.test(externalId)) errors.externalId = "Identifiant invalide (lettres, chiffres, : _ . -, 100 max)";

    const kind = (str(b.kind) ?? "").toUpperCase() as EntryKind;
    if (!ENTRY_KINDS.includes(kind)) errors.kind = "release ou announcement";

    const title = str(b.title) ?? "";
    if (!title) errors.title = "Titre requis";
    else if (title.length > 200) errors.title = "200 caractères max";

    const body = str(b.body) ?? "";
    if (body.length > 20_000) errors.body = "20 000 caractères max";

    let category: Category | null = null;
    if (b.category !== undefined && b.category !== null) {
        const c = str(b.category) as Category;
        if (!CATEGORIES.includes(c)) errors.category = CATEGORIES.join(", ");
        else category = c;
    }

    const severity = b.severity === undefined || b.severity === null ? "info" : str(b.severity);
    if (severity !== "info" && severity !== "warning") errors.severity = "info ou warning";

    const notes: ReleaseNote[] = [];
    if (b.notes !== undefined && b.notes !== null) {
        if (!Array.isArray(b.notes) || b.notes.length > 60) errors.notes = "Liste de 60 notes max";
        else
            b.notes.forEach((n, i) => {
                const o = (n ?? {}) as Record<string, unknown>;
                const type = str(o.type) as NoteType;
                const t = str(o.title) ?? "";
                if (!NOTE_TYPES.includes(type) || !t || t.length > 200) {
                    errors[`notes.${i}`] = "type (new, improved, fixed) et titre (200 max) requis";
                    return;
                }
                const note: ReleaseNote = { type, title: t };
                const nb = str(o.body);
                if (nb) note.body = nb.slice(0, 2000);
                const m = str(o.module);
                if (m) note.module = m.slice(0, 60);
                notes.push(note);
            });
    }

    let version: string | null = null;
    if (b.version !== undefined && b.version !== null && b.version !== "") {
        const v = str(b.version) ?? "";
        if (!TAG.test(v)) errors.version = "Tag invalide";
        else version = v;
    }

    const audience: string[] = [];
    if (b.audience !== undefined && b.audience !== null) {
        if (!Array.isArray(b.audience)) errors.audience = "Liste de rôles attendue";
        else
            for (const r of b.audience) {
                const role = (str(r) ?? "").toUpperCase();
                if (!(ALL_ROLES as readonly string[]).includes(role)) {
                    errors.audience = `Rôle inconnu : ${String(r)}`;
                    break;
                }
                if (!audience.includes(role)) audience.push(role);
            }
    }

    const ctaLabel = str(b.ctaLabel) || null;
    const ctaUrl = str(b.ctaUrl) || null;
    if (ctaLabel && ctaLabel.length > 60) errors.ctaLabel = "60 caractères max";
    if (ctaUrl && (ctaUrl.length > 500 || !isSafeCtaUrl(ctaUrl))) errors.ctaUrl = "Chemin /… ou URL https";
    if (!!ctaLabel !== !!ctaUrl) errors.ctaUrl = "Libellé et lien vont ensemble";

    const startsAt = optDate(b.startsAt, "startsAt", errors);
    const endsAt = optDate(b.endsAt, "endsAt", errors);
    const publishedAt = optDate(b.publishedAt, "publishedAt", errors);
    if (startsAt && endsAt && endsAt <= startsAt) errors.endsAt = "Doit suivre startsAt";

    let offer: OfferInput | null | undefined;
    if (b.offer === null) offer = null;
    else if (b.offer !== undefined) {
        const o = (b.offer ?? {}) as Record<string, unknown>;
        const tag = str(o.tag) ?? "";
        if (!TAG.test(tag)) errors["offer.tag"] = "Tag invalide";
        if (kind !== "RELEASE") errors.offer = "Une offre de mise à jour accompagne une release";
        const w = str(o.window) || null;
        if (w && w.length > 60) errors["offer.window"] = "60 caractères max";
        offer = {
            tag,
            migration: o.migration === true,
            security: o.security === true,
            deadline: optDate(o.deadline, "offer.deadline", errors),
            window: w,
        };
    }

    if (Object.keys(errors).length) return { ok: false, errors };
    return {
        ok: true,
        value: {
            externalId,
            kind,
            category,
            severity: severity as "info" | "warning",
            title,
            body,
            notes,
            version,
            audience,
            ctaLabel,
            ctaUrl,
            startsAt,
            endsAt,
            publishedAt,
            ...(offer !== undefined ? { offer } : {}),
        },
    };
}

// ---------- who sees what ----------

export type EntryLike = {
    kind: string;
    audience: string[];
    startsAt: Date | null;
    endsAt: Date | null;
    publishedAt: Date;
};

export function isForRole(entry: Pick<EntryLike, "audience">, role: string): boolean {
    if (entry.audience.length === 0) return (STAFF_ROLES as readonly string[]).includes(role);
    return entry.audience.includes(role);
}

/** Visible now: published, not before startsAt, not after endsAt. */
export function isLive(entry: EntryLike, now: Date): boolean {
    if (entry.publishedAt > now) return false;
    if (entry.startsAt && entry.startsAt > now) return false;
    if (entry.endsAt && entry.endsAt <= now) return false;
    return true;
}

/** Shown as a banner over the app (maintenance or warning announcements, while live). */
export function isBanner(entry: EntryLike & { category: string | null; severity: string }, now: Date): boolean {
    return entry.kind === "ANNOUNCEMENT" && isLive(entry, now) && (entry.category === "maintenance" || entry.severity === "warning");
}

// ---------- update offer ----------

export type OfferRow = {
    offerTag: string | null;
    offerSecurity: boolean;
    offerDeadline: Date | null;
    decision: string | null;
    postponedUntil: Date | null;
};

/** True when the running image already is the offered tag (GIT_SHA "d80a9de…" vs tag "d80a9de"). */
export function isRunning(tag: string, runningVersion: string | null): boolean {
    if (!runningVersion || runningVersion === "dev") return false;
    const a = tag.toLowerCase();
    const b = runningVersion.toLowerCase();
    return a === b || (a.length >= 7 && b.startsWith(a)) || (b.length >= 7 && a.startsWith(b));
}

export type OfferState = "none" | "pending" | "scheduled" | "postponed";

export function offerState(row: OfferRow, runningVersion: string | null, now: Date): OfferState {
    if (!row.offerTag || isRunning(row.offerTag, runningVersion)) return "none";
    if (row.decision === "NOW" || row.decision === "WINDOW") return "scheduled";
    if (row.decision === "POSTPONE" && row.postponedUntil && row.postponedUntil > now) return "postponed";
    return "pending";
}

export type DecisionResult =
    | { ok: true; decision: Decision; postponedUntil: Date | null }
    | { ok: false; error: string };

/** Checks a manager's answer. A security update can't be postponed; a delay never passes the deadline. */
export function resolveDecision(row: OfferRow, raw: unknown, now: Date): DecisionResult {
    const decision = typeof raw === "string" ? (raw.toUpperCase() as Decision) : null;
    if (!decision || !DECISIONS.includes(decision)) return { ok: false, error: "Réponse inconnue" };
    if (!row.offerTag) return { ok: false, error: "Aucune mise à jour proposée" };
    if (decision !== "POSTPONE") return { ok: true, decision, postponedUntil: null };
    if (row.offerSecurity) return { ok: false, error: "Une mise à jour de sécurité ne peut pas être reportée" };
    let until = new Date(now.getTime() + POSTPONE_DAYS * 86_400_000);
    if (row.offerDeadline) {
        if (row.offerDeadline <= now) return { ok: false, error: "La date limite est passée : la mise à jour va être appliquée" };
        if (until > row.offerDeadline) until = row.offerDeadline;
    }
    return { ok: true, decision, postponedUntil: until };
}

/** A new offer (another tag) resets the previous answer; the same tag keeps it. */
export function offerResetsDecision(previousTag: string | null, next: OfferInput | null | undefined): boolean {
    if (next === undefined) return false;
    if (next === null) return true;
    return previousTag !== next.tag;
}
