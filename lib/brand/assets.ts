// ============================================
// BRAND ASSETS — validation of uploaded logos and icons. Pure, isomorphic.
//
//   validateBrandAsset(bytes) → { ok, kind, contentType, ext, width, height } | { ok: false, error }
//
// The type comes from the file's magic bytes, never from the declared
// Content-Type or the file name. PNG and WebP: ≤ 2 MB, ≤ 4096 px per side,
// dimensions read from the header. SVG: same size cap, and REJECTED (not
// repaired) when it contains anything that could run or fetch: scripts,
// foreignObject, event handlers, javascript: URLs, external references,
// DOCTYPE/ENTITY, @import or url() to another document. The serving route
// adds a sandboxing CSP on top (app/api/brand/assets/[slot]).
// ============================================

export const BRAND_ASSET_MAX_BYTES = 2 * 1024 * 1024;
export const BRAND_ASSET_MAX_PX = 4096;

export type BrandAssetKind = "png" | "webp" | "svg";

export const BRAND_ASSET_CONTENT_TYPES: Record<BrandAssetKind, string> = {
    png: "image/png",
    webp: "image/webp",
    svg: "image/svg+xml",
};

export type ValidatedBrandAsset =
    | { ok: true; kind: BrandAssetKind; contentType: string; ext: BrandAssetKind; width: number | null; height: number | null }
    | { ok: false; error: string };

// ── Type detection ──────────────────────────────────────────────────────────

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ascii(bytes: Uint8Array, start: number, length: number): string {
    let s = "";
    for (let i = start; i < start + length && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
}

function isPng(bytes: Uint8Array): boolean {
    return bytes.length >= 24 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function isWebp(bytes: Uint8Array): boolean {
    return bytes.length >= 30 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
}

function decodeText(bytes: Uint8Array): string | null {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
    } catch {
        return null;
    }
}

/**
 * Text that looks like an SVG document (optional XML declaration, comments and
 * DOCTYPE, then <svg). A DOCTYPE is recognised here so the sanitizer can
 * refuse it with the right reason.
 */
function looksLikeSvg(text: string): boolean {
    let head = text.replace(/^\s*<\?xml[\s\S]*?\?>/i, "");
    for (;;) {
        const next = head
            .replace(/^\s*<!--[\s\S]*?-->/, "")
            .replace(/^\s*<!doctype[^[>]*(\[[\s\S]*?\])?\s*>/i, "");
        if (next === head) break;
        head = next;
    }
    return /^<svg[\s>]/i.test(head.trimStart());
}

/** Kind from the magic bytes, or null when it is none of png / webp / svg. */
export function detectBrandAssetKind(bytes: Uint8Array): BrandAssetKind | null {
    if (isPng(bytes)) return "png";
    if (isWebp(bytes)) return "webp";
    const text = decodeText(bytes);
    if (text !== null && looksLikeSvg(text)) return "svg";
    return null;
}

// ── Raster dimensions ───────────────────────────────────────────────────────

export function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
    if (!isPng(bytes) || ascii(bytes, 12, 4) !== "IHDR") return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
}

export function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
    if (!isWebp(bytes)) return null;
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8 ") {
        // Lossy: frame tag (3 bytes) + start code 9D 01 2A, then 14-bit LE width / height.
        if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
        return {
            width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
            height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
        };
    }
    if (chunk === "VP8L") {
        // Lossless: signature 0x2F, then 14-bit width-1 and height-1 packed LE.
        if (bytes[20] !== 0x2f) return null;
        const b1 = bytes[21], b2 = bytes[22], b3 = bytes[23], b4 = bytes[24];
        return {
            width: 1 + (((b2 & 0x3f) << 8) | b1),
            height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
        };
    }
    if (chunk === "VP8X") {
        // Extended: 24-bit LE canvas width-1 / height-1 at 24 / 27.
        return {
            width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
            height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
        };
    }
    return null;
}

// ── SVG ─────────────────────────────────────────────────────────────────────

