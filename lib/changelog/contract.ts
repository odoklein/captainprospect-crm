// ============================================
// « NOUVEAUTÉS » — what the Console may send (PUT /api/instance/changelog) and
// who may read it. Pure: no Prisma, shared by the routes, the UI and the tests.
// Contract: docs/CONSOLE_CHANGELOG.md.
// ============================================

import { z } from "zod";

export const NOTE_TYPES = ["new", "improved", "fixed"] as const;
export const CATEGORIES = ["feature", "maintenance", "info", "billing"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];
export type ChangelogCategory = (typeof CATEGORIES)[number];
export type ChangelogAudience = "managers" | "everyone";

export const NOTE_TYPE_LABELS: Record<NoteType, string> = { new: "Nouveau", improved: "Amélioré", fixed: "Corrigé" };
export const CATEGORY_LABELS: Record<ChangelogCategory, string> = {
    feature: "Nouveauté",
    maintenance: "Maintenance",
    info: "Information",
    billing: "Facturation",
};

export const EXTERNAL_ID = /^[A-Za-z0-9_.:-]{1,100}$/;

/** A link the panel may open: an https URL, or a path inside the CRM (never javascript:, never http:). */
const ctaUrl = z
    .string()
    .trim()
    .max(500)
    .refine((u) => u.startsWith("/") ? !u.startsWith("//") : /^https:\/\/[^\s]+$/.test(u), "https:// ou chemin interne");

const note = z.object({
    type: z.enum(NOTE_TYPES),
    title: z.string().trim().min(1).max(140),
    body: z.string().trim().max(1000).optional().nullable(),
    module: z.string().trim().max(60).optional().nullable(),
});

const isoDate = z.string().datetime({ offset: true }).transform((s) => new Date(s));

export const changelogPayloadSchema = z
    .object({
        externalId: z.string().regex(EXTERNAL_ID),
        kind: z.enum(["release", "announcement"]),
        title: z.string().trim().min(1).max(140),
        summary: z.string().trim().max(4000).optional().nullable(),
        version: z.string().trim().max(64).optional().nullable(),
        items: z.array(note).max(80).optional().nullable(),
        category: z.enum(CATEGORIES).optional().nullable(),
        severity: z.enum(["info", "warning"]).default("info"),
        audience: z.enum(["managers", "everyone"]).default("managers"),
        cta: z.object({ label: z.string().trim().min(1).max(40), url: ctaUrl }).optional().nullable(),
        startsAt: isoDate.optional().nullable(),
        endsAt: isoDate.optional().nullable(),
        publishedAt: isoDate,
    })
    .refine((p) => !(p.startsAt && p.endsAt) || p.endsAt > p.startsAt, { message: "endsAt doit suivre startsAt", path: ["endsAt"] })
    .refine((p) => p.kind === "announcement" || (p.items?.length ?? 0) > 0 || !!p.summary, { message: "une version a des notes ou un résumé", path: ["items"] });

export type ChangelogPayload = z.infer<typeof changelogPayloadSchema>;

/** Roles that never see Nouveautés: they are the agency's clients, not its team. */
const OUTSIDE_ROLES = new Set(["CLIENT", "COMMERCIAL"]);

export function audienceIncludes(audience: string, role: string | null | undefined): boolean {
    if (!role || OUTSIDE_ROLES.has(role)) return false;
    return audience === "everyone" || role === "MANAGER";
}

/**
 * On screen right now. Two meanings of startsAt:
 *   start + end  → a window (maintenance): shown ahead of time, so people can plan; gone once it ends.
 *   start, no end → a scheduled publication: hidden until it starts.
 */
export function isLive(e: { publishedAt: Date; startsAt: Date | null; endsAt: Date | null }, now: Date): boolean {
    if (e.publishedAt > now) return false;
    if (e.endsAt && e.endsAt <= now) return false;
    if (e.startsAt && !e.endsAt && e.startsAt > now) return false;
    return true;
}

/** A warning whose window is open (or opens within 48 h) earns the banner. */
export function wantsBanner(e: { severity: string; startsAt: Date | null; endsAt: Date | null }, now: Date): boolean {
    if (e.severity !== "warning") return false;
    if (e.endsAt && e.endsAt <= now) return false;
    if (e.startsAt && e.startsAt.getTime() - now.getTime() > 48 * 3_600_000) return false;
    return true;
}
