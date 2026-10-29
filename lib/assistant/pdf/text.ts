/**
 * Text helpers of the assistant PDF: what the standard PDF fonts can draw, the
 * French long date of the cover, and the download file name. Pure.
 *
 * Font decision: the PDF uses the 14 standard fonts (Helvetica family, Courier
 * for code), like the client report (lib/reporting/pdf.ts). They need no file,
 * give a real bold / italic / bold-italic, and survive any server bundle. Their
 * encoding is WinAnsi (Latin-1 + € ‘ ’ “ ” … – — • Œ œ …), which covers French.
 * The only TTF in node_modules (next/dist/compiled/@vercel/og noto-sans) is a
 * single regular weight inside Next's private folder, so it is not used.
 * Everything outside WinAnsi is normalised here, before measuring and drawing:
 * the narrow no-break space U+202F that fr-FR number formatting emits (and the
 * other thin spaces) becomes U+00A0, so « 1 240 » and « 12,5 % » never break;
 * a non-breaking hyphen or a minus sign becomes "-", arrows and comparison
 * signs get an ASCII spelling, an accented letter outside Latin-1 loses its
 * accent (ł → l, ș → s), and what is left (emoji, CJK…) is dropped.
 */

/** Unicode → WinAnsi byte, for the 27 code points WinAnsi places in 0x80–0x9F. */
const WIN_ANSI_EXTRAS = new Set([
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d,
    0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

const NBSP = "\u00a0";

const REPLACEMENTS: Record<string, string> = {
    "\u202f": NBSP, // narrow no-break space (fr-FR thousands, before % and €)
    "\u2007": NBSP, // figure space
    "\u2009": " ", // thin space
    "\u200a": " ", // hair space
    "\u2002": " ",
    "\u2003": " ",
    "\u2004": " ",
    "\u2005": " ",
    "\u2006": " ",
    "\u2008": " ",
    "\u205f": " ",
    "\u3000": " ",
    "\t": "    ",
    "\u2010": "-",
    "\u2011": "-",
    "\u2012": "–",
    "\u2015": "—",
    "\u2212": "-",
    "\u2192": "->",
    "\u2190": "<-",
    "\u2194": "<->",
    "\u21d2": "=>",
    "\u2191": "+",
    "\u2193": "-",
    "\u2264": "<=",
    "\u2265": ">=",
    "\u2260": "!=",
    "\u2248": "~",
    "\u2713": "v",
    "\u2714": "v",
    "\u2717": "x",
    "\u2718": "x",
    "\u2032": "'",
    "\u2033": '"',
    "\u2044": "/",
    "\u2215": "/",
    // Letters with no decomposition to a base letter.
    "\u0141": "L",
    "\u0142": "l",
    "\u0110": "D",
    "\u0111": "d",
    "\u0131": "i",
    "\u00ad": "", // soft hyphen
    "\u200b": "",
    "\u200c": "",
    "\u200d": "",
    "\u2060": "",
    "\ufeff": "",
    "\ufe0f": "",
};

function encodable(code: number): boolean {
    return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS.has(code);
}

/** Text the standard PDF fonts can draw (see the font decision above). Newlines are kept. */
export function pdfSafe(input: string | null | undefined): string {
    if (!input) return "";
    const text = input.normalize("NFC");
    let out = "";
    for (const char of text) {
        const code = char.codePointAt(0) ?? 0;
        if (char === "\n") {
            out += char;
            continue;
        }
        // Replacements first: the soft hyphen sits inside Latin-1 but must not be drawn.
        const replacement = REPLACEMENTS[char];
        if (replacement !== undefined) {
            out += replacement;
            continue;
        }
        if (encodable(code)) {
            out += char;
            continue;
        }
        // An accented letter outside Latin-1: keep its base letter.
        const base = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (base && base !== char && [...base].every((c) => encodable(c.codePointAt(0) ?? 0))) {
            out += base;
            continue;
        }
        // Control characters, emoji, other scripts: dropped.
    }
    return out;
}

const LONG_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const ISO_DAY = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Paris" });

/** « 29 octobre 2026 » (Paris time). */
export function frLongDate(date: Date): string {
    return LONG_DATE.format(date);
}

/** "2026-10-29" (Paris time). */
export function isoDay(date: Date): string {
    return ISO_DAY.format(date);
}

/** Lower-case ASCII words joined by "-": « Bilan ACME — octobre » → "bilan-acme-octobre". */
export function kebab(text: string, max = 60): string {
    const slug = text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[œŒ]/g, "oe")
        .replace(/[æÆ]/g, "ae")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    if (slug.length <= max) return slug;
    const cut = slug.slice(0, max);
    const dash = cut.lastIndexOf("-");
    return (dash > max / 2 ? cut.slice(0, dash) : cut).replace(/-+$/, "");
}

/**
 * The download name: kebab-case French, dated, « bilan-acme-2026-10-29.pdf ».
 * A name that already ends with a date keeps it; an empty one becomes "document".
 */
export function pdfFileName(base: string, date: Date): string {
    const slug = kebab(base.replace(/\.pdf$/i, "")) || "document";
    if (/\d{4}-\d{2}-\d{2}$/.test(slug)) return `${slug}.pdf`;
    return `${slug}-${isoDay(date)}.pdf`;
}

/** `Content-Disposition` for a PDF download (the name is ASCII by construction). */
export function attachmentHeader(fileName: string): string {
    const ascii = fileName.replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || "document.pdf";
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
