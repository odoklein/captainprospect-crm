"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ExternalLink, Link2, Loader2, Plus, Upload, X } from "lucide-react";
import { Button, Card, ConfirmModal, Input, useToast } from "@/components/ui";
import {
  CLIENT_FILES_QUERY_KEY,
} from "@/lib/query-keys";
import {
  DefaultFileRowActions,
  FileDetailsPanel,
  FileDropzone,
  FileEmptyState,
  FileListRow,
  FileSkeletonList,
  FileToolbar,
  UploadQueue,
  type UploadQueueItem,
} from "@/components/files/shared/FileWorkspacePrimitives";
import type { FileListItem } from "@/lib/files/ui";

type ClientFilesResponse = {
  files: FileListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
  };
};

const SORT_OPTIONS = [
  { value: "recent", label: "Plus récents" },
  { value: "name", label: "Nom A-Z" },
  { value: "size", label: "Taille" },
];

const TYPE_OPTIONS = [
  { value: "", label: "Tous les types" },
  { value: "file", label: "Fichiers" },
  { value: "link", label: "Liens" },
  { value: "document", label: "Documents" },
  { value: "image", label: "Images" },
  { value: "video", label: "Vidéos" },
  { value: "audio", label: "Audio" },
];

const TAB_OPTIONS = [
  { value: "all", label: "Tous" },
  { value: "file", label: "Fichiers" },
  { value: "link", label: "Liens" },
];

type LinkFormState = {
  title: string;
  url: string;
  description: string;
};

function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

function buildClientFilesUrl({
  pageParam,
  search,
  type,
}: {
  pageParam: number;
  search: string;
  type: string;
}) {
  const params = new URLSearchParams({
    page: String(pageParam),
    limit: "30",
  });
  if (search) params.set("search", search);
  if (type) params.set("type", type);
  return `/api/client/files?${params.toString()}`;
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.error || "Une erreur est survenue");
  }
  return json.data as T;
}

