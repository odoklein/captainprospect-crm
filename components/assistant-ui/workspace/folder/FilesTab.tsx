"use client";

/**
 * Fichiers tab: drop documents into the folder (per-file progress), follow
 * their indexing (polled every 3 s while pending), download, re-index,
 * delete, and pull the client's project files in.
 */

import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { AlertTriangle, Download, File as FileIcon, FileSpreadsheet, FileText, FolderInput, RotateCw, Trash2, UploadCloud, X } from "lucide-react";
import { FILE_ACCEPT, FILE_MAX_BYTES, type FolderFile } from "@/lib/assistant/api-contract";
import { uploadFolderFile, useFolderFiles } from "@/lib/assistant/client/folder-hooks";
import { CARD, EmptyBlock, FOCUS, SECONDARY_BUTTON, Shimmer, StatusPill, relativeTime } from "@/components/accueil/AccueilUI";
import { ConfirmModal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { FILE_STATUS, formatBytes, rejectionReason } from "./logic";

const ACCEPT: Record<string, string[]> = Object.fromEntries(Object.entries(FILE_ACCEPT).map(([mime, ext]) => [mime, [...ext]]));
const PARALLEL = 3;

interface Upload {
    key: string;
    name: string;
    size: number;
    progress: number;
    state: "queued" | "uploading" | "done" | "error";
    error?: string;
}

function fileGlyph(name: string, mime: string) {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "xlsx" || ext === "csv" || mime.includes("spreadsheet") || mime === "text/csv") return FileSpreadsheet;
    if (ext === "pdf" || ext === "docx" || ext === "md" || ext === "txt") return FileText;
    return FileIcon;
}

