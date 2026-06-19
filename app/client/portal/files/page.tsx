"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useDropzone } from "react-dropzone";
import { Button, useToast } from "@/components/ui";
import { Upload, Trash2, Loader2, FileText, FileImage, FileSpreadsheet, File, FolderOpen, CloudUpload, Link2, ExternalLink, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPT: Record<string, string[]> = {
    "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
    "application/pdf": [".pdf"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "application/vnd.ms-excel": [".xls"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    "application/vnd.ms-powerpoint": [".ppt"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
    "text/plain": [".txt"],
    "text/csv": [".csv"],
};

const MAX_SIZE = 100 * 1024 * 1024; // 100MB

interface ClientFile {
    id: string;
    originalName: string;
    size: number;
    formattedSize: string;
    createdAt: string;
    isLink?: boolean;
    externalUrl?: string | null;
    description?: string | null;
}

function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function getFileIcon(name: string): { icon: React.ElementType; color: string; bg: string } {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (["pdf"].includes(ext)) return { icon: FileText, color: "text-red-500", bg: "bg-red-50" };
    if (["xls", "xlsx", "csv"].includes(ext)) return { icon: FileSpreadsheet, color: "text-emerald-600", bg: "bg-emerald-50" };
    if (["doc", "docx", "txt"].includes(ext)) return { icon: FileText, color: "text-blue-500", bg: "bg-blue-50" };
    if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return { icon: FileImage, color: "text-purple-500", bg: "bg-purple-50" };
    if (["ppt", "pptx"].includes(ext)) return { icon: FileText, color: "text-orange-500", bg: "bg-orange-50" };
    return { icon: File, color: "text-[#6B7194]", bg: "bg-[#F4F5FA]" };
}

export default function ClientPortalFilesPage() {
    const toast = useToast();
    const [files, setFiles] = useState<ClientFile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [uploadingCount, setUploadingCount] = useState(0);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [showLinkForm, setShowLinkForm] = useState(false);
    const [linkTitle, setLinkTitle] = useState("");
    const [linkUrl, setLinkUrl] = useState("");
    const [linkDescription, setLinkDescription] = useState("");
    const [savingLink, setSavingLink] = useState(false);

    const fetchFiles = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/client/files");
            const json = await res.json();
            if (json.success && json.data?.files) {
                setFiles(json.data.files);
            } else {
                setFiles([]);
            }
        } catch {
            toast.error("Erreur", "Impossible de charger les fichiers");
            setFiles([]);
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    const onDrop = useCallback(
        async (acceptedFiles: File[]) => {
            if (acceptedFiles.length === 0) return;
            setUploadingCount((c) => c + acceptedFiles.length);
            let successCount = 0;
            let failCount = 0;
            for (const file of acceptedFiles) {
                try {
                    const formData = new FormData();
                    formData.append("file", file);
                    const res = await fetch("/api/files/upload", { method: "POST", body: formData });
                    const json = await res.json();
                    if (json.success) successCount++;
                    else failCount++;
                } catch {
                    failCount++;
                }
            }
            setUploadingCount((c) => Math.max(0, c - acceptedFiles.length));
            if (successCount > 0) {
                await fetchFiles();
                toast.success("Fichiers déposés", `${successCount} fichier(s) ajouté(s)`);
            }
            if (failCount > 0) {
                toast.error("Erreur", `${failCount} fichier(s) n'ont pas pu être uploadés`);
            }
        },
        [fetchFiles, toast]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        maxSize: MAX_SIZE,
        accept: ACCEPT,
        disabled: uploadingCount > 0,
    });

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const res = await fetch(`/api/client/files/${id}`, { method: "DELETE" });
            const json = await res.json();
            if (json.success) {
                setFiles((prev) => prev.filter((f) => f.id !== id));
                toast.success("Fichier supprimé");
            } else {
                toast.error("Erreur", json.error || "Impossible de supprimer");
            }
        } catch {
            toast.error("Erreur", "Impossible de supprimer le fichier");
        } finally {
            setDeletingId(null);
        }
    };

    const handleAddLink = async (e: FormEvent) => {
        e.preventDefault();
        if (!linkUrl.trim()) {
            toast.error("Lien requis", "Collez une URL à partager");
            return;
        }
        setSavingLink(true);
        try {
            const res = await fetch("/api/client/files", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: linkTitle.trim() || linkUrl.trim(),
                    url: linkUrl.trim(),
                    description: linkDescription.trim() || null,
                }),
            });
            const json = await res.json();
            if (json.success) {
                await fetchFiles();
                setShowLinkForm(false);
                setLinkTitle("");
                setLinkUrl("");
                setLinkDescription("");
                toast.success("Lien partagé", "Le lien est disponible pour votre équipe");
            } else {
                toast.error("Erreur", json.error || "Impossible d'ajouter le lien");
            }
        } catch {
            toast.error("Erreur", "Impossible d'ajouter le lien");
        } finally {
            setSavingLink(false);
        }
    };

    return (
        <div className="min-h-full bg-gradient-to-br from-[#F8F9FC] via-[#F4F6F9] to-[#ECEEF4] p-4 md:p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3" style={{ animation: "filesFadeUp 0.35s ease both" }}>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-200">
                    <FolderOpen className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-[#12122A] tracking-tight">Mes Fichiers</h1>
                    <p className="text-xs text-[#6B7194] mt-0.5">Déposez vos fichiers ou partagez un lien avec votre équipe</p>
                </div>
            </div>

            {/* Drop zone */}
            <div
                {...getRootProps()}
                className={cn(
                    "relative flex flex-col items-center justify-center gap-4 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 overflow-hidden",
                    isDragActive
                        ? "border-[#7C5CFC] bg-indigo-50/80 scale-[1.01]"
                        : "border-[#DDE0EC] bg-white/60 hover:border-[#7C5CFC]/40 hover:bg-white/80",
                    uploadingCount > 0 && "opacity-60 pointer-events-none"
                )}
                style={{ animation: "filesFadeUp 0.35s ease both", animationDelay: "50ms" }}
            >
                {isDragActive && (
                    <div className="absolute inset-0 bg-indigo-500/5 pointer-events-none" />
                )}
                <input {...getInputProps()} />
                <div className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-200",
                    isDragActive ? "bg-indigo-100 shadow-lg shadow-indigo-200/60" : "bg-[#F0F1F9] border border-[#E2E4F0]"
                )}>
                    {uploadingCount > 0 ? (
                        <Loader2 className="w-8 h-8 text-[#7C5CFC] animate-spin" />
                    ) : isDragActive ? (
                        <CloudUpload className="w-8 h-8 text-[#7C5CFC]" />
                    ) : (
                        <Upload className="w-8 h-8 text-[#8B8DAF]" />
                    )}
                </div>
                <div className="text-center">
                    <p className="text-sm font-semibold text-[#12122A]">
                        {uploadingCount > 0
                            ? `Envoi en cours (${uploadingCount} fichier${uploadingCount > 1 ? "s" : ""})…`
                            : isDragActive
                            ? "Relâchez pour déposer"
                            : "Glissez-déposez vos fichiers ici"}
                    </p>
                    <p className="text-xs text-[#8B8BA7] mt-1">
                        ou <span className="text-[#7C5CFC] font-medium">parcourir</span> — PDF, DOCX, XLSX, images · max 100 MB
                    </p>
                </div>
            </div>

            <div className="bg-white/80 rounded-2xl border border-[#E8EBF0] p-4 shadow-sm" style={{ animation: "filesFadeUp 0.35s ease both", animationDelay: "70ms" }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-[#7C5CFC] flex items-center justify-center">
                            <Link2 className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-[#12122A]">Partager un lien</p>
                            <p className="text-xs text-[#6B7194]">Ajoutez une URL en plus des fichiers déposés.</p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowLinkForm((v) => !v)}
                        className="rounded-xl"
                    >
                        {showLinkForm ? <X className="w-4 h-4 mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
                        {showLinkForm ? "Fermer" : "Ajouter un lien"}
                    </Button>
                </div>
                {showLinkForm && (
                    <form onSubmit={handleAddLink} className="mt-4 grid grid-cols-1 md:grid-cols-[1fr,1.3fr,auto] gap-3 items-end">
                        <label className="block">
                            <span className="text-[11px] font-bold text-[#8B8BA7] uppercase tracking-wider">Titre</span>
                            <input
                                value={linkTitle}
                                onChange={(e) => setLinkTitle(e.target.value)}
                                placeholder="Ex: Dossier Drive"
                                className="mt-1 w-full h-10 rounded-xl border border-[#DDE0EC] bg-white px-3 text-sm outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-indigo-100"
                            />
                        </label>
                        <label className="block">
                            <span className="text-[11px] font-bold text-[#8B8BA7] uppercase tracking-wider">Lien</span>
                            <input
                                value={linkUrl}
                                onChange={(e) => setLinkUrl(e.target.value)}
                                placeholder="https://..."
                                type="url"
                                required
                                className="mt-1 w-full h-10 rounded-xl border border-[#DDE0EC] bg-white px-3 text-sm outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-indigo-100"
                            />
                        </label>
                        <Button type="submit" disabled={savingLink} className="h-10 rounded-xl">
                            {savingLink ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Link2 className="w-4 h-4 mr-1.5" />}
                            Partager
                        </Button>
                        <label className="block md:col-span-3">
                            <span className="text-[11px] font-bold text-[#8B8BA7] uppercase tracking-wider">Note optionnelle</span>
                            <input
                                value={linkDescription}
                                onChange={(e) => setLinkDescription(e.target.value)}
                                placeholder="Contexte du lien..."
                                className="mt-1 w-full h-10 rounded-xl border border-[#DDE0EC] bg-white px-3 text-sm outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-indigo-100"
                            />
                        </label>
                    </form>
                )}
            </div>

            {/* File list */}
            <div className="bg-white rounded-2xl border border-[#E8EBF0] overflow-hidden shadow-sm" style={{ animation: "filesFadeUp 0.35s ease both", animationDelay: "90ms" }}>
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-7 h-7 text-[#7C5CFC] animate-spin" />
                    </div>
                ) : files.length === 0 ? (
                    <div className="py-16 px-6 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-[#F4F5FA] flex items-center justify-center mx-auto mb-4">
                            <File className="w-6 h-6 text-[#A0A3BD]" />
                        </div>
                        <p className="text-sm font-semibold text-[#12122A]">Aucun fichier déposé</p>
                        <p className="text-xs text-[#6B7194] mt-1 max-w-xs mx-auto">
                            Déposez des fichiers dans la zone ci-dessus pour les partager avec votre équipe.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="px-5 py-3 border-b border-[#F0F1F7] bg-[#FAFAFA]">
                            <div className="grid grid-cols-[1fr,100px,140px,74px] gap-4">
                                <span className="text-[11px] font-bold text-[#A0A3BD] uppercase tracking-wider">Fichier</span>
                                <span className="text-[11px] font-bold text-[#A0A3BD] uppercase tracking-wider">Taille</span>
                                <span className="text-[11px] font-bold text-[#A0A3BD] uppercase tracking-wider">Déposé le</span>
                                <span />
                            </div>
                        </div>
                        <div className="divide-y divide-[#F5F6FA]">
                            {files.map((f, idx) => {
                                const { icon: FileIcon, color, bg } = f.isLink
                                    ? { icon: Link2, color: "text-indigo-600", bg: "bg-indigo-50" }
                                    : getFileIcon(f.originalName);
                                return (
                                    <div
                                        key={f.id}
                                        className="px-5 py-3.5 hover:bg-[#FAFBFF] transition-colors"
                                        style={{ animation: "filesFadeUp 0.3s ease both", animationDelay: `${90 + idx * 20}ms` }}
                                    >
                                        <div className="grid grid-cols-[1fr,100px,140px,74px] gap-4 items-center">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", bg)}>
                                                    <FileIcon className={cn("w-4 h-4", color)} />
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="block text-sm font-semibold text-[#12122A] truncate">{f.originalName}</span>
                                                    {f.description && (
                                                        <span className="block text-xs text-[#8B8BA7] truncate">{f.description}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-sm text-[#6B7194]">{f.formattedSize}</span>
                                            <span className="text-sm text-[#6B7194]">{formatDate(f.createdAt)}</span>
                                            <div className="flex justify-end gap-1">
                                                {f.isLink && f.externalUrl && (
                                                    <a
                                                        href={f.externalUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="w-8 h-8 p-0 text-[#A0A3BD] hover:text-[#7C5CFC] hover:bg-indigo-50 rounded-lg transition-colors inline-flex items-center justify-center"
                                                        aria-label="Ouvrir le lien"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                    </a>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDelete(f.id)}
                                                    disabled={deletingId === f.id}
                                                    className="w-8 h-8 p-0 text-[#A0A3BD] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    aria-label="Supprimer"
                                                >
                                                    {deletingId === f.id ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="px-5 py-3 border-t border-[#F0F1F7] bg-[#FAFAFA]">
                            <p className="text-xs text-[#A0A3BD]">{files.length} fichier{files.length > 1 ? "s" : ""} · Accessibles par votre équipe dans le CRM</p>
                        </div>
                    </>
                )}
            </div>

            <style jsx global>{`
                @keyframes filesFadeUp {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: none; }
                }
            `}</style>
        </div>
    );
}
