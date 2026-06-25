"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Cloud,
  Download,
  ExternalLink,
  FolderPlus,
  HardDrive,
  Info,
  Link2,
  Loader2,
  Move,
  Pencil,
  RefreshCw,
  Tag,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  useToast,
} from "@/components/ui";
import {
  CLIENTS_QUERY_KEY,
  MANAGER_DRIVE_QUERY_KEY,
  MANAGER_FILES_QUERY_KEY,
  MANAGER_FOLDERS_QUERY_KEY,
} from "@/lib/query-keys";
import {
  DefaultFileRowActions,
  FileActionsMenu,
  FileDetailsPanel,
  FileDropzone,
  FileEmptyState,
  FileGridCard,
  FileListRow,
  FileSkeletonList,
  FileToolbar,
  FolderBreadcrumbs,
  UploadQueue,
  type ActionMenuItem,
  type UploadQueueItem,
} from "@/components/files/shared/FileWorkspacePrimitives";
import type { FileListItem } from "@/lib/files/ui";

type FolderItem = {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  createdAt?: string | null;
  clientId?: string | null;
  _count: { files: number; children: number };
};

type FilesPage = {
  files: Array<
    FileListItem & {
      folder?: { id: string; name: string } | null;
      client?: { id: string; name: string } | null;
    }
  >;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
  };
};

type DriveResponse = {
  folders: Array<{ id: string; name: string }>;
  files: FileListItem[];
  nextPageToken?: string;
};

const TYPE_OPTIONS = [
  { value: "", label: "Tous les types" },
  { value: "document", label: "Documents" },
  { value: "image", label: "Images" },
  { value: "video", label: "Vidéos" },
  { value: "audio", label: "Audio" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "Plus récents" },
  { value: "name", label: "Nom A-Z" },
  { value: "size", label: "Taille" },
  { value: "type", label: "Type" },
];

function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.error || "Une erreur est survenue");
  }
  return json.data as T;
}

function buildFilesUrl({
  pageParam,
  currentFolder,
  clientFilter,
  search,
  typeFilter,
}: {
  pageParam: number;
  currentFolder: string | null;
  clientFilter: string;
  search: string;
  typeFilter: string;
}) {
  const params = new URLSearchParams({
    page: String(pageParam),
    limit: "50",
  });
  if (currentFolder) params.set("folderId", currentFolder);
  if (clientFilter) params.set("clientId", clientFilter);
  if (search) params.set("search", search);
  if (typeFilter) params.set("type", typeFilter);
  return `/api/files?${params.toString()}`;
}

function buildFoldersUrl(currentFolder: string | null, clientFilter: string) {
  const params = new URLSearchParams({
    parentId: currentFolder ?? "root",
  });
  if (clientFilter) params.set("clientId", clientFilter);
  return `/api/folders?${params.toString()}`;
}

function getFolderPseudoFile(folder: FolderItem): FileListItem {
  return {
    id: folder.id,
    name: folder.name,
    originalName: folder.name,
    mimeType: "application/folder",
    size: 0,
    formattedSize: `${folder._count.files} fichier(s)`,
    createdAt: folder.createdAt ?? new Date().toISOString(),
    source: "crm",
  };
}

