/**
 * Client-facing palette rule. A result that reads as a miss for the client
 * (a duplicate row our SDRs skipped) must never borrow a "win" colour from its
 * status config — the configured green made "Doublon" look like a success. It
 * keeps its label and its counts; only the colour is forced to neutral grey.
 */

export const CLIENT_NEUTRAL_COLOR = "#8b929b";

const NEUTRAL_RESULT_CODES = new Set(["DOUBLON"]);

export function clientResultColor(code: string, configured: string): string {
    return NEUTRAL_RESULT_CODES.has(code.toUpperCase()) ? CLIENT_NEUTRAL_COLOR : configured;
}