export default function ClientFilesWorkspace() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const debouncedSearch = useDebouncedValue(deferredSearch);
  const [activeTab, setActiveTab] = useState("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [sort, setSort] = useState("recent");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkForm, setLinkForm] = useState<LinkFormState>({
    title: "",
    url: "",
    description: "",
  });
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<FileListItem | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<FileListItem | null>(null);

  const effectiveType = activeTab !== "all" ? activeTab : typeFilter;

  const filesQuery = useInfiniteQuery({
    queryKey: [...CLIENT_FILES_QUERY_KEY, debouncedSearch, effectiveType],
    queryFn: async ({ pageParam = 1 }) =>
      fetchJson<ClientFilesResponse>(
        buildClientFilesUrl({
          pageParam: Number(pageParam),
          search: debouncedSearch,
          type: effectiveType,
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
  });

  const createLinkMutation = useMutation({
    mutationFn: async (payload: LinkFormState) =>
      fetchJson<FileListItem>("/api/client/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.title.trim(),
          url: payload.url.trim(),
          description: payload.description.trim() || null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLIENT_FILES_QUERY_KEY });
      setLinkForm({ title: "", url: "", description: "" });
      setShowLinkForm(false);
      toast.success("Lien ajouté", "Le lien est disponible dans vos fichiers.");
    },
    onError: (error: Error) => {
      toast.error("Échec du partage", error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) =>
      fetchJson<{ deleted: true }>(`/api/client/files/${fileId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLIENT_FILES_QUERY_KEY });
      if (selectedItem && deleteTarget && selectedItem.id === deleteTarget.id) {
        setSelectedItem(null);
      }
      toast.success("Fichier supprimé");
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast.error("Suppression impossible", error.message);
    },
  });

  const flattenedFiles = useMemo(
    () => filesQuery.data?.pages.flatMap((page) => page.files) ?? [],
    [filesQuery.data],
  );

  const sortedFiles = useMemo(() => {
    const next = [...flattenedFiles];
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
    next.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return next;
  }, [flattenedFiles, sort]);

  const uploadFiles = async (files: File[]) => {
    const baseQueue = files.map<UploadQueueItem>((file) => ({
      id: `${file.name}-${file.lastModified}`,
      name: file.name,
      status: "pending",
    }));
    setUploadQueue((current) => [...baseQueue, ...current]);

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
        await fetchJson("/api/files/upload", {
          method: "POST",
          body: formData,
        });
        setUploadQueue((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, status: "success", detail: "Fichier déposé" }
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

    queryClient.invalidateQueries({ queryKey: CLIENT_FILES_QUERY_KEY });
  };

  const handleAddLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createLinkMutation.mutate(linkForm);
  };

  const handleDownload = (item: FileListItem) => {
    window.open(`/api/files/${item.id}/download`, "_blank", "noopener,noreferrer");
  };

  const emptyState = debouncedSearch || effectiveType
    ? {
        title: "Aucun résultat",
        description:
          "Aucun fichier ne correspond à votre recherche ou à vos filtres.",
        action: (
          <Button
            variant="secondary"
            onClick={() => {
              setSearch("");
              setActiveTab("all");
              setTypeFilter("");
            }}
          >
            Réinitialiser
          </Button>
        ),
      }
    : {
        title: "Aucun fichier partagé",
        description:
          "Déposez un fichier ou ajoutez un lien pour le rendre accessible à votre équipe.",
        action: (
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => setShowLinkForm(true)}>
              Ajouter un lien
            </Button>
          </div>
        ),
      };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mes fichiers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Fichiers et liens visibles par votre équipe dans le CRM.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowLinkForm((value) => !value)}
          >
            {showLinkForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showLinkForm ? "Fermer" : "Ajouter un lien"}
          </Button>
        </div>
      </div>

      <FileDropzone
        onFilesSelected={uploadFiles}
        uploading={uploadQueue.some((item) => item.status === "uploading")}
        title="Déposer vos fichiers"
        subtitle="Glissez-déposez ici vos documents ou utilisez le bouton Parcourir."
      />

      <UploadQueue items={uploadQueue} />

      {showLinkForm ? (
        <Card className="p-4">
          <form className="grid gap-3 lg:grid-cols-[1fr,1fr,auto]" onSubmit={handleAddLink}>
            <Input
              label="Titre"
              value={linkForm.title}
              onChange={(event) =>
                setLinkForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Ex: Dossier Drive"
            />
            <Input
              label="URL"
              type="url"
              value={linkForm.url}
              onChange={(event) =>
                setLinkForm((current) => ({
                  ...current,
                  url: event.target.value,
                }))
              }
              placeholder="https://..."
              required
            />
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={createLinkMutation.isPending}
                className="w-full"
              >
                {createLinkMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Partager
              </Button>
            </div>
            <div className="lg:col-span-3">
              <Input
                label="Note"
                value={linkForm.description}
                onChange={(event) =>
                  setLinkForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Contexte optionnel pour votre équipe"
              />
            </div>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr),320px]">
        <div className="space-y-4">
          <FileToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher un fichier, une note ou un lien..."
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            typeOptions={TYPE_OPTIONS}
            sort={sort}
            onSortChange={setSort}
            sortOptions={SORT_OPTIONS}
            tabs={TAB_OPTIONS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />

          {filesQuery.isLoading ? (
            <FileSkeletonList />
          ) : sortedFiles.length === 0 ? (
            <FileEmptyState {...emptyState} />
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="divide-y divide-slate-100">
                {sortedFiles.map((item) => (
                  <FileListRow
                    key={item.id}
                    item={item}
                    source="client"
                    onOpen={() => {
                      setSelectedItem(item);
                      setDetailsOpen(true);
                    }}
                    secondaryMeta={item.description ?? undefined}
                    actions={
                      <DefaultFileRowActions
                        item={item}
                        onOpen={() => {
                          setSelectedItem(item);
                          setDetailsOpen(true);
                        }}
                        onDownload={
                          item.isLink ? undefined : () => handleDownload(item)
                        }
                        onDelete={() => setDeleteTarget(item)}
                        extraMenuItems={
                          item.externalUrl
                            ? [
                                {
                                  id: "open-link",
                                  label: "Ouvrir le lien",
                                  icon: <ExternalLink className="h-4 w-4" />,
                                  onSelect: () =>
                                    window.open(
                                      item.externalUrl ?? "",
                                      "_blank",
                                      "noopener,noreferrer",
                                    ),
                                },
                              ]
                            : []
                        }
                      />
                    }
                  />
                ))}
              </div>
              {filesQuery.hasNextPage ? (
                <div className="border-t border-slate-100 p-4">
                  <Button
                    variant="secondary"
                    onClick={() => filesQuery.fetchNextPage()}
                    disabled={filesQuery.isFetchingNextPage}
                  >
                    {filesQuery.isFetchingNextPage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
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
            item={selectedItem ?? undefined}
            source="client"
            onClose={() => setDetailsOpen(false)}
            actions={
              selectedItem ? (
                <div className="grid grid-cols-2 gap-2">
                  {selectedItem.externalUrl ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        window.open(
                          selectedItem.externalUrl ?? "",
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      <ExternalLink className="h-4 w-4" />
                      Ouvrir
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => handleDownload(selectedItem)}
                    >
                      <Upload className="h-4 w-4" />
                      Télécharger
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    onClick={() => setDeleteTarget(selectedItem)}
                  >
                    <X className="h-4 w-4" />
                    Supprimer
                  </Button>
                </div>
              ) : undefined
            }
          >
            {selectedItem?.description ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-medium text-slate-500">Note</p>
                <p className="mt-1 text-sm text-slate-700">
                  {selectedItem.description}
                </p>
              </div>
            ) : null}
          </FileDetailsPanel>
        ) : null}
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() =>
          deleteTarget ? deleteMutation.mutate(deleteTarget.id) : undefined
        }
        title="Supprimer le fichier"
        message={
          deleteTarget
            ? `Supprimer ${deleteTarget.originalName || deleteTarget.name} ?`
            : ""
        }
        confirmText="Supprimer"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
