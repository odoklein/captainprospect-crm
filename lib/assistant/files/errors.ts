/**
 * Why a file could not be read, in French, one message per cause (Captain AI
 * v4 files pipeline). The message is stored on AssistantFileText.error and
 * shown both to the manager (files list) and to the model (file tools), so it
 * names what failed and what to do — never a generic « fichier corrompu » for a
 * server-side problem.
 *
 * `permanent` causes stop the automatic retries (the same bytes will fail the
 * same way); the others are retried by the next scheduler pass.
 */

import type { DocumentKind } from "./extract";

export type ExtractionCause =
    | "deleted"
    | "too_large"
    | "storage_missing"
    | "storage_error"
    | "password"
    | "invalid_pdf"
    | "pdf_engine"
    | "corrupt_archive"
    | "corrupt"
    | "unsupported"
    | "ocr_disabled"
    | "ocr_unconfigured"
    | "ocr_failed"
    | "ocr_unavailable"
    | "ocr_empty"
    | "unexpected";

export const EXTRACTION_MESSAGES: Record<ExtractionCause, string> = {
    deleted: "Le fichier a été supprimé.",
    too_large: "Fichier trop volumineux pour l'indexation (25 Mo maximum).",
    storage_missing: "Fichier introuvable dans le stockage : l'objet a été supprimé ou déplacé. Dépose-le à nouveau.",
    storage_error: "Téléchargement du fichier impossible depuis le stockage. Nouvel essai automatique.",
    password: "PDF protégé par mot de passe : retire la protection puis dépose-le à nouveau.",
    invalid_pdf: "PDF invalide ou endommagé : sa structure est illisible. Ré-exporte-le puis dépose-le à nouveau.",
    pdf_engine: "Le moteur de lecture PDF n'a pas pu démarrer sur le serveur. Nouvel essai automatique.",
    corrupt_archive: "Document Office illisible : l'archive DOCX/XLSX est endommagée ou le fichier n'est pas au format annoncé.",
    corrupt: "Lecture du document impossible : fichier endommagé ou dans un format inattendu.",
    unsupported: "Format non pris en charge : seuls PDF, DOCX, XLSX, CSV, Markdown et texte sont indexés.",
    ocr_disabled: "PDF scanné : OCR désactivé sur cette instance (ASSISTANT_OCR=off). Exporte-le en PDF texte ou en DOCX.",
    ocr_unconfigured: "PDF scanné : OCR indisponible, la clé OpenAI n'est pas configurée.",
    ocr_failed: "PDF scanné : la reconnaissance de caractères (OCR) a échoué.",
    ocr_unavailable: "PDF scanné : service d'OCR momentanément indisponible. Nouvel essai automatique.",
    ocr_empty: "PDF scanné : l'OCR n'a trouvé aucun texte lisible (images sans texte ?).",
    unexpected: "Indexation interrompue par une erreur inattendue. Nouvel essai automatique.",
};

const PERMANENT: ReadonlySet<ExtractionCause> = new Set([
    "deleted",
    "too_large",
    "storage_missing",
    "password",
    "invalid_pdf",
    "corrupt_archive",
    "corrupt",
    "unsupported",
    "ocr_disabled",
    "ocr_unconfigured",
    "ocr_failed",
    "ocr_empty",
]);

export function isPermanent(cause: ExtractionCause): boolean {
    return PERMANENT.has(cause);
}

/**
 * Messages written by earlier versions of the pipeline for failures that were
 * not the document's fault: on Node 20 every PDF ended « corrompu » because
 * pdf.js could not load, and scanned PDFs had no OCR. A row still carrying one
 * of them gets one fresh extraction (see pipeline.ts healLegacyTexts).
 */
export const LEGACY_HEALABLE_ERRORS: readonly string[] = [
    "Lecture du document impossible : fichier corrompu, protégé par mot de passe ou dans un format inattendu.",
    "Ce PDF semble scanné (presque aucun texte sélectionnable). La reconnaissance de caractères (OCR) n'est pas disponible : exporte-le en PDF texte ou en DOCX.",
];

/** NEEDS_OCR messages that a newly enabled OCR may heal. */
export const OCR_HEALABLE_ERRORS: readonly string[] = [
    LEGACY_HEALABLE_ERRORS[1],
    EXTRACTION_MESSAGES.ocr_disabled,
    EXTRACTION_MESSAGES.ocr_unconfigured,
];

function fields(err: unknown): { name: string; code: string; message: string; status: number | null } {
    const e = (err && typeof err === "object" ? err : {}) as {
        name?: unknown;
        code?: unknown;
        Code?: unknown;
        message?: unknown;
        statusCode?: unknown;
        $metadata?: { httpStatusCode?: unknown };
        cause?: unknown;
    };
    const status =
        typeof e.$metadata?.httpStatusCode === "number"
            ? e.$metadata.httpStatusCode
            : typeof e.statusCode === "number"
              ? e.statusCode
              : null;
    return {
        name: typeof e.name === "string" ? e.name : "",
        code: typeof e.code === "string" ? e.code : typeof e.Code === "string" ? e.Code : "",
        message: typeof e.message === "string" ? e.message : typeof err === "string" ? err : "",
        status,
    };
}

/** A storage download failure: the object is gone (permanent) or the store is unreachable (retry). */
export function classifyStorageError(err: unknown): "storage_missing" | "storage_error" {
    const f = fields(err);
    if (f.status === 404) return "storage_missing";
    if (["ENOENT", "NoSuchKey", "NotFound", "NoSuchBucket"].includes(f.code) || ["NoSuchKey", "NotFound"].includes(f.name)) {
        return "storage_missing";
    }
    if (/ENOENT|NoSuchKey|not\s*found|does not exist|introuvable/i.test(f.message)) return "storage_missing";
    return "storage_error";
}

/** A parser failure, by document kind and the parser's own error shape. */
export function classifyExtractError(err: unknown, kind: DocumentKind | null): ExtractionCause {
    const f = fields(err);
    const all = `${f.name} ${f.code} ${f.message}`;
    if (kind === "pdf" || kind === null) {
        if (/PasswordException|password/i.test(all)) return "password";
        // The engine itself: pdf.js failed to import or hit a missing built-in.
        if (/PDF\.js could not be resolved|is not defined|is not a function|Cannot find module|ERR_MODULE_NOT_FOUND|ERR_REQUIRE_ESM/i.test(all)) {
            return "pdf_engine";
        }
        if (/InvalidPDFException|Invalid PDF|XRefParseException|FormatError|bad XRef|MissingPDFException/i.test(all)) return "invalid_pdf";
        return kind === "pdf" ? "invalid_pdf" : "corrupt";
    }
    if (kind === "docx" || kind === "xlsx") {
        if (/Cannot find module|ERR_MODULE_NOT_FOUND|is not a function/i.test(all)) return "unexpected";
        return "corrupt_archive";
    }
    return "corrupt";
}

/** The stored French message, with a short technical detail for the server-side causes. */
export function messageFor(cause: ExtractionCause, detail?: string | null): string {
    const base = EXTRACTION_MESSAGES[cause];
    const d = detail?.replace(/\s+/g, " ").trim();
    if (!d) return base;
    if (cause === "pdf_engine" || cause === "ocr_failed" || cause === "ocr_unavailable" || cause === "storage_error" || cause === "unexpected") {
        return `${base} (${d.slice(0, 160)})`;
    }
    return base;
}