export function FilesTab({ folderId, isClient }: { folderId: string; isClient: boolean }) {
    const { data, error, isLoading, addUploaded, remove, reindex, indexProject, reload } = useFolderFiles(folderId);
    const toast = useToast();
    const [uploads, setUploads] = useState<Upload[]>([]);
    const [confirm, setConfirm] = useState<FolderFile | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [indexing, setIndexing] = useState(false);
    const aborts = useRef(new Map<string, AbortController>());

    useEffect(() => {
        const map = aborts.current;
        return () => map.forEach((c) => c.abort());
    }, []);

    const update = (key: string, patch: Partial<Upload>) => setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));

    const runUploads = useCallback(
        async (files: File[]) => {
            const batch: Array<{ key: string; file: File }> = files.map((file, i) => ({ key: `${file.name}-${file.size}-${file.lastModified}-${i}-${Math.random().toString(36).slice(2, 7)}`, file }));
            setUploads((list) => [...list, ...batch.map(({ key, file }) => ({ key, name: file.name, size: file.size, progress: 0, state: "queued" as const }))]);
            const rejected: Array<{ name: string; reason: string }> = [];
            let cursor = 0;
            const worker = async () => {
                while (cursor < batch.length) {
                    const { key, file } = batch[cursor++];
                    const controller = new AbortController();
                    aborts.current.set(key, controller);
                    update(key, { state: "uploading" });
                    try {
                        const res = await uploadFolderFile(folderId, file, (p) => update(key, { progress: p }), controller.signal);
                        if (res.files.length) addUploaded(res.files);
                        rejected.push(...res.rejected);
                        if (res.rejected.length && !res.files.length) update(key, { state: "error", error: res.rejected[0].reason });
                        else {
                            update(key, { state: "done", progress: 1 });
                            setTimeout(() => setUploads((list) => list.filter((u) => u.key !== key)), 1400);
                        }
                    } catch (e) {
                        update(key, { state: "error", error: (e as Error).message });
                    } finally {
                        aborts.current.delete(key);
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(PARALLEL, batch.length) }, worker));
            if (rejected.length) {
                toast.addToast({
                    type: "warning",
                    title: rejected.length === 1 ? "1 fichier refusé" : `${rejected.length} fichiers refusés`,
                    message: rejected.map((r) => `${r.name} : ${r.reason}`).join(" · "),
                    duration: 8000,
                });
            }
        },
        // update/setUploads are stable; toast methods are memoised by the provider.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [folderId, addUploaded],
    );

    const onDrop = useCallback(
        (accepted: File[], refused: FileRejection[]) => {
            if (refused.length) {
                toast.addToast({
                    type: "warning",
                    title: refused.length === 1 ? "1 fichier ignoré" : `${refused.length} fichiers ignorés`,
                    message: refused.map((r) => `${r.file.name} : ${rejectionReason(r.errors[0]?.code ?? "", FILE_MAX_BYTES)}`).join(" · "),
                    duration: 8000,
                });
            }
            if (accepted.length) void runUploads(accepted);
        },
        [runUploads, toast],
    );

    const { getRootProps, getInputProps, isDragActive, isDragReject, open } = useDropzone({
        onDrop,
        accept: ACCEPT,
        maxSize: FILE_MAX_BYTES,
        multiple: true,
        noClick: true,
        // The « Choisir des fichiers » button is the keyboard path; the zone itself is not a tab stop.
        noKeyboard: true,
    });

    const files = data?.files ?? [];
    const indexable = data?.indexableProjectFiles ?? 0;
    const ready = files.filter((f) => f.status === "READY").length;
    const working = files.filter((f) => f.status === "PENDING" || f.status === "PROCESSING").length;

    const doDelete = async () => {
        if (!confirm) return;
        setDeleting(true);
        try {
            await remove(confirm.fileId);
            toast.success("Fichier supprimé", confirm.name);
            setConfirm(null);
        } catch (e) {
            toast.error("Suppression impossible", (e as Error).message);
        } finally {
            setDeleting(false);
        }
    };

    const doReindex = (f: FolderFile) => reindex(f.fileId).catch((e: Error) => toast.error("Réindexation impossible", e.message));

    const doIndexProject = async () => {
        setIndexing(true);
        try {
            await indexProject();
            toast.success("Indexation lancée", `${indexable} document${indexable > 1 ? "s" : ""} du client rejoignent le dossier.`);
        } catch (e) {
            toast.error("Indexation impossible", (e as Error).message);
        } finally {
            setIndexing(false);
        }
    };

    return (
        <div className="space-y-4">
            <div
                {...getRootProps({ role: "region", "aria-label": "Zone de dépôt de fichiers" })}
                className={cn(
                    "relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center",
                    "transition-[border-color,background-color,transform] duration-200 ease-[var(--ease-snappy)]",
                    FOCUS,
                    isDragReject
                        ? "border-danger bg-danger-soft"
                        : isDragActive
                          ? "scale-[1.01] border-primary-400 bg-primary-50/70"
                          : "border-line bg-surface-2/60 hover:border-line-strong hover:bg-surface-2",
                )}
            >
                <input {...getInputProps()} />
                <span
                    className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-2xl shadow-2xs transition-transform duration-200 ease-[var(--ease-snappy)]",
                        isDragActive ? "-translate-y-0.5 bg-primary text-primary-fg" : "bg-surface text-ink-3",
                    )}
                    aria-hidden
                >
                    <UploadCloud className="h-5 w-5" />
                </span>
                <p className="text-sm font-bold text-ink">
                    {isDragReject ? "Format non pris en charge" : isDragActive ? "Dépose pour ajouter au dossier" : "Glisse des documents ici"}
                </p>
                <p className="max-w-sm text-xs leading-relaxed text-ink-3">PDF, Word, Excel, CSV, Markdown ou texte, jusqu&apos;à {formatBytes(FILE_MAX_BYTES)} par fichier. Captain les lit et les cite.</p>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        open();
                    }}
                    className={cn(SECONDARY_BUTTON, "mt-1")}
                >
                    Choisir des fichiers
                </button>
            </div>

            {uploads.length > 0 && (
                <ul className="space-y-1.5" aria-label="Envois en cours">
                    {uploads.map((u) => (
                        <li key={u.key} className={cn(CARD, "flex items-center gap-3 rounded-xl px-3 py-2 motion-safe:animate-ds-pop", u.state === "done" && "opacity-70 transition-opacity duration-700")}>
                            {u.state === "error" ? (
                                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-danger" aria-hidden />
                            ) : u.state === "done" ? (
                                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-success" aria-hidden />
                            ) : (
                                <Spinner className="h-4 w-4 text-ink-3" label="Envoi" />
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-xs font-bold text-ink">{u.name}</span>
                                    <span className={cn("flex-shrink-0 text-[11px] font-semibold tabular-nums", u.state === "error" ? "text-danger-ink" : "text-ink-4")}>
                                        {u.state === "error" ? "Échec" : u.state === "queued" ? "En file" : u.state === "done" ? "Envoyé" : `${Math.round(u.progress * 100)} %`}
                                    </span>
                                </div>
                                {u.state === "error" ? (
                                    <p className="truncate text-[11px] text-danger-ink">{u.error}</p>
                                ) : (
                                    <div
                                        className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3"
                                        role="progressbar"
                                        aria-label={`Envoi de ${u.name}`}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={Math.round(u.progress * 100)}
                                    >
                                        <div
                                            className={cn("h-full rounded-full transition-[width] duration-300 ease-[var(--ease-snappy)]", u.state === "done" ? "bg-success" : "bg-primary-500")}
                                            style={{ width: `${Math.max(u.state === "queued" ? 0 : 3, u.progress * 100)}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                            {(u.state === "error" || u.state === "queued" || u.state === "uploading") && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        aborts.current.get(u.key)?.abort();
                                        setUploads((list) => list.filter((x) => x.key !== u.key));
                                    }}
                                    aria-label={u.state === "error" ? "Masquer" : "Annuler l'envoi"}
                                    className={cn("inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-ink-4 hover:bg-surface-3 hover:text-ink-2", FOCUS)}
                                >
                                    <X className="h-3.5 w-3.5" aria-hidden />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-ink-4" aria-live="polite">
                    {files.length === 0
                        ? "Aucun fichier"
                        : `${files.length} fichier${files.length > 1 ? "s" : ""} · ${ready} prêt${ready > 1 ? "s" : ""}${working ? ` · ${working} en cours d'indexation` : ""}`}
                </p>
                {isClient && indexable > 0 && (
                    <button type="button" className={SECONDARY_BUTTON} onClick={doIndexProject} disabled={indexing}>
                        {indexing ? <Spinner className="h-3.5 w-3.5" label="Indexation" /> : <FolderInput className="h-3.5 w-3.5" aria-hidden />}
                        Indexer les documents du client ({indexable})
                    </button>
                )}
            </div>

            {data?.degraded && (
                <p className="rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-[11px] font-semibold text-warning-ink">Les fichiers ne sont pas encore disponibles sur cette instance.</p>
            )}

            {error ? (
                <div className="flex flex-col items-center gap-3">
                    <EmptyBlock compact icon={FileText} tone="rose" title="Impossible de charger les fichiers" hint={error.message} />
                    <button type="button" className={SECONDARY_BUTTON} onClick={() => void reload()}>
                        Réessayer
                    </button>
                </div>
            ) : isLoading ? (
                <div className="space-y-2" aria-busy="true" aria-label="Chargement des fichiers">
                    {[0, 1, 2].map((i) => (
                        <Shimmer key={i} className="h-14 rounded-xl" />
                    ))}
                </div>
            ) : files.length === 0 ? (
                <EmptyBlock
                    compact
                    icon={FileText}
                    tone="indigo"
                    title="Pas encore de documents"
                    hint="Ajoute des briefs, des comptes rendus ou des exports : Captain s'en sert pour répondre et cite la page exacte."
                />
            ) : (
                <div className={cn(CARD, "overflow-hidden rounded-2xl")}>
                    <div
                        className="hidden grid-cols-[minmax(0,1fr)_132px_56px_72px_minmax(0,120px)_88px_104px] items-center gap-3 border-b border-line-subtle bg-surface-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-ink-4 md:grid"
                        aria-hidden
                    >
                        <span>Nom</span>
                        <span>Statut</span>
                        <span className="text-right">Pages</span>
                        <span className="text-right">Taille</span>
                        <span>Ajouté par</span>
                        <span>Date</span>
                        <span className="text-right">Actions</span>
                    </div>
                    <ul className="divide-y divide-line-subtle" aria-label="Fichiers du dossier">
                        {files.map((f, i) => (
                            <FileRow key={f.fileId} file={f} index={i} onReindex={doReindex} onDelete={setConfirm} />
                        ))}
                    </ul>
                </div>
            )}

            <ConfirmModal
                isOpen={!!confirm}
                onClose={() => setConfirm(null)}
                onConfirm={doDelete}
                isLoading={deleting}
                variant="danger"
                title="Supprimer ce fichier ?"
                message={confirm ? `« ${confirm.name} » sera retiré du dossier et Captain ne pourra plus le citer. Les réponses passées gardent leurs citations.` : ""}
                confirmText="Supprimer"
            />
        </div>
    );
}

function FileRow({ file: f, index, onReindex, onDelete }: { file: FolderFile; index: number; onReindex(f: FolderFile): void; onDelete(f: FolderFile): void }) {
    const status = FILE_STATUS[f.status] ?? FILE_STATUS.PENDING;
    const glyph = fileGlyph(f.name, f.mimeType);
    const busy = f.status === "PENDING" || f.status === "PROCESSING";
    const hint = f.error && (f.status === "FAILED" || f.status === "NEEDS_OCR") ? f.error : status.hint;

    return (
        <li
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-surface-2/60 motion-safe:animate-ds-enter md:grid-cols-[minmax(0,1fr)_132px_56px_72px_minmax(0,120px)_88px_104px]"
            style={{ animationDelay: `${Math.min(index, 7) * 30}ms` }}
        >
            <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-3" aria-hidden>
                    {createElement(glyph, { className: "h-4 w-4" })}
                </span>
                <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-ink" title={f.name}>
                        {f.name}
                    </p>
                    <p className="truncate text-[11px] font-semibold text-ink-4 md:hidden">
                        {[f.pages ? `${f.pages} p.` : null, formatBytes(f.size), f.uploadedByName, relativeTime(f.createdAt)].filter(Boolean).join(" · ")}
                    </p>
                </div>
            </div>
            <div className="order-3 col-span-2 md:order-none md:col-span-1">
                <StatusPill tone={status.tone} pulse={status.pulse} title={hint}>
                    {status.label}
                </StatusPill>
            </div>
            <span className="hidden text-right text-xs font-semibold tabular-nums text-ink-2 md:block">{f.pages ?? "—"}</span>
            <span className="hidden text-right text-xs font-semibold tabular-nums text-ink-2 md:block">{formatBytes(f.size)}</span>
            <span className="hidden truncate text-xs font-semibold text-ink-2 md:block">{f.uploadedByName ?? "—"}</span>
            <time dateTime={f.createdAt} className="hidden text-xs font-semibold text-ink-3 md:block">
                {relativeTime(f.createdAt)}
            </time>
            <div className="flex items-center justify-end gap-0.5">
                {f.url ? (
                    <a
                        href={f.url}
                        download={f.name}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Télécharger ${f.name}`}
                        title="Télécharger"
                        className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink", FOCUS)}
                    >
                        <Download className="h-3.5 w-3.5" aria-hidden />
                    </a>
                ) : (
                    <span className="inline-flex h-8 w-8" aria-hidden />
                )}
                <button
                    type="button"
                    onClick={() => onReindex(f)}
                    disabled={busy || f.status === "UNSUPPORTED"}
                    aria-label={`Réindexer ${f.name}`}
                    title="Réindexer"
                    className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-35", FOCUS)}
                >
                    <RotateCw className={cn("h-3.5 w-3.5", busy && "motion-safe:animate-spin")} aria-hidden />
                </button>
                <button
                    type="button"
                    onClick={() => onDelete(f)}
                    aria-label={`Supprimer ${f.name}`}
                    title="Supprimer"
                    className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger-ink", FOCUS)}
                >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
            </div>
        </li>
    );
}
