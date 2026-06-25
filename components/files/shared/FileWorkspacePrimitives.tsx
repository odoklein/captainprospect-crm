"use client";

import { useDropzone } from "react-dropzone";
import {
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FilePlus2,
  Info,
  Loader2,
  MoreVertical,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  Fragment,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button, Card, Input, Badge } from "@/components/ui";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
  formatFileDate,
  getFileIconMeta,
  getFileKind,
  getFileTypeLabel,
  type FileListItem,
  type FileSource,
} from "@/lib/files/ui";

export type UploadQueueItem = {
  id: string;
  name: string;
  status: "pending" | "uploading" | "success" | "error";
  detail?: string;
};

export type ActionMenuItem = {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
};

export function FileDropzone({
  onFilesSelected,
  disabled = false,
  uploading = false,
  title = "Déposer des fichiers",
  subtitle = "Glissez-déposez ici ou parcourez vos fichiers.",
  className,
}: {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  uploading?: boolean;
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (accepted) => {
      if (accepted.length) onFilesSelected(accepted);
    },
    disabled,
    noClick: true,
    multiple: true,
    maxSize: MAX_FILE_SIZE_BYTES,
    accept: ACCEPTED_FILE_TYPES,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative rounded-2xl border-2 border-dashed px-6 py-10 transition-colors",
        isDragActive
          ? "border-indigo-400 bg-indigo-50/80"
          : "border-slate-300 bg-white/70 hover:border-indigo-300 hover:bg-white",
        disabled && "cursor-not-allowed opacity-70",
        className,
      )}
      role="region"
      aria-label="Zone de dépôt de fichiers"
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 ring-1 ring-slate-200/70">
          {uploading ? (
            <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          ) : (
            <Upload className="h-7 w-7 text-slate-600" />
          )}
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-slate-900">{title}</p>
          <p className="text-sm text-slate-500">{subtitle}</p>
          <p className="text-xs text-slate-400">
            PDF, DOCX, XLSX, PPTX, images, CSV, TXT. Max 100 MB.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={open}
          disabled={disabled}
          className="focus-visible:ring-2 focus-visible:ring-indigo-500/40"
        >
          Parcourir
        </Button>
      </div>
      {isDragActive && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/10 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-lg">
            <p className="text-sm font-medium text-slate-900">
              Relâchez pour déposer vos fichiers
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function UploadQueue({
  items,
  onRetry,
}: {
  items: UploadQueueItem[];
  onRetry?: (id: string) => void;
}) {
  if (!items.length) return null;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Envois en cours</p>
        <Badge variant="outline">{items.length}</Badge>
      </div>
      <div className="space-y-2" aria-live="polite">
        {items.map((item) => {
          const tone =
            item.status === "error"
              ? "text-red-600"
              : item.status === "success"
                ? "text-emerald-600"
                : "text-slate-500";
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200/70">
                {item.status === "uploading" || item.status === "pending" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                ) : item.status === "success" ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <X className="h-4 w-4 text-red-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {item.name}
                </p>
                <p className={cn("text-xs", tone)}>
                  {item.detail ??
                    (item.status === "uploading"
                      ? "Téléchargement en cours..."
                      : item.status === "success"
                        ? "Terminé"
                        : item.status === "error"
                          ? "Échec de l'envoi"
                          : "En attente")}
                </p>
              </div>
              {item.status === "error" && onRetry ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRetry(item.id)}
                  className="h-8 px-2"
                >
                  Réessayer
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function FileToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Rechercher...",
  typeFilter,
  onTypeFilterChange,
  typeOptions,
  sort,
  onSortChange,
  sortOptions,
  viewMode,
  onViewModeChange,
  tabs,
  activeTab,
  onTabChange,
  extra,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  typeFilter?: string;
  onTypeFilterChange?: (value: string) => void;
  typeOptions?: Array<{ value: string; label: string }>;
  sort?: string;
  onSortChange?: (value: string) => void;
  sortOptions?: Array<{ value: string; label: string }>;
  viewMode?: "list" | "grid";
  onViewModeChange?: (value: "list" | "grid") => void;
  tabs?: Array<{ value: string; label: string }>;
  activeTab?: string;
  onTabChange?: (value: string) => void;
  extra?: ReactNode;
}) {
  return (
    <Card className="space-y-4 p-4">
      {tabs?.length && activeTab && onTabChange ? (
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onTabChange(tab.value)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
                activeTab === tab.value
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="min-w-0 flex-1">
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            icon={<Search className="h-4 w-4 text-slate-400" />}
            aria-label="Recherche de fichiers"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          {typeOptions?.length && onTypeFilterChange ? (
            <ToolbarSelect
              label="Type"
              value={typeFilter ?? ""}
              onChange={onTypeFilterChange}
              options={typeOptions}
            />
          ) : null}
          {sortOptions?.length && onSortChange ? (
            <ToolbarSelect
              label="Tri"
              value={sort ?? ""}
              onChange={onSortChange}
              options={sortOptions}
            />
          ) : null}
          {onViewModeChange ? (
            <div
              className="inline-flex rounded-xl border border-slate-200 bg-white p-1"
              aria-label="Mode d'affichage"
            >
              {(["list", "grid"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onViewModeChange(mode)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
                    viewMode === mode
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  {mode === "list" ? "Liste" : "Grille"}
                </button>
              ))}
            </div>
          ) : null}
          {extra}
        </div>
      </div>
    </Card>
  );
}

function ToolbarSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const id = useId();

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-500" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[42px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FileActionsMenu({
  label,
  items,
}: {
  label: string;
  items: ActionMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          className="absolute right-0 top-[calc(100%+6px)] z-20 w-56 rounded-2xl border border-slate-200 bg-white p-1 shadow-xl"
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                setOpen(false);
                buttonRef.current?.focus();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
                item.tone === "danger"
                  ? "text-red-600 hover:bg-red-50"
                  : "text-slate-700 hover:bg-slate-50",
                item.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FileListRow({
  item,
  source = item.source,
  selected = false,
  selectable = false,
  onSelectChange,
  onOpen,
  primaryMeta,
  secondaryMeta,
  badges,
  actions,
}: {
  item: FileListItem;
  source?: FileSource;
  selected?: boolean;
  selectable?: boolean;
  onSelectChange?: (checked: boolean) => void;
  onOpen?: () => void;
  primaryMeta?: string;
  secondaryMeta?: string;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  const kind = getFileKind(item.mimeType, item.originalName);
  const icon = getFileIconMeta(kind, source);

  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50",
        selected && "bg-indigo-50/70",
      )}
      aria-selected={selected}
    >
      {selectable ? (
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => onSelectChange?.(!selected)}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
            selected
              ? "border-indigo-600 bg-indigo-600 text-white"
              : "border-slate-300 bg-white text-transparent hover:text-slate-400",
          )}
        >
          <Check className="h-3 w-3" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-4 text-left"
      >
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl ring-1",
            icon.bg,
            icon.ring,
          )}
        >
          <icon.Icon className={cn("h-5 w-5", icon.tone)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium text-slate-900">
              {item.originalName || item.name}
            </p>
            {badges}
          </div>
          <p className="truncate text-xs text-slate-500">
            {primaryMeta ??
              `${item.formattedSize} • ${getFileTypeLabel(kind)} • ${formatFileDate(
                item.createdAt,
              )}`}
          </p>
          {secondaryMeta ? (
            <p className="truncate text-xs text-slate-400">{secondaryMeta}</p>
          ) : null}
        </div>
      </button>
      <div className="flex items-center gap-1">{actions}</div>
    </div>
  );
}

export function FileGridCard({
  item,
  source = item.source,
  onOpen,
  footer,
  actions,
}: {
  item: FileListItem;
  source?: FileSource;
  onOpen?: () => void;
  footer?: ReactNode;
  actions?: ReactNode;
}) {
  const kind = getFileKind(item.mimeType, item.originalName);
  const icon = getFileIconMeta(kind, source);

  return (
    <Card className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 gap-3 text-left">
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-2xl ring-1",
              icon.bg,
              icon.ring,
            )}
          >
            <icon.Icon className={cn("h-5 w-5", icon.tone)} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {item.originalName || item.name}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {getFileTypeLabel(kind)}
            </p>
          </div>
        </button>
        {actions}
      </div>
      <div className="space-y-2">
        <p className="text-xs text-slate-500">{item.formattedSize}</p>
        <p className="text-xs text-slate-500">{formatFileDate(item.createdAt)}</p>
        {item.description ? (
          <p className="line-clamp-2 text-xs text-slate-500">
            {item.description}
          </p>
        ) : null}
      </div>
      {footer ? <div className="mt-auto">{footer}</div> : null}
    </Card>
  );
}

