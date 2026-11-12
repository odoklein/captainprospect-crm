/**
 * Route wrapper of the Captain AI v4 API: withErrorHandler plus the assistant
 * service errors (AssistantAccessError, AssistantMemoryError) answered with
 * their French message. A rule refusal answers 400, never 403 (the contract
 * reserves "not yours" for 404 so ids cannot be probed).
 */

import { NextRequest, NextResponse } from "next/server";
import { NotFoundError, errorResponse, withErrorHandler } from "@/lib/api-utils";
import { AssistantAccessError } from "../folders/service";
import { AssistantMemoryError } from "../memory/service";

export function assistantErrorResponse(error: unknown): NextResponse | null {
    if (error instanceof AssistantAccessError) {
        return errorResponse(error.message, error.status === 403 ? 400 : error.status);
    }
    if (error instanceof AssistantMemoryError) return errorResponse(error.message, error.status);
    return null;
}

type RouteContext<P> = { params: Promise<P> };

/** `withErrorHandler` that also maps the assistant service errors. */
export function assistantRoute<P = Record<string, string>>(
    handler: (request: NextRequest, context: RouteContext<P>) => Promise<NextResponse>,
) {
    return withErrorHandler<Promise<P>>(async (request: NextRequest, context: RouteContext<P>) => {
        try {
            return await handler(request, context);
        } catch (error) {
            const mapped = assistantErrorResponse(error);
            if (mapped) return mapped;
            throw error;
        }
    });
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Awaits the route params and checks every id; a malformed id is a 404. */
export async function readIds<K extends string>(params: Promise<Record<K, string>>, ...keys: K[]): Promise<Record<K, string>> {
    const values = await params;
    for (const key of keys) {
        if (typeof values[key] !== "string" || !ID.test(values[key])) throw new NotFoundError("Introuvable");
    }
    return values;
}

/** Query-string boolean: "1" / "true". */
export const flag = (value: string | null): boolean => value === "1" || value === "true";
