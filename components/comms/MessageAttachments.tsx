"use client";

// ============================================
// MessageAttachments – icon by default; expand on click or drag (Slack/Linear style)
// ============================================

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";
import { Paperclip, X, FileText, Image } from "lucide-react";

const MAX_FILES = 5;
const MAX_SIZE = 15 * 1024 * 1024; // 15MB
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

interface MessageAttachmentsProps {
    files: File[];
    onChange: (files: File[]) => void;
    disabled?: boolean;
    className?: string;
}

export function MessageAttachments({
    files,
    onChange,
    disabled,
    className,
}: MessageAttachmentsProps) {
    const [expanded, setExpanded] = useState(false);

    const onDrop = useCallback(
        (accepted: File[]) => {
            const next = [...files, ...accepted].slice(0, MAX_FILES);
            onChange(next);
            if (next.length > 0) setExpanded(true);
        },
        [files, onChange]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        disabled,
        maxSize: MAX_SIZE,
        maxFiles: MAX_FILES - files.length,
        accept: ACCEPT,
        noClick: false,
        onDragEnter: () => setExpanded(true),
    });

    const remove = (index: number) => {
        const next = files.filter((_, i) => i !== index);
        onChange(next);
    };

    const isImage = (f: File) => f.type.startsWith("image/");

    const showDropZone = expanded || files.length > 0 || isDragActive;

    return (
        <div className={cn("space-y-2", className)}>
            {files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {files.map((f, i) => (
                        <div
                            key={`${f.name}-${i}`}
                            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm"
                        >
                            {isImage(f) ? (
                                <Image className="h-4 w-4 text-slate-500" />
                            ) : (
                                <FileText className="h-4 w-4 text-slate-500" />
                            )}
                            <span className="max-w-[120px] truncate" title={f.name}>
                                {f.name}
                            </span>
                            <span className="text-xs text-slate-400">
                                ({(f.size / 1024).toFixed(1)} Ko)
                            </span>
                            {!disabled && (
                                <button
                                    type="button"
                                    onClick={() => remove(i)}
                                    className="p-0.5 text-slate-400 hover:text-slate-600 rounded"
                                    aria-label="Retirer"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {files.length < MAX_FILES && (
                <>
                    {showDropZone ? (
                        <div
                            {...getRootProps()}
                            className={cn(
                                "flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm cursor-pointer transition-colors",
                                isDragActive
                                    ? "border-primary-400 bg-primary-50 dark:bg-indigo-900/20"
                                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50",
                                disabled && "opacity-50 pointer-events-none"
                            )}
                        >
                            <input {...getInputProps()} />
                            <Paperclip className="h-4 w-4 text-slate-400 shrink-0" />
                            <span className="text-slate-500 dark:text-slate-400">
                                {isDragActive
                                    ? "Déposer les fichiers…"
                                    : "Glisser des fichiers ou cliquer (max 5, 15 Mo)"}
                            </span>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setExpanded(false);
                                }}
                                className="ml-auto p-1 text-slate-400 hover:text-slate-600 rounded"
                                aria-label="Réduire"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ) : (
                        <div
                            {...getRootProps()}
                            className={cn(
                                "inline-flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition-colors",
                                "text-slate-400 hover:text-primary-600 hover:bg-primary-500/10",
                                disabled && "opacity-50 pointer-events-none"
                            )}
                            title="Joindre des fichiers (max 5, 15 Mo)"
                        >
                            <input {...getInputProps()} />
                            <Paperclip className="h-4 w-4" />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