export function FileDetailsPanel({
  title = "Détails",
  item,
  source = item?.source ?? "crm",
  onClose,
  actions,
  children,
}: {
  title?: string;
  item?: FileListItem | { id: string; name: string; createdAt?: string | null };
  source?: FileSource;
  onClose?: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const kind =
    item && "mimeType" in item
      ? getFileKind(item.mimeType, item.originalName)
      : "folder";
  const icon = getFileIconMeta(kind, source);

  return (
    <Card className="sticky top-6 space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">Métadonnées et actions</p>
        </div>
        {onClose ? (
          <button
            type="button"
            aria-label="Fermer le panneau de détails"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {!item ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          Sélectionnez un fichier ou un dossier pour voir les détails.
        </div>
      ) : (
        <Fragment>
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-2xl ring-1",
                icon.bg,
                icon.ring,
              )}
            >
              <icon.Icon className={cn("h-5 w-5", icon.tone)} />
            </div>
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-slate-900">
                {item.name}
              </p>
              {"mimeType" in item ? (
                <p className="mt-1 text-xs text-slate-500">
                  {getFileTypeLabel(kind)} • {item.formattedSize}
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DetailStat
              label="Créé"
              value={
                item.createdAt ? formatFileDate(item.createdAt) : "Non disponible"
              }
            />
            <DetailStat
              label="Source"
              value={
                source === "google_drive"
                  ? "Google Drive"
                  : source === "client"
                    ? "Portail client"
                    : "CRM"
              }
            />
          </div>
          {actions}
          {children}
        </Fragment>
      )}
    </Card>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

export function FolderBreadcrumbs({
  items,
  onNavigate,
}: {
  items: Array<{ id: string | null; name: string }>;
  onNavigate: (id: string | null, name: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((item, index) => (
        <Fragment key={`${item.id ?? "root"}-${index}`}>
          {index > 0 ? (
            <ChevronRight className="h-4 w-4 text-slate-300" />
          ) : null}
          <button
            type="button"
            onClick={() => onNavigate(item.id, item.name)}
            className={cn(
              "rounded-lg px-2 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
              index === items.length - 1
                ? "bg-slate-100 text-slate-900"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            {item.name}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

export function FileEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
        <FilePlus2 className="h-6 w-6 text-slate-400" />
      </div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        {description}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function FileSkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0"
        >
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-60" />
          </div>
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function DefaultFileRowActions({
  item,
  onOpen,
  onDownload,
  onDelete,
  extraMenuItems = [],
}: {
  item: FileListItem;
  onOpen?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  extraMenuItems?: ActionMenuItem[];
}) {
  const menuItems: ActionMenuItem[] = [
    ...(onOpen
      ? [
          {
            id: "details",
            label: "Détails",
            icon: <Info className="h-4 w-4" />,
            onSelect: onOpen,
          },
        ]
      : []),
    ...(item.externalUrl
      ? [
          {
            id: "open",
            label: "Ouvrir",
            icon: <ExternalLink className="h-4 w-4" />,
            onSelect: () => window.open(item.externalUrl ?? item.webViewLink ?? "", "_blank", "noopener,noreferrer"),
          },
        ]
      : []),
    ...(onDownload
      ? [
          {
            id: "download",
            label: "Télécharger",
            icon: <Download className="h-4 w-4" />,
            onSelect: onDownload,
          },
        ]
      : []),
    ...extraMenuItems,
    ...(onDelete
      ? [
          {
            id: "delete",
            label: "Supprimer",
            icon: <Trash2 className="h-4 w-4" />,
            onSelect: onDelete,
            tone: "danger" as const,
          },
        ]
      : []),
  ];

  return (
    <div className="flex items-center gap-1">
      {item.externalUrl ? (
        <a
          href={item.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          aria-label="Ouvrir le lien"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      ) : onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          aria-label="Voir les détails"
        >
          <Eye className="h-4 w-4" />
        </button>
      ) : null}
      <FileActionsMenu label="Actions du fichier" items={menuItems} />
    </div>
  );
}
