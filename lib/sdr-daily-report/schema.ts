import { z } from "zod";
import {
    FIELD_COMMENT_MAX_LENGTH,
    MAIN_BLOCKER_VALUES,
    PITCH_FEELING_VALUES,
    PROSPECT_RETURN_VALUES,
    REACHABILITY_EXCLUSIVE,
    REACHABILITY_VALUES,
} from "./options";

/** At least one answer, no duplicates. */
function multiChoice<const T extends readonly [string, ...string[]]>(values: T, message: string) {
    return z
        .array(z.enum(values), { error: message })
        .min(1, message)
        .max(values.length)
        .transform((items) => Array.from(new Set(items)));
}

/**
 * Body of POST /api/sdr/daily-feedback. Questions 1-3 need at least one answer,
 * question 4 exactly one; only the closing comment is optional. Missions are
 * optional too: an SDR with nothing planned that day must still be able to
 * submit, otherwise a mandatory form would lock them out.
 */
export const dailyReportSchema = z
    .object({
        reachability: multiChoice(REACHABILITY_VALUES, "Joignabilité : choisissez au moins une réponse"),
        prospectReturns: multiChoice(PROSPECT_RETURN_VALUES, "Retours prospects : choisissez au moins une réponse"),
        pitchFeeling: multiChoice(PITCH_FEELING_VALUES, "Ressenti sur le discours : choisissez au moins une réponse"),
        mainBlocker: z.enum(MAIN_BLOCKER_VALUES, { error: "Principal frein : choisissez une réponse" }),
        fieldComment: z
            .string()
            .trim()
            .max(FIELD_COMMENT_MAX_LENGTH, `Commentaire : ${FIELD_COMMENT_MAX_LENGTH} caractères maximum`)
            .nullish()
            .transform((value) => (value ? value : null)),
        missionIds: z.array(z.string().trim().min(1)).max(20).default([]),
        pagePath: z.string().trim().max(255).nullish(),
    })
    .superRefine((data, ctx) => {
        if (
            data.reachability.includes(REACHABILITY_EXCLUSIVE) &&
            data.reachability.length > 1
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["reachability"],
                message: "« Bonne joignabilité globale » ne se combine pas avec une difficulté de joignabilité",
            });
        }
    });

export type DailyReportInput = z.output<typeof dailyReportSchema>;
