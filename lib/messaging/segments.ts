// ============================================
// SMS length, the way carriers bill it. Pure (client + server).
//
// GSM-7 text: 160 characters in one SMS, 153 per part beyond. Any character
// outside GSM-7 (é is in, but ê, à is in, ç is in, œ, emoji… are not) switches
// the whole message to UCS-2: 70, then 67 per part. Each part is billed.
// ============================================

const GSM7 =
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€"; // count as 2

const BASIC = new Set([...GSM7]);
const EXT = new Set([...GSM7_EXT]);

export interface SmsLength {
    encoding: "GSM-7" | "UCS-2";
    /** Billing units used (extension characters count twice in GSM-7). */
    units: number;
    segments: number;
    /** Units left before the next part starts. */
    remaining: number;
    /** Characters that forced UCS-2, to help shorten the bill. */
    unicodeChars: string[];
}

export function smsLength(text: string): SmsLength {
    const chars = [...text];
    const unicodeChars = [...new Set(chars.filter((c) => !BASIC.has(c) && !EXT.has(c)))];
    if (unicodeChars.length === 0) {
        const units = chars.reduce((n, c) => n + (EXT.has(c) ? 2 : 1), 0);
        const segments = units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153);
        const cap = segments <= 1 ? 160 : segments * 153;
        return { encoding: "GSM-7", units, segments, remaining: Math.max(0, cap - units), unicodeChars };
    }
    // UCS-2 counts UTF-16 code units (an emoji is 2).
    const units = text.length;
    const segments = units === 0 ? 0 : units <= 70 ? 1 : Math.ceil(units / 67);
    const cap = segments <= 1 ? 70 : segments * 67;
    return { encoding: "UCS-2", units, segments, remaining: Math.max(0, cap - units), unicodeChars };
}

/** Replies that mean « stop texting me ». */
const STOP_WORDS = ["STOP", "ARRET", "ARRÊT", "STOP SMS", "STOPALL", "UNSUBSCRIBE", "DESINSCRIRE", "DÉSINSCRIRE", "DESABONNER", "DÉSABONNER"];

export function isStopKeyword(body: string): string | null {
    const t = body.trim().toUpperCase().replace(/[.!\s]+$/g, "");
    return STOP_WORDS.find((w) => t === w) ?? null;
}

/** Appends the signature on its own line, unless the text already ends with it. */
export function withSignature(body: string, signature: string | null | undefined): string {
    const sig = signature?.trim();
    const text = body.trimEnd();
    if (!sig || text.endsWith(sig)) return text;
    return `${text}\n${sig}`;
}
