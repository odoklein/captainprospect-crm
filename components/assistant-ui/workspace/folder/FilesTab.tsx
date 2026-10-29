"use client";

/**
 * Fichiers tab: drop documents into the folder (per-file progress, cancel),
 * follow their indexing (polled every 3 s while pending, in useFolderFiles),
 * download, re-index, delete, and pull the client's project files in.
 */

import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import {
    AlertTriangle,
    CheckCircle2,
    Download,
    File as FileIcon,
    FileSpreadsheet,
    FileText,
    FolderInput,
    MoreHorizontal,
    RotateCw,
    Trash2,
    UploadCloud,
    X,
} from "lucide-react";
import { FILE_ACCEPT, FILE_MAX_BYTES, type FolderFile } from "@/lib/assistant/api-contract";
import { uploadFolderFile, useFolderFiles } from "@/lib/assistant/client/folder-hooks";
import {
    canReindex,
    fileStatusHint,
    fileStatusView,
    filesSummary,
    formatBytes,
    rejectionReason,
    uploadProgressValue,
    uploadStatusLabel,
    type UploadState,
} from "@/lib/assistant/client/folder-logic";
import { relativeTime } from "@/components/accueil/AccueilUI";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { Progress } from "@/components/ui/shadcn/progress";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { FOCUS_RING } from "@/components/ui/recipes";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { DegradedNotice, ENTER, EmptyState, ErrorState, Spinner, stagger } from "./parts";

const ACCEPT: Record<string, string[]> = Object.fromEntries(Object.entries(FILE_ACCEPT).map(([mime, ext]) => [mime, [...ext]]));
const PARALLEL = 3;
const COLUMNS = "md:grid-cols-[minmax(0,1fr)_150px_52px_72px_minmax(0,120px)_92px_40px]";

interface Upload {
    key: string;
    name: string;
    size: number;
    progress: number;
    state: UploadState;
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
            const batch: Array<{ key: string; file: File }> = files.map((file, i) => ({
                key: `${file.name}-${file.size}-${file.lastModified}-${i}-${Math.random().toString(36).slice(2, 7)}`,
                file,
            }));
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
                        if (controller.signal.aborted) setUploads((list) => list.filter((u) => u.key !== key));
                        else update(key, { state: "error", error: (e as Error).message });
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

    const doReindex = (f: FolderFile) =>
        reindex(f.fileId)
            .then(() => toast.info("Réindexation lancée", f.name))
            .catch((e: Error) => toast.error("Réindexation impossible", e.message));

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
            {/* Dropzone */}
            <div
                {...getRootProps({ role: "region", "aria-label": "Zone de dépôt de fichiers" })}
                data-drag={isDragReject ? "reject" : isDragActive ? "active" : undefined}
                className={cn(
                    "group/drop relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-card border-2 border-dashed px-6 py-9 text-center",
                    "transition-[border-color,background-color,box-shadow] duration-200 ease-snappy",
                    "border-line bg-surface-2 hover:border-line-strong",
                    "data-[drag=active]:border-primary-400 data-[drag=active]:bg-primary-50 data-[drag=active]:shadow-raised",
                    "data-[drag=reject]:border-danger data-[drag=reject]:bg-danger-soft",
                )}
            >
                <input {...getInputProps()} />
                <span
                    className={cn(
                        "flex size-12 items-center justify-center rounded-panel border shadow-2xs transition-[transform,background-color,color,border-color] duration-200 ease-snappy",
                        isDragReject
                            ? "border-danger-line bg-surface text-danger"
                            : isDragActive
                              ? "border-transparent bg-primary text-primary-fg motion-safe:-translate-y-1 motion-safe:scale-105"
                              : "border-line bg-surface text-ink-3 group-hover/drop:text-ink-2",
                    )}
                    aria-hidden
                >
                    {isDragReject ? <AlertTriangle className="size-5" /> : <UploadCloud className="size-5" />}
                </span>
                <p className="mt-1 text-sm font-semibold text-ink" aria-live="polite">
                    {isDragReject ? "Format non pris en charge" : isDragActive ? "Dépose pour ajouter au dossier" : "Glisse des documents ici"}
                </p>
                <p className="max-w-sm text-xs leading-relaxed text-ink-3">
                    PDF, Word, Excel, CSV, Markdown ou texte, jusqu&apos;à {formatBytes(FILE_MAX_BYTES)} par fichier. Captain les lit et les cite.
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={(e) => {
                        e.stopPropagation();
                        open();
                    }}
                >
                    <UploadCloud aria-hidden />
                    Choisir des fichiers
                </Button>
            </div>

