import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const prospectCompanySchema = z.object({
    name: z.string().trim().min(2, "Nom de la société requis").max(200),
    phone: optionalText(40),
    website: optionalText(300),
    city: optionalText(120),
});

export const prospectContactSchema = z
    .object({
        civility: z.enum(["M.", "Mme"]).optional().nullable(),
        firstName: optionalText(100),
        lastName: optionalText(100),
        title: optionalText(150),
        phone: optionalText(40),
        email: z
            .string()
            .trim()
            .max(200)
            .optional()
            .nullable()
            .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-mail invalide"),
    })
    .refine((c) => !!(c.firstName || c.lastName), { message: "Nom du contact requis", path: ["lastName"] })
    .refine((c) => !!(c.phone || c.email), { message: "Téléphone ou e-mail du contact requis", path: ["phone"] });

export const prospectSubmissionSchema = z
    .object({
        missionId: z.string().min(1),
        listId: z.string().min(1),
        source: z.enum(["REFERRAL", "CLIENT_INBOUND", "OTHER"]),
        note: optionalText(1000),
        /** Company/contact on screen when the SDR was redirected (referrer). */
        fromCompanyId: z.string().optional().nullable(),
        fromContactId: z.string().optional().nullable(),
        company: prospectCompanySchema,
        contact: prospectContactSchema.optional().nullable(),
        /** Add the contact to this company of the mission instead of creating one. */
        existingCompanyId: z.string().optional().nullable(),
        /** Only run the checks (live duplicate warning in the form). */
        dryRun: z.boolean().optional(),
    })
    .refine((d) => d.source !== "OTHER" || !!d.note, { message: "Précisez l'origine dans la note", path: ["note"] })
    .refine((d) => !d.existingCompanyId || !!d.contact, {
        message: "Renseignez le contact à ajouter à cette société",
        path: ["contact"],
    });

export type ProspectSubmissionInput = z.infer<typeof prospectSubmissionSchema>;

export const prospectCreationModeSchema = z.object({
    mode: z.enum(["OFF", "VALIDATION", "DIRECT"]),
});

export const submissionDecisionSchema = z.discriminatedUnion("decision", [
    z.object({ decision: z.literal("APPROVE"), listId: z.string().optional().nullable() }),
    z.object({ decision: z.literal("REJECT"), reason: z.string().trim().min(3, "Motif requis").max(500) }),
]);
