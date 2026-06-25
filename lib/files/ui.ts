import {
  Archive,
  Cloud,
  File,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Link2,
  type LucideIcon,
} from "lucide-react";

export type FileSource = "crm" | "client" | "google_drive";
export type FileKind =
  | "pdf"
  | "spreadsheet"
  | "document"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "code"
  | "link"
  | "folder"
  | "unknown";

export interface FileListItem {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  formattedSize: string;
  createdAt: string;
  description?: string | null;
  tags?: string[];
  source: FileSource;
  clientId?: string | null;
  folderId?: string | null;
  uploadedBy?: { id: string; name?: string | null; email?: string | null };
  isLink?: boolean;
  externalUrl?: string | null;
  webViewLink?: string | null;
}

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

export const ACCEPTED_FILE_TYPES: Record<string, string[]> = {
  "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    [".pptx"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
};

type FileIconMeta = {
  Icon: LucideIcon;
  tone: string;
  bg: string;
  ring: string;
};

export function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    units.length - 1,
  );
  const value = size / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatFileDate(dateString: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateString));
}

export function getFileKind(mimeType: string, originalName: string): FileKind {
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType === "text/uri-list") return "link";
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (
    mimeType.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)
  ) {
    return "image";
  }
  if (
    mimeType.startsWith("video/") ||
    ["mp4", "mov", "avi", "webm", "mkv"].includes(ext)
  ) {
    return "video";
  }
  if (
    mimeType.startsWith("audio/") ||
    ["mp3", "wav", "ogg", "m4a"].includes(ext)
  ) {
    return "audio";
  }
  if (
    mimeType.includes("sheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv" ||
    ["xls", "xlsx", "csv"].includes(ext)
  ) {
    return "spreadsheet";
  }
  if (
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    mimeType === "text/plain" ||
    ["doc", "docx", "txt", "rtf"].includes(ext)
  ) {
    return "document";
  }
  if (
    mimeType.includes("zip") ||
    mimeType.includes("archive") ||
    ["zip", "rar", "7z", "tar", "gz"].includes(ext)
  ) {
    return "archive";
  }
  if (
    mimeType.includes("json") ||
    mimeType.includes("javascript") ||
    mimeType.includes("typescript") ||
    mimeType.includes("code") ||
    ["json", "js", "ts", "tsx", "jsx", "css", "html", "md"].includes(ext)
  ) {
    return "code";
  }
  return "unknown";
}

export function getFileTypeLabel(kind: FileKind) {
  switch (kind) {
    case "pdf":
      return "PDF";
    case "spreadsheet":
      return "Tableur";
    case "document":
      return "Document";
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "archive":
      return "Archive";
    case "code":
      return "Code";
    case "link":
      return "Lien";
    case "folder":
      return "Dossier";
    default:
      return "Fichier";
  }
}

export function getFileIconMeta(
  kind: FileKind,
  source: FileSource = "crm",
): FileIconMeta {
  if (kind === "folder") {
    if (source === "google_drive") {
      return {
        Icon: Folder,
        tone: "text-blue-600",
        bg: "bg-blue-50",
        ring: "ring-blue-200/60",
      };
    }
    return {
      Icon: Folder,
      tone: "text-amber-600",
      bg: "bg-amber-50",
      ring: "ring-amber-200/60",
    };
  }

  if (source === "google_drive") {
    return {
      Icon: Cloud,
      tone: "text-blue-600",
      bg: "bg-blue-50",
      ring: "ring-blue-200/60",
    };
  }

  switch (kind) {
    case "pdf":
      return { Icon: FileText, tone: "text-red-600", bg: "bg-red-50", ring: "ring-red-200/60" };
    case "spreadsheet":
      return { Icon: FileSpreadsheet, tone: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200/60" };
    case "document":
      return { Icon: FileText, tone: "text-blue-600", bg: "bg-blue-50", ring: "ring-blue-200/60" };
    case "image":
      return { Icon: FileImage, tone: "text-violet-600", bg: "bg-violet-50", ring: "ring-violet-200/60" };
    case "video":
      return { Icon: FileVideo, tone: "text-rose-600", bg: "bg-rose-50", ring: "ring-rose-200/60" };
    case "audio":
      return { Icon: FileAudio, tone: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-200/60" };
    case "archive":
      return { Icon: Archive, tone: "text-yellow-700", bg: "bg-yellow-50", ring: "ring-yellow-200/60" };
    case "code":
      return { Icon: FileCode, tone: "text-cyan-700", bg: "bg-cyan-50", ring: "ring-cyan-200/60" };
    case "link":
      return { Icon: Link2, tone: "text-indigo-600", bg: "bg-indigo-50", ring: "ring-indigo-200/60" };
    default:
      return { Icon: File, tone: "text-slate-600", bg: "bg-slate-100", ring: "ring-slate-200/60" };
  }
}
