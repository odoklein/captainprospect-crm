import type { ActionResult } from '@prisma/client';

/**
 * Canonical ActionResult enum values.
 *
 * Keep this list in sync with the ActionResult enum in prisma/schema.prisma.
 * Action.result can only store one of these values, while the SDR UI sends
 * mission-configured status codes (which may contain accents, spaces or
 * legacy French labels). resolveActionResult() is the single place that
 * translates a configured code to a storable enum value.
 */
export const ACTION_RESULT_VALUES = [
    'NO_RESPONSE',
    'BAD_CONTACT',
    'BARRAGE_STANDARD',
    'NUMERO_KO',
    'INTERESTED',
    'CALLBACK_REQUESTED',
    'MEETING_BOOKED',
    'MEETING_CANCELLED',
    'INVALIDE',
    'DISQUALIFIED',
    'ENVOIE_MAIL',
    'MAIL_ENVOYE',
    'CONNECTION_SENT',
    'MESSAGE_SENT',
    'REPLIED',
    'NOT_INTERESTED',
    'REFUS',
    'REFUS_ARGU',
    'REFUS_CATEGORIQUE',
    'RELANCE',
    'RAPPEL',
    'GERE_PAR_SIEGE',
    'FAUX_NUMERO',
    'PROJET_A_SUIVRE',
    'MAUVAIS_INTERLOCUTEUR',
    'MAIL_UNIQUEMENT',
    'BARRAGE_SECRETAIRE',
    'MAIL_DOC',
    'HORS_CIBLE',
    'DOUBLON',
] as const satisfies readonly ActionResult[];

export type CanonicalActionResult = (typeof ACTION_RESULT_VALUES)[number];

const VALID_ACTION_RESULTS: ReadonlySet<string> = new Set(ACTION_RESULT_VALUES);

/**
 * Normalized aliases for codes and labels that are not ActionResult members.
 * Normalization removes accents, punctuation and case, so "Pas intéressé"
 * and "PAS_INTÉRESSÉ" both become PAS_INTERESSE.
 */
export const ACTION_RESULT_ALIASES: Readonly<Record<string, ActionResult>> = {
    // No response
    NE_REPONDS_PAS: 'NO_RESPONSE',
    NRP: 'NO_RESPONSE',
    PAS_DE_REPONSE: 'NO_RESPONSE',
    NO_ANSWER: 'NO_RESPONSE',

    // Bad contact / wrong number
    MAUVAIS_CONTACT: 'BAD_CONTACT',
    STANDARD_MAUVAIS_CONTACT: 'BAD_CONTACT',
    MAUVAIS_NUMERO: 'FAUX_NUMERO',
    NUMERO_INVALIDE: 'NUMERO_KO',
    NUMERO_HORS_SERVICE: 'NUMERO_KO',

    // Callback / follow-up
    RAPEL: 'RAPPEL',
    RAPPEL_DEMANDE: 'CALLBACK_REQUESTED',
    RAPPEL_DEMANDEE: 'CALLBACK_REQUESTED',
    RAPPEL_REQUESTED: 'CALLBACK_REQUESTED',
    CALL_BACK_REQUESTED: 'CALLBACK_REQUESTED',
    CALLBACK: 'CALLBACK_REQUESTED',
    A_RAPPELER: 'CALLBACK_REQUESTED',
    RAPPELER: 'CALLBACK_REQUESTED',
    RELENCE: 'RELANCE',
    RELANCEE: 'RELANCE',

    // Interest
    INTERESSE: 'INTERESTED',
    TRES_INTERESSE: 'INTERESTED',
    PAS_INTERESSE: 'NOT_INTERESTED',
    PAS_INTERESSEE: 'NOT_INTERESTED',
    NON_INTERESSE: 'NOT_INTERESTED',
    NON_INTERESSEE: 'NOT_INTERESTED',

    // Meetings
    RDV_PRIS: 'MEETING_BOOKED',
    MEETING_PRIS: 'MEETING_BOOKED',
    RDV_ANNULE: 'MEETING_CANCELLED',
    MEETING_ANNULE: 'MEETING_CANCELLED',

    // Gatekeeper / mail
    BARRAGE: 'BARRAGE_STANDARD',
    MAIL_A_ENVOYER: 'ENVOIE_MAIL',
    DOCUMENT_A_ENVOYER: 'MAIL_DOC',
};

export interface ActionStatusLike {
    code: string;
    label?: string | null;
}

/**
 * Typed validation error. Routes map it to HTTP 400 instead of letting an
 * unknown configured status become an opaque 500.
 */
export class ActionValidationError extends Error {
    readonly status = 400;
    readonly code = 'INVALID_ACTION_RESULT';
    readonly inputResult: string;

    constructor(inputResult: string) {
        super(`Invalid action result: ${inputResult}`);
        this.name = 'ActionValidationError';
        this.inputResult = inputResult;
    }
}

/**
 * Uppercase, accent-free, underscore-separated form used for comparisons.
 * "Pas intéressé" -> "PAS_INTERESSE"
 */
export function normalizeActionResultCode(raw: string): string {
    if (typeof raw !== 'string') return '';
    return raw
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();
}

/**
 * Resolve any configured status code or label to a valid ActionResult enum.
 *
 * Order:
 *   1. exact enum value (after normalization),
 *   2. known legacy / French alias,
 *   3. the configured status definition's label (for custom mission codes
 *      such as "PAS_INTÉRESSÉ_2" labelled "Pas intéressé").
 *
 * Throws ActionValidationError when the value cannot be mapped. Callers must
 * translate that to a 400, never a 500.
 */
export function resolveActionResult(
    inputResult: string,
    statusDef?: ActionStatusLike | null
): ActionResult {
    if (typeof inputResult !== 'string') {
        throw new ActionValidationError(String(inputResult));
    }

    const normalized = normalizeActionResultCode(inputResult);
    if (!normalized) {
        throw new ActionValidationError(inputResult);
    }

    const direct = ACTION_RESULT_ALIASES[normalized] ?? normalized;
    if (VALID_ACTION_RESULTS.has(direct)) {
        return direct as ActionResult;
    }

    // A mission/client status can use a free-form code. When the caller found
    // the status definition for exactly this code, its label is the semantic
    // bridge to the enum (e.g. code "PAS_INTÉRESSÉ_2", label "Pas intéressé").
    if (statusDef) {
        const statusCode = normalizeActionResultCode(statusDef.code ?? '');
        if (statusCode === normalized) {
            const label = normalizeActionResultCode(statusDef.label ?? '');
            const byLabel = ACTION_RESULT_ALIASES[label] ?? label;
            if (VALID_ACTION_RESULTS.has(byLabel)) {
                return byLabel as ActionResult;
            }
        }
    }

    throw new ActionValidationError(inputResult);
}
