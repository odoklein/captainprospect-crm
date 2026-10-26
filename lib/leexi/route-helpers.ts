import { errorResponse } from "@/lib/api-utils";
import { LeexiError } from "./service";

/** LeexiError carries a French message and the right status; anything else is a 500. */
export function leexiErrorResponse(err: unknown) {
    if (err instanceof LeexiError) return errorResponse(err.message, err.status);
    console.error("Leexi error:", err);
    return errorResponse("Erreur Leexi inattendue", 500);
}