export default function ManagerFilesWorkspace() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"crm" | "drive">("crm");
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: "Accueil" },
  ]);
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [drivePath, setDrivePath] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: "Mon Drive" },
  ]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const debouncedSearch = useDebouncedValue(deferredSearch);
  const [typeFilter, setTypeFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [sort, setSort] = useState("recent");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [selectedDetails, setSelectedDetails] = useState<FileListItem | FolderItem | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [renameTarget, setRenameTarget] = useState<
    | { kind: "file"; item: FileListItem }
    | { kind: "folder"; item: FolderItem }
    | null
  >(null);
  const [renameValue, setRenameValue] = useState("");

  const [moveTarget, setMoveTarget] = useState<
    | { kind: "file"; ids: string[] }
    | { kind: "folder"; ids: string[] }
    | null
  >(null);
  const [moveDestination, setMoveDestination] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "file"; ids: string[]; label: string }
    | { kind: "folder"; ids: string[]; label: string }
    | null
  >(null);

  const [shareTarget, setShareTarget] = useState<FileListItem | null>(null);
  const [shareClientId, setShareClientId] = useState("");

  const currentLocation = breadcrumbs[breadcrumbs.length - 1]?.name ?? "Accueil";

  const clientsQuery = useQuery({
    queryKey: CLIENTS_QUERY_KEY,
    queryFn: async () => {
      const response = await fetch("/api/clients?limit=200");
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Impossible de charger les clients");
      }
      return (json.data as Array<{ id: string; name: string }>) ?? [];
    },
  });

  const filesQuery = useInfiniteQuery({
    queryKey: [
      ...MANAGER_FILES_QUERY_KEY,
      currentFolder,
      clientFilter,
      debouncedSearch,
      typeFilter,
    ],
    queryFn: ({ pageParam = 1 }) =>
      fetchJson<FilesPage>(
        buildFilesUrl({
          pageParam: Number(pageParam),
          currentFolder,
          clientFilter,
          search: debouncedSearch,
          typeFilter,
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    enabled: activeTab === "crm",
  });

  const foldersQuery = useQuery({
    queryKey: [...MANAGER_FOLDERS_QUERY_KEY, currentFolder, clientFilter],
    queryFn: () => fetchJson<{ folders: FolderItem[] }>(buildFoldersUrl(currentFolder, clientFilter)),
    enabled: activeTab === "crm",
  });

  const driveStatusQuery = useQuery({
    queryKey: MANAGER_DRIVE_QUERY_KEY,
    queryFn: () =>
      fetchJson<{ connected: boolean; email: string | null }>(
        "/api/integrations/google-drive/status",
      ),
  });

  const driveFilesQuery = useQuery({
    queryKey: [...MANAGER_DRIVE_QUERY_KEY, "files", driveFolderId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (driveFolderId) params.set("folderId", driveFolderId);
      return fetchJson<DriveResponse>(
        `/api/integrations/google-drive/files?${params.toString()}`,
      );
    },
    enabled: activeTab === "drive" && Boolean(driveStatusQuery.data?.connected),
  });

  const createFolderMutation = useMutation({
    mutationFn: async () =>
      fetchJson("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentId: currentFolder,
          clientId: clientFilter || null,
        }),
      }),
    onSuccess: () => {
      toast.success("Dossier créé");
      setNewFolderName("");
      setCreateFolderOpen(false);
      queryClient.invalidateQueries({ queryKey: MANAGER_FOLDERS_QUERY_KEY });
    },
    onError: (error: Error) => toast.error("Création impossible", error.message),
  });

  const renameMutation = useMutation({
    mutationFn: async () => {
      if (!renameTarget) return null;
      const endpoint =
        renameTarget.kind === "file"
          ? `/api/files/${renameTarget.item.id}`
          : `/api/folders/${renameTarget.item.id}`;
      return fetchJson(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
    },
    onSuccess: () => {
      toast.success("Nom mis à jour");
      setRenameTarget(null);
      queryClient.invalidateQueries({ queryKey: MANAGER_FILES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: MANAGER_FOLDERS_QUERY_KEY });
    },
    onError: (error: Error) => toast.error("Renommage impossible", error.message),
  });

  const moveMutation = useMutation({
    mutationFn: async () => {
      if (!moveTarget) return null;
      await Promise.all(
        moveTarget.ids.map((id) =>
          fetchJson(
            moveTarget.kind === "file" ? `/api/files/${id}` : `/api/folders/${id}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                moveTarget.kind === "file"
                  ? { folderId: moveDestination }
                  : { parentId: moveDestination },
              ),
            },
          ),
        ),
      );
    },
    onSuccess: () => {
      toast.success("Éléments déplacés");
      setMoveTarget(null);
      setMoveDestination(null);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: MANAGER_FILES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: MANAGER_FOLDERS_QUERY_KEY });
    },
    onError: (error: Error) => toast.error("Déplacement impossible", error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) return null;
      await Promise.all(
        deleteTarget.ids.map((id) =>
          fetchJson(
            deleteTarget.kind === "file" ? `/api/files/${id}` : `/api/folders/${id}`,
            { method: "DELETE" },
          ),
        ),
      );
    },
    onSuccess: () => {
      toast.success("Suppression terminée");
      setDeleteTarget(null);
      setSelectedDetails(null);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: MANAGER_FILES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: MANAGER_FOLDERS_QUERY_KEY });
    },
    onError: (error: Error) => toast.error("Suppression impossible", error.message),
  });

  const tagMutation = useMutation({
    mutationFn: async (payload: { fileId: string; tags: string[] }) =>
      fetchJson(`/api/files/${payload.fileId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: payload.tags }),
      }),
    onSuccess: () => {
      toast.success("Tags enregistrés");
      queryClient.invalidateQueries({ queryKey: MANAGER_FILES_QUERY_KEY });
    },
    onError: (error: Error) => toast.error("Tags impossibles à mettre à jour", error.message),
  });

  const shareMutation = useMutation({
    mutationFn: async () => {
      if (!shareTarget) return null;
      return fetchJson(`/api/files/${shareTarget.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: shareClientId, folderId: null }),
      });
    },
    onSuccess: () => {
      const clientName =
        clientsQuery.data?.find((client) => client.id === shareClientId)?.name ??
        "le client";
      toast.success(
        "Visibilité client mise à jour",
        `Le fichier est maintenant visible pour ${clientName}.`,
      );
      setShareTarget(null);
      setShareClientId("");
      queryClient.invalidateQueries({ queryKey: MANAGER_FILES_QUERY_KEY });
    },
    onError: (error: Error) => toast.error("Partage impossible", error.message),
  });

  const driveConnectMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ authUrl: string }>("/api/integrations/google-drive/connect", {
        method: "POST",
      }),
    onSuccess: (data) => {
      window.location.href = data.authUrl;
    },
    onError: (error: Error) =>
      toast.error("Connexion Google Drive impossible", error.message),
  });

  const driveDisconnectMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/integrations/google-drive/disconnect", { method: "POST" }),
    onSuccess: () => {
      toast.success("Google Drive déconnecté");
      queryClient.invalidateQueries({ queryKey: MANAGER_DRIVE_QUERY_KEY });
      setActiveTab("crm");
    },
    onError: (error: Error) =>
      toast.error("Déconnexion impossible", error.message),
  });

  const driveImportMutation = useMutation({
    mutationFn: async (driveFileId: string) =>
      fetchJson("/api/integrations/google-drive/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId, crmFolderId: currentFolder }),
      }),
    onSuccess: () => {
      toast.success("Fichier importé depuis Drive");
      queryClient.invalidateQueries({ queryKey: MANAGER_FILES_QUERY_KEY });
    },
    onError: (error: Error) => toast.error("Import impossible", error.message),
  });

  const uploadFiles = async (files: File[]) => {
    const queueItems = files.map<UploadQueueItem>((file) => ({
      id: `${file.name}-${file.lastModified}`,
      name: file.name,
      status: "pending",
    }));
    setUploadQueue((current) => [...queueItems, ...current]);

    for (const file of files) {
      const id = `${file.name}-${file.lastModified}`;
      setUploadQueue((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: "uploading" } : item,
        ),
      );

      try {
        const formData = new FormData();
        formData.append("file", file);
        if (activeTab === "drive") {
          if (driveFolderId) formData.append("folderId", driveFolderId);
          await fetchJson("/api/integrations/google-drive/upload", {
            method: "POST",
            body: formData,
          });
        } else {
          if (currentFolder) formData.append("folderId", currentFolder);
          if (clientFilter) formData.append("clientId", clientFilter);
          await fetchJson("/api/files/upload", {
            method: "POST",
            body: formData,
          });
        }

        setUploadQueue((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "success",
                  detail:
                    activeTab === "drive"
                      ? "Envoyé vers Google Drive"
                      : "Ajouté au CRM",
                }
              : item,
          ),
        );
      } catch (error) {
        setUploadQueue((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "error",
                  detail:
                    error instanceof Error ? error.message : "Échec de l'envoi",
                }
              : item,
          ),
        );
      }
    }

    queryClient.invalidateQueries({ queryKey: MANAGER_FILES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: MANAGER_DRIVE_QUERY_KEY });
  };

  const folders = foldersQuery.data?.folders ?? [];
  const files = useMemo(
    () => filesQuery.data?.pages.flatMap((page) => page.files) ?? [],
    [filesQuery.data],
  );

  const sortedFiles = useMemo(() => {
    const next = [...files];
    if (sort === "name") {
      next.sort((a, b) =>
        (a.originalName || a.name).localeCompare(b.originalName || b.name, "fr"),
      );
      return next;
    }
    if (sort === "size") {
      next.sort((a, b) => b.size - a.size);
      return next;
    }
    if (sort === "type") {
      next.sort((a, b) => a.mimeType.localeCompare(b.mimeType, "fr"));
      return next;
    }
    next.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return next;
  }, [files, sort]);

  const clearSelection = () => {
    setSelectedFiles([]);
    setSelectedFolders([]);
  };

  const navigateFolder = (id: string | null, name: string) => {
    setCurrentFolder(id);
    clearSelection();
    setSelectedDetails(null);
    if (id === null) {
      setBreadcrumbs([{ id: null, name: "Accueil" }]);
      return;
    }
    const existingIndex = breadcrumbs.findIndex((crumb) => crumb.id === id);
    if (existingIndex >= 0) {
      setBreadcrumbs((current) => current.slice(0, existingIndex + 1));
      return;
    }
    setBreadcrumbs((current) => [...current, { id, name }]);
  };

  const navigateDriveFolder = (id: string | null, name: string) => {
    setDriveFolderId(id);
    if (id === null) {
      setDrivePath([{ id: null, name: "Mon Drive" }]);
      return;
    }
    const existingIndex = drivePath.findIndex((crumb) => crumb.id === id);
    if (existingIndex >= 0) {
      setDrivePath((current) => current.slice(0, existingIndex + 1));
      return;
    }
    setDrivePath((current) => [...current, { id, name }]);
  };

  const storageUsed = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files],
  );

  const selectionCount = selectedFiles.length + selectedFolders.length;
  const showCta = activeTab === "crm";

  const mainEmptyState =
    activeTab === "drive"
      ? {
          title: "Aucun fichier Drive",
          description:
            "Le dossier Drive courant ne contient aucun fichier importable.",
        }
      : debouncedSearch || typeFilter
        ? {
            title: "Aucun résultat",
            description:
              "Aucun fichier ne correspond à votre recherche ou à vos filtres.",
          }
        : {
            title: "Aucun fichier",
            description:
              "Créez un dossier ou ajoutez un fichier pour démarrer l'espace de travail.",
          };

  const driveFolders = driveFilesQuery.data?.folders ?? [];
  const driveFiles = driveFilesQuery.data?.files ?? [];

  const bulkMoveDisabled = activeTab !== "crm" || selectionCount === 0;

  return (
    <div className="space-y-6 rounded-[28px] border border-slate-200/70 bg-gradient-to-br from-slate-50 via-white to-slate-100/60 p-4 sm:p-6">
      <PageHeader
        title="Fichiers & dossiers"
        subtitle={`Espace de travail: ${currentLocation}`}
        onRefresh={() => {
          filesQuery.refetch();
          foldersQuery.refetch();
          driveFilesQuery.refetch();
          driveStatusQuery.refetch();
        }}
        isRefreshing={
          filesQuery.isFetching ||
          foldersQuery.isFetching ||
          driveFilesQuery.isFetching
        }
        actions={
          showCta ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setCreateFolderOpen(true)}
              >
                <FolderPlus className="h-4 w-4" />
                Nouveau dossier
              </Button>
            </div>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Fichiers CRM</p>
              <p className="text-lg font-semibold text-slate-900">
                {files.length}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 ring-1 ring-indigo-200/60">
              <HardDrive className="h-5 w-5 text-indigo-600" />
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Stockage visible</p>
              <p className="text-lg font-semibold text-slate-900">
                {new Intl.NumberFormat("fr-FR", {
                  maximumFractionDigits: 1,
                }).format(storageUsed / 1024 / 1024)}{" "}
                MB
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-emerald-200/60">
              <Upload className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Google Drive</p>
              <p className="text-lg font-semibold text-slate-900">
                {driveStatusQuery.data?.connected ? "Connecté" : "Non connecté"}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 ring-1 ring-blue-200/60">
              <Cloud className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </Card>
      </div>

      <FileDropzone
        onFilesSelected={uploadFiles}
        uploading={uploadQueue.some((item) => item.status === "uploading")}
        title={
          activeTab === "drive" ? "Envoyer vers Google Drive" : "Déposer des fichiers"
        }
        subtitle={
          activeTab === "drive"
            ? "Les fichiers seront envoyés dans le dossier Drive affiché."
            : "Les fichiers seront ajoutés au dossier CRM courant."
        }
      />

      <UploadQueue items={uploadQueue} />

      <div className="grid gap-6 xl:grid-cols-[280px,minmax(0,1fr),320px]">
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Sources</p>
              <Badge variant={driveStatusQuery.data?.connected ? "success" : "outline"}>
                {driveStatusQuery.data?.connected ? "Drive connecté" : "Drive inactif"}
              </Badge>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("crm")}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${
                  activeTab === "crm"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  CRM
                </span>
              </button>
              <button
                type="button"
                onClick={() => driveStatusQuery.data?.connected && setActiveTab("drive")}
                disabled={!driveStatusQuery.data?.connected}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${
                  activeTab === "drive"
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <span className="inline-flex items-center gap-2">
                  <Cloud className="h-4 w-4" />
                  Drive
                </span>
              </button>
            </div>
            {driveStatusQuery.data?.connected ? (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="truncate text-sm font-medium text-slate-900">
                  {driveStatusQuery.data.email}
                </p>
                <Button
                  variant="ghost"
                  onClick={() => driveDisconnectMutation.mutate()}
                  disabled={driveDisconnectMutation.isPending}
                >
                  Déconnecter
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                onClick={() => driveConnectMutation.mutate()}
                disabled={driveConnectMutation.isPending}
              >
                <Cloud className="h-4 w-4" />
                Connecter Google Drive
              </Button>
            )}
          </Card>

          {activeTab === "crm" ? (
            <Card className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Navigation</p>
                <Badge variant="outline">{folders.length} dossier(s)</Badge>
              </div>
              <FolderBreadcrumbs items={breadcrumbs} onNavigate={navigateFolder} />
              <div className="space-y-1">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => navigateFolder(folder.id, folder.name)}
                    >
                      <p className="truncate text-sm font-medium text-slate-900">
                        {folder.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {folder._count.files} fichier(s) • {folder._count.children} sous-dossier(s)
                      </p>
                    </button>
                    <button
                      type="button"
                      aria-pressed={selectedFolders.includes(folder.id)}
                      onClick={() =>
                        setSelectedFolders((current) =>
                          current.includes(folder.id)
                            ? current.filter((id) => id !== folder.id)
                            : [...current, folder.id],
                        )
                      }
                      className={`ml-3 flex h-5 w-5 items-center justify-center rounded-md border ${
                        selectedFolders.includes(folder.id)
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-slate-300 bg-white text-transparent"
                      }`}
                    >
                      <Tag className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Dossiers Drive</p>
                {driveFilesQuery.isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : null}
              </div>
              <FolderBreadcrumbs items={drivePath} onNavigate={navigateDriveFolder} />
              <div className="space-y-1">
                {driveFolders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left"
                    onClick={() => navigateDriveFolder(folder.id, folder.name)}
                  >
                    <Cloud className="h-4 w-4 text-blue-600" />
                    <span className="truncate text-sm font-medium text-slate-900">
                      {folder.name}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <FileToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher par nom, description ou tags..."
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            typeOptions={TYPE_OPTIONS}
            sort={sort}
            onSortChange={setSort}
            sortOptions={SORT_OPTIONS}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            extra={
              activeTab === "crm" ? (
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-500">
                    Client
                  </label>
                  <select
                    value={clientFilter}
                    onChange={(event) => setClientFilter(event.target.value)}
                    className="h-[42px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  >
                    <option value="">Tous les clients</option>
                    {(clientsQuery.data ?? []).map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null
            }
          />

          {selectionCount > 0 ? (
            <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-sm text-slate-700">
                <span className="font-semibold">{selectionCount}</span> élément(s) sélectionné(s)
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedFiles.length > 0 ? (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        selectedFiles
                          .map((id) => `${window.location.origin}/api/files/${id}/download`)
                          .join("\n"),
                      );
                      toast.success("Liens copiés");
                    }}
                  >
                    <Link2 className="h-4 w-4" />
                    Copier le lien
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  disabled={bulkMoveDisabled}
                  onClick={() =>
                    setMoveTarget(
                      selectedFiles.length
                        ? { kind: "file", ids: selectedFiles }
                        : { kind: "folder", ids: selectedFolders },
                    )
                  }
                >
                  <Move className="h-4 w-4" />
                  Déplacer
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    setDeleteTarget(
                      selectedFiles.length
                        ? {
                            kind: "file",
                            ids: selectedFiles,
                            label: `${selectedFiles.length} fichier(s)`,
                          }
                        : {
                            kind: "folder",
                            ids: selectedFolders,
                            label: `${selectedFolders.length} dossier(s)`,
                          },
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer
                </Button>
              </div>
            </Card>
          ) : null}

          {activeTab === "crm" && (filesQuery.isLoading || foldersQuery.isLoading) ? (
            <FileSkeletonList />
          ) : activeTab === "drive" && driveFilesQuery.isLoading ? (
            <FileSkeletonList />
          ) : activeTab === "crm" && !folders.length && !sortedFiles.length ? (
            <FileEmptyState
              title={mainEmptyState.title}
              description={mainEmptyState.description}
              action={
                <Button variant="primary" onClick={() => setCreateFolderOpen(true)}>
                  <FolderPlus className="h-4 w-4" />
                  Nouveau dossier
                </Button>
              }
            />
          ) : activeTab === "drive" && !driveFiles.length ? (
            <FileEmptyState
              title={mainEmptyState.title}
              description={mainEmptyState.description}
            />
          ) : viewMode === "grid" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {activeTab === "crm"
                ? [
                    ...folders.map((folder) => ({
                      kind: "folder" as const,
                      folder,
                    })),
                    ...sortedFiles.map((file) => ({ kind: "file" as const, file })),
                  ].map((entry) =>
                    entry.kind === "folder" ? (
                      <Card key={entry.folder.id} className="space-y-3 p-4">
                        <button
                          type="button"
                          onClick={() => navigateFolder(entry.folder.id, entry.folder.name)}
                          className="flex min-w-0 items-center gap-3 text-left"
                        >
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 ring-1 ring-amber-200/60">
                            <FolderPlus className="h-5 w-5 text-amber-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {entry.folder.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {entry.folder._count.files} fichier(s)
                            </p>
                          </div>
                        </button>
                        <div className="flex justify-end">
                          <FileActionsMenu
                            label="Actions du dossier"
                            items={folderMenuItems(entry.folder, {
                              onRename: () => {
                                setRenameTarget({ kind: "folder", item: entry.folder });
                                setRenameValue(entry.folder.name);
                              },
                              onMove: () =>
                                setMoveTarget({ kind: "folder", ids: [entry.folder.id] }),
                              onDelete: () =>
                                setDeleteTarget({
                                  kind: "folder",
                                  ids: [entry.folder.id],
                                  label: entry.folder.name,
                                }),
                              onOpen: () => {
                                setSelectedDetails(entry.folder);
                                setDetailsOpen(true);
                              },
                            })}
                          />
                        </div>
                      </Card>
                    ) : (
                      <FileGridCard
                        key={entry.file.id}
                        item={entry.file}
                        onOpen={() => {
                          setSelectedDetails(entry.file);
                          setDetailsOpen(true);
                        }}
                        actions={
                          <DefaultFileRowActions
                            item={entry.file}
                            onOpen={() => {
                              setSelectedDetails(entry.file);
                              setDetailsOpen(true);
                            }}
                            onDownload={() =>
                              window.open(
                                `/api/files/${entry.file.id}/download`,
                                "_blank",
                                "noopener,noreferrer",
                              )
                            }
                            onDelete={() =>
                              setDeleteTarget({
                                kind: "file",
                                ids: [entry.file.id],
                                label: entry.file.originalName || entry.file.name,
                              })
                            }
                            extraMenuItems={fileExtraMenuItems(entry.file, {
                              onRename: () => {
                                setRenameTarget({ kind: "file", item: entry.file });
                                setRenameValue(entry.file.originalName || entry.file.name);
                              },
                              onMove: () =>
                                setMoveTarget({ kind: "file", ids: [entry.file.id] }),
                              onShare: () => setShareTarget(entry.file),
                            })}
                          />
                        }
                      />
                    ),
                  )
                : driveFiles.map((file) => (
                      <FileGridCard
                      key={file.id}
                      item={file}
                      source="google_drive"
                      onOpen={() => {
                        setSelectedDetails(file);
                        setDetailsOpen(true);
                      }}
                      actions={
                        <DefaultFileRowActions
                          item={file}
                          onOpen={() => {
                            setSelectedDetails(file);
                            setDetailsOpen(true);
                          }}
                          extraMenuItems={[
                            {
                              id: "import",
                              label: "Importer dans le CRM",
                              icon: <Download className="h-4 w-4" />,
                              onSelect: () => driveImportMutation.mutate(file.id),
                            },
                          ]}
                        />
                      }
                    />
                  ))}
            </div>
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="divide-y divide-slate-100">
                {activeTab === "crm"
                  ? folders.map((folder) => (
                      <FileListRow
                        key={folder.id}
                        item={getFolderPseudoFile(folder)}
                        selected={selectedFolders.includes(folder.id)}
                        selectable
                        onSelectChange={(checked) =>
                          setSelectedFolders((current) =>
                            checked
                              ? [...current, folder.id]
                              : current.filter((id) => id !== folder.id),
                          )
                        }
                        onOpen={() => navigateFolder(folder.id, folder.name)}
                        primaryMeta={`${folder._count.files} fichier(s) • ${folder._count.children} sous-dossier(s)`}
                        actions={
                          <FileActionsMenu
                            label="Actions du dossier"
                            items={folderMenuItems(folder, {
                              onRename: () => {
                                setRenameTarget({ kind: "folder", item: folder });
                                setRenameValue(folder.name);
                              },
                              onMove: () =>
                                setMoveTarget({ kind: "folder", ids: [folder.id] }),
                              onDelete: () =>
                                setDeleteTarget({
                                  kind: "folder",
                                  ids: [folder.id],
                                  label: folder.name,
                                }),
                              onOpen: () => {
                                setSelectedDetails(folder);
                                setDetailsOpen(true);
                              },
                            })}
                          />
                        }
                      />
                    ))
                  : null}

                {(activeTab === "crm" ? sortedFiles : driveFiles).map((file) => (
                  <FileListRow
                    key={file.id}
                    item={file}
                    source={activeTab === "drive" ? "google_drive" : "crm"}
                    selected={selectedFiles.includes(file.id)}
                    selectable={activeTab === "crm"}
                    onSelectChange={(checked) =>
                      setSelectedFiles((current) =>
                        checked
                          ? [...current, file.id]
                          : current.filter((id) => id !== file.id),
                      )
                    }
                    onOpen={() => {
                      setSelectedDetails(file);
                      setDetailsOpen(true);
                    }}
                    secondaryMeta={
                      activeTab === "crm"
                        ? file.client?.name
                          ? `Visible pour ${file.client.name}`
                          : file.description ?? undefined
                        : file.description ?? undefined
                    }
                    badges={
                      activeTab === "drive" ? (
                        <Badge variant="primary">Drive</Badge>
                      ) : file.clientId ? (
                        <Badge variant="success">Client</Badge>
                      ) : null
                    }
                    actions={
                      activeTab === "crm" ? (
                        <DefaultFileRowActions
                          item={file}
                          onOpen={() => {
                            setSelectedDetails(file);
                            setDetailsOpen(true);
                          }}
                          onDownload={() =>
                            window.open(
                              `/api/files/${file.id}/download`,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                          onDelete={() =>
                            setDeleteTarget({
                              kind: "file",
                              ids: [file.id],
                              label: file.originalName || file.name,
                            })
                          }
                          extraMenuItems={fileExtraMenuItems(file, {
                            onRename: () => {
                              setRenameTarget({ kind: "file", item: file });
                              setRenameValue(file.originalName || file.name);
                            },
                            onMove: () =>
                              setMoveTarget({ kind: "file", ids: [file.id] }),
                            onShare: () => setShareTarget(file),
                          })}
                        />
                      ) : (
                        <DefaultFileRowActions
                          item={file}
                          onOpen={() => {
                            setSelectedDetails(file);
                            setDetailsOpen(true);
                          }}
                          extraMenuItems={[
                            {
                              id: "open-drive",
                              label: "Ouvrir dans Drive",
                              icon: <ExternalLink className="h-4 w-4" />,
                              onSelect: () =>
                                window.open(
                                  file.webViewLink ?? "",
                                  "_blank",
                                  "noopener,noreferrer",
                                ),
                              disabled: !file.webViewLink,
                            },
                            {
                              id: "import-drive",
                              label: "Importer dans le CRM",
                              icon: <Download className="h-4 w-4" />,
                              onSelect: () => driveImportMutation.mutate(file.id),
                            },
                          ]}
                        />
                      )
                    }
                  />
                ))}
              </div>

              {activeTab === "crm" && filesQuery.hasNextPage ? (
                <div className="border-t border-slate-100 p-4">
                  <Button
                    variant="secondary"
                    onClick={() => filesQuery.fetchNextPage()}
                    disabled={filesQuery.isFetchingNextPage}
                  >
                    {filesQuery.isFetchingNextPage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Charger plus
                  </Button>
                </div>
              ) : null}
            </Card>
          )}
        </div>

        {detailsOpen ? (
          <FileDetailsPanel
            item={
              selectedDetails && "originalName" in selectedDetails
                ? selectedDetails
                : selectedDetails
                  ? {
                      id: selectedDetails.id,
                      name: selectedDetails.name,
                      createdAt: selectedDetails.createdAt ?? null,
                    }
                  : undefined
            }
            source={
              activeTab === "drive" && selectedDetails && "originalName" in selectedDetails
                ? "google_drive"
                : "crm"
            }
            onClose={() => setDetailsOpen(false)}
            actions={
              selectedDetails ? (
                "originalName" in selectedDetails ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        window.open(
                          `/api/files/${selectedDetails.id}/download`,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      <Download className="h-4 w-4" />
                      Télécharger
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setShareTarget(selectedDetails)}
                      disabled={activeTab === "drive"}
                    >
                      <UserPlus className="h-4 w-4" />
                      Rendre visible au client
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRenameTarget({ kind: "file", item: selectedDetails });
                        setRenameValue(selectedDetails.originalName || selectedDetails.name);
                      }}
                      disabled={activeTab === "drive"}
                    >
                      <Pencil className="h-4 w-4" />
                      Renommer
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() =>
                        setDeleteTarget({
                          kind: "file",
                          ids: [selectedDetails.id],
                          label: selectedDetails.originalName || selectedDetails.name,
                        })
                      }
                      disabled={activeTab === "drive"}
                    >
                      <Trash2 className="h-4 w-4" />
                      Supprimer
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => navigateFolder(selectedDetails.id, selectedDetails.name)}
                    >
                      <Info className="h-4 w-4" />
                      Ouvrir
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() =>
                        setDeleteTarget({
                          kind: "folder",
                          ids: [selectedDetails.id],
                          label: selectedDetails.name,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      Supprimer
                    </Button>
                  </div>
                )
              ) : undefined
            }
          >
            {selectedDetails && "originalName" in selectedDetails ? (
              <TagEditor
                initialValue={selectedDetails.tags?.join(", ") ?? ""}
                onSave={(value) =>
                  tagMutation.mutate({
                    fileId: selectedDetails.id,
                    tags: value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  })
                }
                disabled={activeTab === "drive" || tagMutation.isPending}
              />
            ) : selectedDetails ? (
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Fichiers" value={String(selectedDetails._count.files)} />
                <Stat
                  label="Sous-dossiers"
                  value={String(selectedDetails._count.children)}
                />
              </div>
            ) : null}
          </FileDetailsPanel>
        ) : null}
      </div>

      <Modal
        isOpen={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        title="Créer un dossier"
        description="Le dossier sera ajouté dans l'emplacement courant."
      >
        <Input
          label="Nom du dossier"
          value={newFolderName}
          onChange={(event) => setNewFolderName(event.target.value)}
          placeholder="Ex: Contrats, Q3, Rapports"
        />
        <ModalFooter>
          <Button variant="ghost" onClick={() => setCreateFolderOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={() => createFolderMutation.mutate()}
            disabled={!newFolderName.trim() || createFolderMutation.isPending}
          >
            Créer
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Renommer"
        description="Mettez à jour le nom affiché dans le CRM."
      >
        <Input
          label="Nouveau nom"
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
        />
        <ModalFooter>
          <Button variant="ghost" onClick={() => setRenameTarget(null)}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={() => renameMutation.mutate()}
            disabled={!renameValue.trim() || renameMutation.isPending}
          >
            Enregistrer
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={Boolean(moveTarget)}
        onClose={() => setMoveTarget(null)}
        title="Déplacer"
        description="Choisissez le dossier de destination dans le contexte courant."
      >
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setMoveDestination(null)}
            className={`w-full rounded-xl border px-3 py-2 text-left ${
              moveDestination === null ? "border-indigo-600 bg-indigo-50" : "border-slate-200"
            }`}
          >
            Racine
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => setMoveDestination(folder.id)}
              className={`w-full rounded-xl border px-3 py-2 text-left ${
                moveDestination === folder.id
                  ? "border-indigo-600 bg-indigo-50"
                  : "border-slate-200"
              }`}
            >
              {folder.name}
            </button>
          ))}
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setMoveTarget(null)}>
            Annuler
          </Button>
          <Button variant="primary" onClick={() => moveMutation.mutate()}>
            Déplacer
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={Boolean(shareTarget)}
        onClose={() => setShareTarget(null)}
        title="Rendre visible au client"
        description="Le fichier apparaîtra dans le portail du client choisi."
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Client
          </label>
          <select
            value={shareClientId}
            onChange={(event) => setShareClientId(event.target.value)}
            className="h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          >
            <option value="">Choisir un client</option>
            {(clientsQuery.data ?? []).map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShareTarget(null)}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={() => shareMutation.mutate()}
            disabled={!shareClientId || shareMutation.isPending}
          >
            <UserPlus className="h-4 w-4" />
            Rendre visible
          </Button>
        </ModalFooter>
      </Modal>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate()}
        title="Supprimer"
        message={
          deleteTarget
            ? `Supprimer ${deleteTarget.label} ? Cette action est irréversible.`
            : ""
        }
        confirmText="Supprimer"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function TagEditor({
  initialValue,
  onSave,
  disabled,
}: {
  initialValue: string;
  onSave: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-medium text-slate-500">Tags</p>
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Ex: contrat, urgent, Q3"
        disabled={disabled}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onSave(value)}
        disabled={disabled}
      >
        <Tag className="h-4 w-4" />
        Enregistrer les tags
      </Button>
    </div>
  );
}

function folderMenuItems(
  folder: FolderItem,
  handlers: {
    onOpen: () => void;
    onRename: () => void;
    onMove: () => void;
    onDelete: () => void;
  },
): ActionMenuItem[] {
  return [
    {
      id: "details",
      label: "Détails",
      icon: <Info className="h-4 w-4" />,
      onSelect: handlers.onOpen,
    },
    {
      id: "rename",
      label: "Renommer",
      icon: <Pencil className="h-4 w-4" />,
      onSelect: handlers.onRename,
    },
    {
      id: "move",
      label: "Déplacer",
      icon: <Move className="h-4 w-4" />,
      onSelect: handlers.onMove,
    },
    {
      id: "delete",
      label: "Supprimer",
      icon: <Trash2 className="h-4 w-4" />,
      onSelect: handlers.onDelete,
      tone: "danger",
      disabled: folder._count.files > 0 || folder._count.children > 0,
    },
  ];
}

function fileExtraMenuItems(
  file: FileListItem,
  handlers: {
    onRename: () => void;
    onMove: () => void;
    onShare: () => void;
  },
): ActionMenuItem[] {
  return [
    {
      id: "copy-link",
      label: "Copier le lien",
      icon: <Link2 className="h-4 w-4" />,
      onSelect: async () => {
        await navigator.clipboard.writeText(
          `${window.location.origin}/api/files/${file.id}/download`,
        );
      },
    },
    {
      id: "share-client",
      label: "Rendre visible au client",
      icon: <UserPlus className="h-4 w-4" />,
      onSelect: handlers.onShare,
    },
    {
      id: "rename",
      label: "Renommer",
      icon: <Pencil className="h-4 w-4" />,
      onSelect: handlers.onRename,
    },
    {
      id: "move",
      label: "Déplacer",
      icon: <Move className="h-4 w-4" />,
      onSelect: handlers.onMove,
    },
  ];
}
