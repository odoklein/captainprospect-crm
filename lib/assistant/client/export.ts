/**
 * Browser helpers of the PDF exports: fetch the PDF, then hand it to the
 * browser as a download (blob → object URL → anchor click). A failure throws
 * an Error with a French message the caller can toast as-is.
 *
 *   downloadConversationPdf(conversationId)            the whole thread
 *   downloadConversationPdf(conversationId, [msgId])   one or more answers
 *   downloadRunReportPdf(runId)                        a Captain Agent report
 */

const FALLBACK_NAME = "document.pdf";

/** The file name of a `Content-Disposition` header (RFC 5987 `filename*` first). */
export function fileNameFromDisposition(header: string | null, fallback = FALLBACK_NAME): string {
    if (!header) return fallback;
    const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
    if (star) {
        try {
            return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
        } catch {
            // fall through to the plain name
        }
    }
    const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
    return plain ? plain[1].trim() : fallback;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
    try {
        const body = (await res.json()) as { error?: unknown };
        if (typeof body?.error === "string" && body.error.trim()) return body.error;
    } catch {
        // not JSON
    }
    if (res.status === 404) return "Introuvable : l'export PDF n'est pas disponible.";
    if (res.status === 401 || res.status === 403) return "Accès refusé à cet export PDF.";
    return fallback;
}

function saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Give the browser time to start the download before releasing the blob.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function download(url: string, init: RequestInit, failure: string): Promise<string> {
    let res: Response;
    try {
        res = await fetch(url, { ...init, cache: "no-store", headers: { Accept: "application/pdf", ...(init.headers ?? {}) } });
    } catch {
        throw new Error("Connexion impossible : le PDF n'a pas pu être généré. Réessaie dans un instant.");
    }
    if (!res.ok) throw new Error(await errorMessage(res, failure));
    const blob = await res.blob();
    const fileName = fileNameFromDisposition(res.headers.get("Content-Disposition"));
    saveBlob(blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" }), fileName);
    return fileName;
}

/** Downloads the thread (or only `messageIds`, assistant answers) as a PDF. Resolves with the file name. */
export function downloadConversationPdf(conversationId: string, messageIds?: string[]): Promise<string> {
    return download(
        `/api/manager/assistant/conversations/${encodeURIComponent(conversationId)}/pdf`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(messageIds && messageIds.length > 0 ? { messageIds } : {}),
        },
        "Le PDF de la conversation n'a pas pu être généré.",
    );
}

/** Downloads a Captain Agent run's report as a PDF. Resolves with the file name. */
export function downloadRunReportPdf(runId: string): Promise<string> {
    return download(`/api/manager/agent/runs/${encodeURIComponent(runId)}/pdf`, { method: "GET" }, "Le PDF du rapport n'a pas pu être généré.");
}
