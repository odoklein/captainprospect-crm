"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// FILE UPLOAD COMPONENT
// ============================================

interface FileUploadProps {
    accept?: string;
    maxSize?: number; // in MB
    multiple?: boolean;
    disabled?: boolean;
    label?: string;
    error?: string;
    onFilesSelected: (files: File[]) => void;
    className?: string;
}

export function FileUpload({
    accept = "*",
    maxSize = 10,
    multiple = false,
    disabled = false,
    label,
    error,
    onFilesSelected,
    className,
}: FileUploadProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [fileErrors, setFileErrors] = useState<string[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    const validateFile = useCallback(
        (file: File): string | null => {
            // Check file type
            if (accept !== "*") {
                const acceptedTypes = accept.split(",").map((t) => t.trim());
                const fileType = file.type;
                const fileExt = `.${file.name.split(".").pop()?.toLowerCase()}`;

                const isValidType = acceptedTypes.some(
                    (type) =>
                        type === fileType ||
                        type === fileExt ||
                        (type.endsWith("/*") && fileType.startsWith(type.replace("/*", "")))
                );

                if (!isValidType) {
                    return `Type de fichier non supporté: ${file.name}`;
                }
            }

            // Check file size
            const fileSizeMB = file.size / (1024 * 1024);
            if (fileSizeMB > maxSize) {
                return `Fichier trop volumineux: ${file.name} (max ${maxSize}MB)`;
            }

            return null;
        },
        [accept, maxSize]
    );

    const handleFiles = useCallback(
        (fileList: FileList | null) => {
            if (!fileList || disabled) return;

            const newFiles: File[] = [];
            const errors: string[] = [];

            Array.from(fileList).forEach((file) => {
                const error = validateFile(file);
                if (error) {
                    errors.push(error);
                } else {
                    newFiles.push(file);
                }
            });

            const selectedFiles = multiple ? [...files, ...newFiles] : newFiles.slice(0, 1);
            setFiles(selectedFiles);
            setFileErrors(errors);
            onFilesSelected(selectedFiles);
        },
        [disabled, files, multiple, onFilesSelected, validateFile]
    );

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
    };

    const removeFile = (index: number) => {
        const newFiles = files.filter((_, i) => i !== index);
        setFiles(newFiles);
        onFilesSelected(newFiles);
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div className={cn("space-y-2", className)}>
            {label && (
                <label className="block text-sm font-medium text-ink-2">
                    {label}
                </label>
            )}

            {/* Drop Zone */}
            <div
                onClick={() => inputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                    "relative flex flex-col items-center justify-center gap-3 p-8",
                    "border-2 border-dashed rounded-xl cursor-pointer transition-all",
                    isDragging
                        ? "border-primary-500 bg-primary-50"
                        : error
                            ? "border-red-500 bg-red-50/50"
                            : "border-line hover:border-line-strong bg-surface-2",
                    disabled && "opacity-50 cursor-not-allowed"
                )}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    multiple={multiple}
                    disabled={disabled}
                    onChange={(e) => handleFiles(e.target.files)}
                    className="hidden"
                />

                <div
                    className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center",
                        isDragging ? "bg-primary-100" : "bg-surface shadow-sm"
                    )}
                >
                    <Upload
                        className={cn(
                            "w-6 h-6",
                            isDragging ? "text-primary-500" : "text-ink-4"
                        )}
                    />
                </div>

                <div className="text-center">
                    <p className="text-sm text-ink-2">
                        <span className="text-primary-500 font-medium">
                            Cliquez pour sélectionner
                        </span>{" "}
                        ou glissez-déposez
                    </p>
                    <p className="text-xs text-ink-4 mt-1">
                        {accept === "*" ? "Tous types" : accept} · Max {maxSize}MB
                    </p>
                </div>
            </div>

            {/* Error Message */}
            {(error || fileErrors.length > 0) && (
                <div className="space-y-1">
                    {error && (
                        <p className="text-sm text-red-500 flex items-center gap-1">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </p>
                    )}
                    {fileErrors.map((err, i) => (
                        <p key={i} className="text-sm text-red-500 flex items-center gap-1">
                            <AlertCircle className="w-4 h-4" />
                            {err}
                        </p>
                    ))}
                </div>
            )}

            {/* File List */}
            {files.length > 0 && (
                <div className="space-y-2">
                    {files.map((file, index) => (
                        <div
                            key={`${file.name}-${index}`}
                            className="flex items-center gap-3 p-3 bg-surface-2 border border-line rounded-lg"
                        >
                            <div className="w-8 h-8 rounded-lg bg-surface shadow-sm flex items-center justify-center">
                                <FileText className="w-4 h-4 text-ink-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-ink truncate">{file.name}</p>
                                <p className="text-xs text-ink-3">
                                    {formatFileSize(file.size)}
                                </p>
                            </div>
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            <button
                                onClick={() => removeFile(index)}
                                className="p-1 text-ink-4 hover:text-ink-2 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default FileUpload;