            {/* Uploads in flight */}
            {uploads.length > 0 && (
                <Card className="gap-0 py-0">
                    <ul className="divide-y divide-line-subtle" aria-label="Envois en cours">
                        {uploads.map((u) => (
                            <li
                                key={u.key}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-2.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1",
                                    u.state === "done" && "opacity-70 transition-opacity duration-700",
                                )}
                            >
                                <span className="flex size-7 shrink-0 items-center justify-center" aria-hidden>
                                    {u.state === "error" ? (
                                        <AlertTriangle className="size-4 text-danger" />
                                    ) : u.state === "done" ? (
                                        <CheckCircle2 className="size-4 text-success motion-safe:animate-ds-pop" />
                                    ) : (
                                        <Spinner className="text-ink-3" />
                                    )}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="truncate text-[13px] font-medium text-ink">{u.name}</span>
                                        <span className={cn("shrink-0 text-xs tabular-nums", u.state === "error" ? "text-danger-ink" : "text-ink-4")}>
                                            {uploadStatusLabel(u.state, u.progress)} · {formatBytes(u.size)}
                                        </span>
                                    </div>
                                    {u.state === "error" ? (
                                        <p className="truncate text-xs text-danger-ink">{u.error}</p>
                                    ) : (
                                        <Progress
                                            value={uploadProgressValue(u.state, u.progress)}
                                            aria-label={`Envoi de ${u.name}`}
                                            className={cn("mt-1.5 h-1", u.state === "done" && "[&>*]:bg-success")}
                                        />
                                    )}
                                </div>
                                {u.state !== "done" && (
                                    <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={() => {
                                            aborts.current.get(u.key)?.abort();
                                            setUploads((list) => list.filter((x) => x.key !== u.key));
                                        }}
                                        aria-label={u.state === "error" ? `Masquer ${u.name}` : `Annuler l'envoi de ${u.name}`}
                                    >
                                        <X aria-hidden />
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-ink-3" aria-live="polite">
                    {filesSummary(files)}
                </p>
                {isClient && indexable > 0 && (
                    <Button variant="outline" size="sm" onClick={() => void doIndexProject()} disabled={indexing}>
                        {indexing ? <Spinner /> : <FolderInput aria-hidden />}
                        Indexer les documents du client ({indexable})
                    </Button>
                )}
            </div>

            {data?.degraded && <DegradedNotice>Les fichiers ne sont pas encore disponibles sur cette instance.</DegradedNotice>}

            {error ? (
                <ErrorState title="Impossible de charger les fichiers" message={error.message} onRetry={() => void reload()} />
            ) : isLoading ? (
                <Card className="gap-0 py-0" aria-busy="true" aria-label="Chargement des fichiers">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="flex items-center gap-3 border-b border-line-subtle px-4 py-3 last:border-b-0">
                            <Skeleton className="size-8 rounded-[10px]" />
                            <Skeleton className="h-3.5 flex-1 rounded-md" style={{ maxWidth: `${50 - i * 8}%` }} />
                            <Skeleton className="ml-auto h-5 w-20 rounded-chip" />
                        </div>
                    ))}
                </Card>
            ) : files.length === 0 ? (
                <EmptyState
                    compact
                    icon={FileText}
                    tone="primary"
                    title="Pas encore de documents"
                    hint="Ajoute des briefs, des comptes rendus ou des exports : Captain s'en sert pour répondre et cite la page exacte."
                />
            ) : (
                <Card className="gap-0 overflow-hidden py-0">
                    <div
                        className={cn("hidden items-center gap-3 border-b border-line-subtle bg-surface-2 px-4 py-2 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3 md:grid", COLUMNS)}
                        aria-hidden
                    >
                        <span>Nom</span>
                        <span>Statut</span>
                        <span className="text-right">Pages</span>
                        <span className="text-right">Taille</span>
                        <span>Ajouté par</span>
                        <span>Date</span>
                        <span />
                    </div>
                    <ul className="divide-y divide-line-subtle" aria-label="Fichiers du dossier">
                        {files.map((f, i) => (
                            <FileRow key={f.fileId} file={f} index={i} onReindex={doReindex} onDelete={setConfirm} />
                        ))}
                    </ul>
                </Card>
            )}

            <AlertDialog open={!!confirm} onOpenChange={(o) => !o && !deleting && setConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer ce fichier ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirm
                                ? `« ${confirm.name} » sera retiré du dossier et Captain ne pourra plus le citer. Les réponses passées gardent leurs citations.`
                                : ""}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            className={buttonVariants({ variant: "destructive" })}
                            disabled={deleting}
                            onClick={(e) => {
                                e.preventDefault();
                                void doDelete();
                            }}
                        >
                            {deleting ? <Spinner /> : <Trash2 aria-hidden />}
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function StatusBadge({ file }: { file: FolderFile }) {
    const status = fileStatusView(file.status);
    const hint = fileStatusHint(file);
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Badge variant={status.badge} tabIndex={0} className="cursor-default">
                    {status.spinner ? (
                        <Spinner className="size-3" />
                    ) : status.pulse ? (
                        <span className="size-1.5 rounded-full bg-current opacity-70 motion-safe:animate-pulse" aria-hidden />
                    ) : null}
                    {status.label}
                    <span className="sr-only"> : {hint}</span>
                </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-72">{hint}</TooltipContent>
        </Tooltip>
    );
}

function FileRow({ file: f, index, onReindex, onDelete }: { file: FolderFile; index: number; onReindex(f: FolderFile): void; onDelete(f: FolderFile): void }) {
    const glyph = fileGlyph(f.name, f.mimeType);
    const reindexable = canReindex(f);

    return (
        <li
            className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors duration-150 hover:bg-surface-2", COLUMNS, ENTER)}
            style={stagger(index)}
        >
            <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-line bg-surface-2 text-ink-3" aria-hidden>
                    {createElement(glyph, { className: "size-4" })}
                </span>
                <div className="min-w-0">
                    {f.url ? (
                        <a
                            href={f.url}
                            download={f.name}
                            target="_blank"
                            rel="noreferrer"
                            className={cn("block truncate rounded-sm text-[13px] font-medium text-ink hover:text-link hover:underline", FOCUS_RING)}
                            title={f.name}
                        >
                            {f.name}
                        </a>
                    ) : (
                        <p className="truncate text-[13px] font-medium text-ink" title={f.name}>
                            {f.name}
                        </p>
                    )}
                    <p className="truncate text-xs text-ink-4 md:hidden">
                        {[f.pages ? `${f.pages} p.` : null, formatBytes(f.size), f.uploadedByName, relativeTime(f.createdAt)].filter(Boolean).join(" · ")}
                    </p>
                </div>
            </div>
            <div className="order-3 col-span-2 md:order-none md:col-span-1">
                <StatusBadge file={f} />
            </div>
            <span className="hidden text-right text-xs tabular-nums text-ink-2 md:block">{f.pages ?? "—"}</span>
            <span className="hidden text-right text-xs tabular-nums text-ink-2 md:block">{formatBytes(f.size)}</span>
            <span className="hidden truncate text-xs text-ink-2 md:block">{f.uploadedByName ?? "—"}</span>
            <time dateTime={f.createdAt} className="hidden text-xs text-ink-3 md:block">
                {relativeTime(f.createdAt)}
            </time>
            <div className="flex justify-end">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${f.name}`}>
                            <MoreHorizontal aria-hidden />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        {f.url && (
                            <DropdownMenuItem asChild>
                                <a href={f.url} download={f.name} target="_blank" rel="noreferrer">
                                    <Download aria-hidden />
                                    Télécharger
                                </a>
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem disabled={!reindexable} onSelect={() => onReindex(f)}>
                            <RotateCw aria-hidden />
                            Réindexer
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(f)}>
                            <Trash2 aria-hidden />
                            Supprimer
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </li>
    );
}
