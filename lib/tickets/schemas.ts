import { z } from "zod";

const ticketCategory = z.enum(["BUG", "IMPROVEMENT", "FEATURE_REQUEST", "TECHNICAL_SUPPORT"]);
const ticketScope = z.enum(["INTERNAL", "CLIENT_FACING", "MISSION_RELATED"]);
const ticketStatus = z.enum(["NEW", "TODO", "IN_PROGRESS", "BLOCKED", "TESTING", "COMPLETED"]);
const ticketPriority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const affectedRole = z.enum(["MANAGER", "CLIENT", "SDR", "DEVELOPER"]);

const nullableDate = z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .nullish();

export const createTicketSchema = z
    .object({
        title: z.string().trim().min(3, "Titre trop court").max(200),
        description: z.string().trim().max(10000).nullish(),
        category: ticketCategory,
        scope: ticketScope.default("INTERNAL"),
        affectedRoles: z.array(affectedRole).min(1, "Au moins un rôle impacté"),
        priority: ticketPriority.default("MEDIUM"),
        clientId: z.string().cuid().nullish(),
        missionId: z.string().cuid().nullish(),
        assigneeId: z.string().cuid().nullish(),
        dueDate: nullableDate,
        sourceSupportMessageId: z.string().cuid().nullish(),
    })
    .superRefine((value, ctx) => {
        if (value.scope === "CLIENT_FACING" && !value.clientId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["clientId"],
                message: "Un ticket client doit être rattaché à un client",
            });
        }
        if (value.scope === "MISSION_RELATED" && !value.missionId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["missionId"],
                message: "Un ticket mission doit être rattaché à une mission",
            });
        }
    });

/** Manager-only fields. Status lives in its own endpoint, publication too. */
export const updateTicketSchema = z.object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().max(10000).nullish(),
    category: ticketCategory.optional(),
    scope: ticketScope.optional(),
    affectedRoles: z.array(affectedRole).min(1).optional(),
    priority: ticketPriority.optional(),
    clientId: z.string().cuid().nullish(),
    missionId: z.string().cuid().nullish(),
    assigneeId: z.string().cuid().nullish(),
    dueDate: nullableDate,
});

export const updateStatusSchema = z
    .object({
        status: ticketStatus,
        /** Required when moving to BLOCKED: a blocker with no stated reason is noise. */
        comment: z.string().trim().max(2000).nullish(),
    })
    .superRefine((value, ctx) => {
        if (value.status === "BLOCKED" && !value.comment?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["comment"],
                message: "Expliquez ce qui bloque",
            });
        }
    });

export const publishTicketSchema = z
    .object({
        publishToRoadmap: z.boolean(),
        publicTitle: z.string().trim().max(200).nullish(),
        publicDescription: z.string().trim().max(5000).nullish(),
    })
    .superRefine((value, ctx) => {
        if (value.publishToRoadmap && !value.publicTitle?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["publicTitle"],
                message: "Un titre public est requis avant publication",
            });
        }
    });

export const createCommentSchema = z.object({
    content: z.string().trim().min(1, "Message vide").max(5000),
});

export const releaseCheckSchema = z.object({
    checked: z.boolean(),
    notes: z.string().trim().max(1000).nullish(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type PublishTicketInput = z.infer<typeof publishTicketSchema>;
