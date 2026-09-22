import { z } from "zod";
import { EXCLUSION_DURATIONS, MAX_EXCLUSION_REASON_LENGTH } from "./constants";

const durationValues = EXCLUSION_DURATIONS.map((d) => d.value) as [string, ...string[]];

const reason = z
    .string()
    .trim()
    .min(3, "Motif requis")
    .max(MAX_EXCLUSION_REASON_LENGTH, `Motif trop long (max ${MAX_EXCLUSION_REASON_LENGTH} caractères)`);

/**
 * Creating an exclusion from an existing prospect row — the SDR drawer and the
 * manager console both use this. The keys are derived server-side from the row,
 * never taken from the client, so a crafted payload cannot plant a key that
 * would blacklist half the database.
 */
export const createExclusionSchema = z
    .object({
        target: z.enum(["COMPANY", "CONTACT"]),
        scope: z.enum(["GLOBAL", "CLIENT", "MISSION"]),
        /** Required for CLIENT (clientId) and MISSION (missionId); ignored for GLOBAL. */
        scopeId: z.string().min(1).optional().nullable(),
        companyId: z.string().min(1).optional().nullable(),
        contactId: z.string().min(1).optional().nullable(),
        reason,
        duration: z.enum(durationValues).default("permanent"),
    })
    .refine((data) => data.companyId || data.contactId, {
        message: "Société ou contact requis",
        path: ["companyId"],
    })
    .refine((data) => data.target !== "CONTACT" || !!data.contactId, {
        message: "Un contact est requis pour une exclusion de contact",
        path: ["contactId"],
    })
    .refine((data) => data.scope === "GLOBAL" || !!data.scopeId, {
        message: "Portée incomplète : client ou mission requis",
        path: ["scopeId"],
    });

export type CreateExclusionInput = z.infer<typeof createExclusionSchema>;

/**
 * Manual rule typed by a manager with no prospect row in hand — used to
 * pre-empt a company before it is ever imported. At least one key must be
 * meaningful; the service re-checks after normalization.
 */
export const createManualExclusionSchema = z
    .object({
        scope: z.enum(["GLOBAL", "CLIENT", "MISSION"]),
        scopeId: z.string().min(1).optional().nullable(),
        companyName: z.string().trim().min(2, "Nom de société requis").max(200),
        website: z.string().trim().max(300).optional().nullable(),
        phone: z.string().trim().max(50).optional().nullable(),
        reason,
        duration: z.enum(durationValues).default("permanent"),
    })
    .refine((data) => data.scope === "GLOBAL" || !!data.scopeId, {
        message: "Portée incomplète : client ou mission requis",
        path: ["scopeId"],
    });

export type CreateManualExclusionInput = z.infer<typeof createManualExclusionSchema>;

/** The client portal: scope is forced to their own client, so it is not sent. */
export const clientExclusionSchema = z.object({
    target: z.enum(["COMPANY", "CONTACT"]),
    companyId: z.string().min(1).optional().nullable(),
    contactId: z.string().min(1).optional().nullable(),
    reason,
    duration: z.enum(durationValues).default("permanent"),
});

export type ClientExclusionInput = z.infer<typeof clientExclusionSchema>;

export const liftExclusionSchema = z.object({
    liftReason: z
        .string()
        .trim()
        .min(3, "Motif de levée requis")
        .max(MAX_EXCLUSION_REASON_LENGTH),
});

export type LiftExclusionInput = z.infer<typeof liftExclusionSchema>;

export const listExclusionsSchema = z.object({
    scope: z.enum(["GLOBAL", "CLIENT", "MISSION"]).optional(),
    scopeId: z.string().min(1).optional(),
    source: z.enum(["SDR_ACTION", "MANAGER", "CLIENT_PORTAL", "IMPORT"]).optional(),
    /** "active" (default) hides lifted and expired rules; "all" shows the journal. */
    state: z.enum(["active", "lifted", "all"]).default("active"),
    search: z.string().trim().max(200).optional(),
});
