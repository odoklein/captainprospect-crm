import { NextResponse } from "next/server";
import { z } from "zod";
import { isDay } from "./checklist-template";
import { ChecklistError } from "./checklist-service";

export const daySchema = z.string().refine(isDay, "Date invalide (AAAA-MM-JJ)");

/** ChecklistError → its status; anything else goes to withErrorHandler. */
export function checklistErrorResponse(err: unknown): NextResponse | null {
    if (err instanceof ChecklistError) {
        return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    return null;
}

export async function runChecklist<T>(fn: () => Promise<T>): Promise<T | NextResponse> {
    try {
        return await fn();
    } catch (err) {
        const res = checklistErrorResponse(err);
        if (res) return res;
        throw err;
    }
}
