/**
 * Turns a stored AI failure ("QUOTA: OpenAI API error: …", or an older raw
 * message from before codes were stored) into French a manager can act on.
 * Pure (npm run test:analyse-ia).
 */

export type FriendlyCode = "QUOTA" | "AUTH" | "MISSING_KEY" | "TIMEOUT" | "UNPARSABLE" | "RATE_LIMIT" | "UNKNOWN";

export interface FriendlyAiError {
    code: FriendlyCode;
    title: string;
    detail: string;
    raw: string | null;
}

const COPY: Record<FriendlyCode, { title: string; detail: string }> = {
    QUOTA: {
        title: "Crédits OpenAI épuisés",
        detail: "Le compte OpenAI n'a plus de crédit : aucune fonction IA du logiciel ne peut tourner. Rechargez le compte puis relancez.",
    },
    AUTH: {
        title: "Clé OpenAI invalide ou absente",
        detail: "À corriger dans la configuration du serveur (OPENAI_API_KEY).",
    },
    MISSING_KEY: {
        title: "Clé OpenAI invalide ou absente",
        detail: "À corriger dans la configuration du serveur (OPENAI_API_KEY).",
    },
    TIMEOUT: {
        title: "L'IA n'a pas répondu à temps",
        detail: "Relancez ; si cela se répète, réduisez le périmètre (un client).",
    },
    UNPARSABLE: {
        title: "Réponse de l'IA illisible",
        detail: "Relancez l'analyse.",
    },
    RATE_LIMIT: {
        title: "Trop de demandes envoyées à l'IA",
        detail: "Patientez une minute puis relancez.",
    },
    UNKNOWN: {
        title: "Erreur inattendue",
        detail: "Relancez l'analyse ; le détail technique est indiqué ci-dessous.",
    },
};

const STORED_CODE = /^(MISSING_KEY|QUOTA|AUTH|RATE_LIMIT|TIMEOUT|UNPARSABLE|EMPTY|NETWORK|UNKNOWN):\s*/;

export function friendlyAiError(raw: string | null | undefined): FriendlyAiError {
    const message = raw?.trim() || null;
    let code: FriendlyCode = "UNKNOWN";

    const stored = message?.match(STORED_CODE)?.[1];
    if (stored) {
        code = stored === "EMPTY" ? "UNPARSABLE" : stored === "NETWORK" ? "TIMEOUT" : (stored as FriendlyCode);
    } else if (message) {
        const text = message.toLowerCase();
        if (text.includes("credits remaining") || text.includes("insufficient_quota") || text.includes("exceeded your current quota")) {
            code = "QUOTA";
        } else if (text.includes("api_key") || text.includes("incorrect api key") || text.includes("non configurée")) {
            code = "AUTH";
        } else if (text.includes("parser") || text.includes("json")) {
            code = "UNPARSABLE";
        } else if (text.includes("interrompue") || text.includes("timeout") || text.includes("temps")) {
            code = "TIMEOUT";
        }
    }

    return { code, ...COPY[code], raw: message ? message.replace(STORED_CODE, "") : null };
}
