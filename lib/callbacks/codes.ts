import { resolveActionResult } from "@/lib/actions/action-result";

// Which results mean "call back" — pure, safe for client components.
// Server-side queries live in lib/callbacks/pending.ts.

export const DEFAULT_CALLBACK_CODES = ["CALLBACK_REQUESTED", "RELANCE", "RAPPEL"] as const;

const DEFAULTS: ReadonlySet<string> = new Set(DEFAULT_CALLBACK_CODES);

export function resolveCallbackEnum(code: string, label?: string | null): string | null {
    try {
        return resolveActionResult(code, { code, label });
    } catch {
        return null;
    }
}

/** A configured status (code + flag) is a callback: flagged, or resolving to a default callback code. */
export function isCallbackStatus(status: { code: string; label?: string | null; triggersCallback?: boolean }): boolean {
    if (status.triggersCallback === true) return true;
    const resolved = resolveCallbackEnum(status.code, status.label);
    return !!resolved && DEFAULTS.has(resolved);
}

/** Stored ActionResult values that are callbacks for one effective status config. */
export function callbackCodesFromStatuses(
    statuses: Array<{ code: string; label?: string | null; triggersCallback?: boolean }>,
): Set<string> {
    const codes = new Set<string>(DEFAULT_CALLBACK_CODES);
    for (const s of statuses) {
        if (s.triggersCallback !== true) continue;
        const resolved = resolveCallbackEnum(s.code, s.label);
        if (resolved) codes.add(resolved);
    }
    return codes;
}

/**
 * For UI code that compares both configured codes (status picker) and stored
 * results (history): every callback config code plus every stored callback value.
 */
export function callbackCodesForUi(
    statuses: Array<{ code: string; label?: string | null; triggersCallback?: boolean }>,
): Set<string> {
    const codes = callbackCodesFromStatuses(statuses);
    for (const s of statuses) if (isCallbackStatus(s)) codes.add(s.code);
    return codes;
}