/** A reference is safe when it stays inside the document (#id) or is an inline raster image. */
function isSafeReference(value: string): boolean {
    const v = value.trim().replace(/^['"]|['"]$/g, "").trim();
    if (v === "" || v.startsWith("#")) return true;
    return /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]*$/i.test(v);
}

/** Every attribute value of a given name (quoted or not), anywhere in the document. */
function attributeValues(text: string, name: string): string[] {
    const re = new RegExp(`[\\s"'/]${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, "gi");
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push(m[1].replace(/^['"]|['"]$/g, ""));
    return out;
}

/** Reason the SVG is refused, or null when it contains nothing active or external. */
export function svgRejection(text: string): string | null {
    const lower = text.toLowerCase();
    const compact = lower.replace(/[\s\u0000-\u001f]+/g, "");

    if (/<!doctype/i.test(text) || /<!entity/i.test(text)) return "DOCTYPE / ENTITY interdits dans un SVG";
    if (/<script[\s>/]/i.test(text)) return "Le SVG contient un script";
    if (/<foreignobject[\s>/]/i.test(text)) return "Le SVG contient un foreignObject";
    if (/<(iframe|embed|object|audio|video|canvas|handler|listener)[\s>/]/i.test(text)) return "Le SVG contient un élément interdit";
    if (/[\s"'/]on[a-z]+\s*=/i.test(text)) return "Le SVG contient un gestionnaire d'événement (on…)";
    if (compact.includes("javascript:") || compact.includes("vbscript:")) return "Le SVG contient une URL javascript:";
    // Character references can hide any of the above inside attribute values.
    if (/&#/.test(text)) return "Le SVG contient des références de caractères (&#…) — exportez-le sans entités";
    if (/attributename\s*=\s*["']?\s*(xlink:)?href/i.test(text)) return "Le SVG anime un lien (href)";

    for (const attr of ["href", "xlink:href", "src"]) {
        for (const v of attributeValues(text, attr)) {
            if (!isSafeReference(v)) return `Le SVG référence une ressource externe (${attr})`;
        }
    }
    if (/@import/i.test(text)) return "Le SVG contient un @import";
    const urlRe = /url\s*\(\s*([^)]*)\)/gi;
    let m: RegExpExecArray | null;
    while ((m = urlRe.exec(text))) {
        if (!isSafeReference(m[1])) return "Le SVG référence une ressource externe (url())";
    }
    return null;
}

function svgLength(v: string | undefined): number | null {
    if (!v) return null;
    const m = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/i.exec(v);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Size of the root <svg>: width/height attributes, else the viewBox. */
export function svgDimensions(text: string): { width: number; height: number } | null {
    const root = /<svg\b([^>]*)>/i.exec(text);
    if (!root) return null;
    const attrs = root[1];
    const attr = (name: string) => {
        const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(attrs);
        return m ? (m[2] ?? m[3]) : undefined;
    };
    const w = svgLength(attr("width"));
    const h = svgLength(attr("height"));
    if (w && h) return { width: w, height: h };
    const vb = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
    if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { width: Math.round(vb[2]), height: Math.round(vb[3]) };
    return null;
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function validateBrandAsset(bytes: Uint8Array): ValidatedBrandAsset {
    if (!bytes || bytes.length === 0) return { ok: false, error: "Fichier vide" };
    if (bytes.length > BRAND_ASSET_MAX_BYTES) return { ok: false, error: "Fichier trop lourd (2 Mo maximum)" };

    const kind = detectBrandAssetKind(bytes);
    if (!kind) return { ok: false, error: "Format non pris en charge : PNG, WebP ou SVG uniquement" };

    let dims: { width: number; height: number } | null;
    if (kind === "svg") {
        const text = decodeText(bytes) ?? "";
        const reason = svgRejection(text);
        if (reason) return { ok: false, error: reason };
        dims = svgDimensions(text);
    } else {
        dims = kind === "png" ? pngDimensions(bytes) : webpDimensions(bytes);
        if (!dims || dims.width <= 0 || dims.height <= 0) return { ok: false, error: "Image illisible (en-tête invalide)" };
        if (dims.width > BRAND_ASSET_MAX_PX || dims.height > BRAND_ASSET_MAX_PX) {
            return { ok: false, error: `Image trop grande (${BRAND_ASSET_MAX_PX} px maximum par côté)` };
        }
    }
    return {
        ok: true,
        kind,
        contentType: BRAND_ASSET_CONTENT_TYPES[kind],
        ext: kind,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
    };
}
