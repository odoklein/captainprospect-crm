/**
 * Text measuring for labels that adapt to their column width — the board
 * re-lays out live when the sidebar opens or closes, so "does this name fit"
 * is answered with real glyph widths, not a character count.
 */

let context: CanvasRenderingContext2D | null = null;
let fontFamily = 'sans-serif';
const widths = new Map<string, number>();

export function textWidth(text: string, sizePx: number, weight = 500): number {
    if (typeof document === 'undefined') return text.length * sizePx * 0.62;
    if (!context) {
        context = document.createElement('canvas').getContext('2d');
        fontFamily = getComputedStyle(document.body).fontFamily || fontFamily;
    }
    if (!context) return text.length * sizePx * 0.62;
    const key = `${weight}|${sizePx}|${text}`;
    let width = widths.get(key);
    if (width === undefined) {
        context.font = `${weight} ${sizePx}px ${fontFamily}`;
        width = context.measureText(text).width;
        widths.set(key, width);
    }
    return width;
}

/** First candidate that fits `maxWidth`; the last one otherwise (CSS truncates it). */
export function fitLabel(candidates: string[], maxWidth: number, sizePx: number): string {
    for (const candidate of candidates) {
        if (textWidth(candidate, sizePx) <= maxWidth) return candidate;
    }
    return candidates[candidates.length - 1];
}
