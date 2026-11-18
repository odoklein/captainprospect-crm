import { z } from "zod";
import { answersSchema } from "@/lib/client-onboarding/questionnaire";

export const registrationSchema = z.object({
    companyName: z.string().trim().min(1, "Indiquez le nom de votre entreprise.").max(200),
    name: z.string().trim().min(1, "Indiquez votre nom.").max(200),
    email: z.string().trim().toLowerCase().email("Adresse email invalide.").max(254),
    password: z.string().min(10, "Utilisez au moins 10 caractères.").max(72)
        .refine((value) => new TextEncoder().encode(value).length <= 72, "Le mot de passe est trop long."),
});

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.")
    .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "Date invalide.");

export const missionBriefSchema = z.object({
    questionnaire: answersSchema.optional(),
    name: z.string().trim().min(1, "Nommez votre mission.").max(200),
    objective: z.string().trim().min(1, "Précisez votre objectif.").max(5000),
    channels: z.array(z.enum(["CALL", "EMAIL", "LINKEDIN"])).min(1, "Choisissez au moins un canal.").max(3)
        .transform((values) => [...new Set(values)]),
    startDate: day,
    endDate: day,
    targetMeetings: z.number().int().min(1).max(100000).nullable().default(null),
    targetAudience: z.string().trim().min(1, "Décrivez les entreprises et les interlocuteurs visés.").max(10000),
    geography: z.string().trim().max(2000).default(""),
    offer: z.string().trim().min(1, "Décrivez votre offre.").max(10000),
    differentiators: z.string().trim().max(10000).default(""),
    exclusions: z.string().trim().max(10000).default(""),
}).refine((data) => data.endDate >= data.startDate, {
    message: "La date de fin doit suivre la date de début.", path: ["endDate"],
});

export type MissionBrief = z.infer<typeof missionBriefSchema>;

/** Explicit allowlist: browser input can never set ownership, activity or status. */
export function missionBriefData(input: MissionBrief) {
    return {
        name: input.name,
        objective: input.objective,
        channel: input.channels[0],
        channels: input.channels,
        startDate: new Date(`${input.startDate}T00:00:00.000Z`),
        endDate: new Date(`${input.endDate}T00:00:00.000Z`),
        targetMeetings: input.targetMeetings,
    };
}
