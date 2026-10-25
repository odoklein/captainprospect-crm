"use client";

// ============================================
// TEMPLATES — the team's email library (/manager/emails/templates)
// Templates assigned to a mission show up in the SDR quick-send (call screen).
// Deep links: ?template=<id> opens the editor, ?new=1 a blank one,
// ?mission=<id> filters the library (and preselects that mission on ?new=1).
// ============================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
    Copy,
    Eye,
    FileText,
    LayoutGrid,
    List,
    Lock,
    Plus,
    RotateCcw,
    Search,
    Target,
    Trash2,
    Users,
} from "lucide-react";
import {
    Badge,
    Button,
    Callout,
    ConfirmModal,
    EmptyState,
    IconButton,
    Input,
    Modal,
    SegmentedControl,
    Select,
    Skeleton,
    useToast,
} from "@/components/ui";
import { EmailHubPage } from "@/components/email/EmailHubPage";
import { TEMPLATE_CATEGORIES, normalizeTemplateCategory, templateCategoryLabel, type TemplateCategory } from "./template-categories";
import { previewDocument, snippet, substituteSample } from "./template-utils";
import { TemplateEditor } from "./TemplateEditor";
import type { EmailTemplateRow, MissionOption } from "./types";

const CATEGORY_TONE: Record<TemplateCategory, "primary" | "warning" | "info" | "success" | "default"> = {
    OUTREACH: "primary",
    FOLLOW_UP: "warning",
    NURTURE: "info",
    CLOSING: "success",
    OTHER: "default",
};

const NO_MISSION = "__none";

type SortKey = "recent" | "used" | "name";
type ViewMode = "grid" | "list";

export function CategoryBadge({ category }: { category: string }) {
    const value = normalizeTemplateCategory(category);
    return (
        <Badge size="sm" variant={CATEGORY_TONE[value]}>
            {templateCategoryLabel(value)}
        </Badge>
    );
}

function relative(date: string | null): string | null {
    if (!date) return null;
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr });
}

function UsageLine({ template }: { template: EmailTemplateRow }) {
    if (!template.useCount) return <span className="text-ink-4">Jamais utilisé</span>;
    return (
        <span>
            {template.useCount} envoi{template.useCount > 1 ? "s" : ""}
            {template.lastUsedAt && <span className="text-ink-4"> · dernier {relative(template.lastUsedAt)}</span>}
        </span>
    );
}

function MissionChips({ template, max = 2 }: { template: EmailTemplateRow; max?: number }) {
    const missions = template.missionTemplates.map((mt) => mt.mission);
    if (missions.length === 0) {
        return <span className="text-xs font-medium text-warning-ink">Aucune mission</span>;
    }
    return (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
            {missions.slice(0, max).map((m) => (
                <span
                    key={m.id}
                    title={m.client?.name ? `${m.name} · ${m.client.name}` : m.name}
                    className="inline-flex h-5 max-w-[160px] items-center gap-1 truncate rounded-chip border border-line bg-surface-2 px-1.5 text-[11px] font-medium text-ink-2"
                >
                    <Target className="size-3 shrink-0 text-ink-4" aria-hidden />
                    <span className="truncate">{m.name}</span>
                </span>
            ))}
            {missions.length > max && (
                <span className="text-[11px] font-medium text-ink-3" title={missions.slice(max).map((m) => m.name).join(", ")}>
                    +{missions.length - max}
                </span>
            )}
        </div>
    );
}

// ============================================
// PREVIEW MODAL (from a card, without opening the editor)
// ============================================

function PreviewModal({ template, onClose, onEdit }: { template: EmailTemplateRow | null; onClose: () => void; onEdit: () => void }) {
    if (!template) return null;
    return (
        <Modal isOpen onClose={onClose} title={template.name} description="Aperçu avec un contact fictif (Jean Dupont, Acme SAS)." size="lg">
            <div className="overflow-hidden rounded-panel border border-line">
                <div className="border-b border-line bg-surface-2 px-4 py-2.5 text-sm">
                    <span className="text-ink-3">Objet : </span>
                    <span className="font-medium text-ink">{substituteSample(template.subject) || "(vide)"}</span>
                </div>
                <iframe
                    title="Aperçu du template"
                    sandbox=""
                    srcDoc={previewDocument(substituteSample(template.bodyHtml))}
                    className="block h-[420px] w-full bg-surface"
                />
            </div>
            <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose}>Fermer</Button>
                <Button onClick={onEdit}>Modifier</Button>
            </div>
        </Modal>
    );
}

// ============================================
// CARD + ROW
// ============================================

interface ItemProps {
    template: EmailTemplateRow;
    onOpen: () => void;
    onPreview: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    busy: boolean;
}

function ItemActions({ onPreview, onDuplicate, onDelete, busy }: Omit<ItemProps, "template" | "onOpen">) {
    return (
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <IconButton icon={Eye} label="Aperçu" size="xs" onClick={onPreview} />
            <IconButton icon={Copy} label="Dupliquer" size="xs" onClick={onDuplicate} isLoading={busy} />
            <IconButton icon={Trash2} label="Supprimer" size="xs" variant="danger" onClick={onDelete} />
        </div>
    );
}

function TemplateCard(props: ItemProps) {
    const { template, onOpen } = props;
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(e) => {
                if (e.key === "Enter") onOpen();
            }}
            className="group flex cursor-pointer flex-col rounded-panel border border-line bg-surface p-4 shadow-2xs outline-none transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-xs focus-visible:ring-2 focus-visible:ring-focus"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                    <CategoryBadge category={template.category} />
                    {!template.isShared && (
                        <span title="Privé : visible par vous seul" className="text-ink-4">
                            <Lock className="size-3.5" aria-label="Privé" />
                        </span>
                    )}
                </div>
                <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <ItemActions {...props} />
                </div>
            </div>
            <h3 className="mt-2.5 truncate text-sm font-semibold text-ink">{template.name}</h3>
            <p className="mt-0.5 truncate text-xs text-ink-2">
                <span className="text-ink-4">Objet : </span>
                {template.subject}
            </p>
            <p className="mt-2 line-clamp-3 min-h-[3.6em] text-xs leading-relaxed text-ink-3">
                {snippet(template.bodyHtml) || <span className="italic text-ink-4">Corps vide</span>}
            </p>
            <div className="mt-3 border-t border-line-subtle pt-3">
                <MissionChips template={template} />
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-3">
                    <UsageLine template={template} />
                    <span className="truncate text-ink-4">{template.createdBy?.name}</span>
                </div>
            </div>
        </div>
    );
}

function TemplateRow(props: ItemProps) {
    const { template, onOpen } = props;
    return (
        <tr onClick={onOpen} className="group cursor-pointer border-t border-line-subtle transition-colors hover:bg-surface-2">
            <td className="max-w-0 px-4 py-3">
                <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-ink">{template.name}</p>
                    {!template.isShared && <Lock className="size-3 shrink-0 text-ink-4" aria-label="Privé" />}
                </div>
                <p className="truncate text-xs text-ink-3">{template.subject}</p>
            </td>
            <td className="px-4 py-3"><CategoryBadge category={template.category} /></td>
            <td className="max-w-[260px] px-4 py-3"><MissionChips template={template} max={2} /></td>
            <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-2"><UsageLine template={template} /></td>
            <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-3">{relative(template.updatedAt)}</td>
            <td className="px-2 py-3"><ItemActions {...props} /></td>
        </tr>
    );
}

// ============================================
// MAIN VIEW
// ============================================

export default function TemplatesView() {
    const toast = useToast();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
    const [missions, setMissions] = useState<MissionOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [category, setCategory] = useState<string>("");
    const [sort, setSort] = useState<SortKey>("recent");
    const [view, setView] = useState<ViewMode>("grid");

    const [previewing, setPreviewing] = useState<EmailTemplateRow | null>(null);
    const [deleting, setDeleting] = useState<EmailTemplateRow | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

    const templateParam = searchParams.get("template");
    const isNew = searchParams.get("new") === "1";
    const missionFilter = searchParams.get("mission") ?? "";

    // ---------- URL state ----------
    const setParams = useCallback(
        (patch: Record<string, string | null>) => {
            const next = new URLSearchParams(searchParams.toString());
            for (const [key, value] of Object.entries(patch)) {
                if (value === null || value === "") next.delete(key);
                else next.set(key, value);
            }
            const qs = next.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams],
    );

    const openEditor = (id: string) => setParams({ template: id, new: null });
    const openNew = () => setParams({ template: null, new: "1" });
    const closeEditor = () => setParams({ template: null, new: null });

    // ---------- data ----------
    const fetchTemplates = useCallback(async () => {
        setLoadError(null);
        try {
            const res = await fetch("/api/email/templates?withMissions=1");
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Chargement impossible");
            setTemplates(json.data ?? []);
            setMissions(json.missions ?? []);
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Chargement impossible");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTemplates();
    }, [fetchTemplates]);

    const editing = templateParam ? templates.find((t) => t.id === templateParam) ?? null : null;

    // A deep link to a template that is not in the library (deleted, private to someone else).
    useEffect(() => {
        if (!isLoading && !loadError && templateParam && !editing) {
            toast.error("Template introuvable", "Il a peut-être été supprimé ou n'est pas partagé.");
            setParams({ template: null });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, loadError, templateParam, editing]);

    // ---------- derived ----------
    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const t of templates) {
            const c = normalizeTemplateCategory(t.category);
            counts[c] = (counts[c] ?? 0) + 1;
        }
        return counts;
    }, [templates]);

    const unassignedCount = useMemo(() => templates.filter((t) => t.missionTemplates.length === 0).length, [templates]);
    const usedCount = useMemo(() => templates.filter((t) => t.useCount > 0).length, [templates]);

    const missionOptions = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const t of templates) for (const mt of t.missionTemplates) counts[mt.missionId] = (counts[mt.missionId] ?? 0) + 1;
        // Missions with templates first, then the rest alphabetically.
        const sorted = [...missions].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || a.name.localeCompare(b.name, "fr"));
        return [
            { value: "", label: "Toutes les missions" },
            { value: NO_MISSION, label: `Sans mission (${unassignedCount})` },
            ...sorted.map((m) => ({
                value: m.id,
                label: `${m.name}${m.client?.name ? ` · ${m.client.name}` : ""} (${counts[m.id] ?? 0})`,
            })),
        ];
    }, [missions, templates, unassignedCount]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        const rows = templates.filter((t) => {
            if (category && normalizeTemplateCategory(t.category) !== category) return false;
            if (missionFilter === NO_MISSION && t.missionTemplates.length > 0) return false;
            if (missionFilter && missionFilter !== NO_MISSION && !t.missionTemplates.some((mt) => mt.missionId === missionFilter)) return false;
            if (q) {
                const hay = `${t.name} ${t.subject} ${t.missionTemplates.map((mt) => mt.mission.name).join(" ")}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
        return rows.sort((a, b) => {
            if (sort === "name") return a.name.localeCompare(b.name, "fr");
            if (sort === "used") {
                return b.useCount - a.useCount
                    || (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "")
                    || b.updatedAt.localeCompare(a.updatedAt);
            }
            return b.updatedAt.localeCompare(a.updatedAt);
        });
    }, [templates, search, category, missionFilter, sort]);

    const hasFilters = Boolean(search || category || missionFilter);
    const resetFilters = () => {
        setSearch("");
        setCategory("");
        setParams({ mission: null });
    };

    // ---------- actions ----------
    const handleDuplicate = async (template: EmailTemplateRow) => {
        setDuplicatingId(template.id);
        try {
            const res = await fetch("/api/email/templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: `${template.name} (copie)`,
                    subject: template.subject,
                    bodyHtml: template.bodyHtml,
                    bodyText: template.bodyText,
                    category: template.category,
                    isShared: template.isShared,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Duplication impossible");
            setTemplates((prev) => [json.data, ...prev]);
            toast.success("Template dupliqué", "La copie n'est assignée à aucune mission.");
            openEditor(json.data.id);
        } catch (err) {
            toast.error("Duplication impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setDuplicatingId(null);
        }
    };

    const handleDelete = async () => {
        if (!deleting) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/email/templates/${deleting.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || "Suppression impossible");
            setTemplates((prev) => prev.filter((t) => t.id !== deleting.id));
            if (templateParam === deleting.id) closeEditor();
            toast.success("Template supprimé", deleting.name);
            setDeleting(null);
        } catch (err) {
            toast.error("Suppression impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSaved = (saved: EmailTemplateRow) => {
        setTemplates((prev) => {
            const exists = prev.some((t) => t.id === saved.id);
            return exists ? prev.map((t) => (t.id === saved.id ? saved : t)) : [saved, ...prev];
        });
    };

    const itemProps = (t: EmailTemplateRow): ItemProps => ({
        template: t,
        onOpen: () => openEditor(t.id),
        onPreview: () => setPreviewing(t),
        onDuplicate: () => handleDuplicate(t),
        onDelete: () => setDeleting(t),
        busy: duplicatingId === t.id,
    });

    const editorOpen = isNew || Boolean(editing);
    const initialMissionIds = isNew && missionFilter && missionFilter !== NO_MISSION ? [missionFilter] : [];

    // ---------- render ----------
    return (
        <EmailHubPage
            title="Templates"
            description="Les emails types de l'équipe. Assignés à une mission, ils apparaissent dans l'envoi rapide de l'écran d'appel des SDR."
            actions={
                <Button leftIcon={<Plus className="size-4" />} onClick={openNew}>
                    Nouveau template
                </Button>
            }
        >
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="w-full sm:w-72">
                    <Input
                        size="sm"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Rechercher un nom, un objet, une mission…"
                        icon={<Search className="size-4" />}
                        aria-label="Rechercher un template"
                    />
                </div>
                <Select
                    className="w-44"
                    value={category}
                    onChange={setCategory}
                    options={[
                        { value: "", label: `Toutes catégories (${templates.length})` },
                        ...TEMPLATE_CATEGORIES.map((c) => ({ value: c.value, label: `${c.label} (${categoryCounts[c.value] ?? 0})` })),
                    ]}
                />
                <Select
                    className="w-64"
                    value={missionFilter}
                    onChange={(v) => setParams({ mission: v || null })}
                    options={missionOptions}
                    searchable
                />
                <Select
                    className="w-40"
                    value={sort}
                    onChange={(v) => setSort(v as SortKey)}
                    options={[
                        { value: "recent", label: "Modifiés récemment" },
                        { value: "used", label: "Plus utilisés" },
                        { value: "name", label: "Nom (A → Z)" },
                    ]}
                />
                {hasFilters && (
                    <Button variant="ghost" size="sm" leftIcon={<RotateCcw className="size-3.5" />} onClick={resetFilters}>
                        Réinitialiser
                    </Button>
                )}
                <div className="ml-auto">
                    <SegmentedControl<ViewMode>
                        ariaLabel="Affichage"
                        size="sm"
                        value={view}
                        onChange={setView}
                        options={[
                            { value: "grid", label: "", icon: LayoutGrid, ariaLabel: "Grille" },
                            { value: "list", label: "", icon: List, ariaLabel: "Liste" },
                        ]}
                    />
                </div>
            </div>

            {!isLoading && !loadError && templates.length > 0 && (
                <p className="mt-3 text-xs text-ink-3">
                    {visible.length === templates.length
                        ? `${templates.length} templates`
                        : `${visible.length} sur ${templates.length} templates`}
                    {" · "}
                    {usedCount} déjà envoyé{usedCount > 1 ? "s" : ""} au moins une fois
                </p>
            )}

            {!isLoading && unassignedCount > 0 && missionFilter !== NO_MISSION && (
                <Callout
                    tone="warning"
                    className="mt-4"
                    title={`${unassignedCount} template${unassignedCount > 1 ? "s ne sont assignés" : " n'est assigné"} à aucune mission`}
                    action={
                        <Button size="sm" variant="secondary" leftIcon={<Users className="size-3.5" />} onClick={() => setParams({ mission: NO_MISSION })}>
                            Les voir
                        </Button>
                    }
                >
                    Les SDR ne les voient pas dans l&apos;écran d&apos;appel. Ouvrez-les pour choisir leurs missions.
                </Callout>
            )}

            <div className="mt-4">
                {isLoading ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-[210px] rounded-panel" />
                        ))}
                    </div>
                ) : loadError ? (
                    <Callout
                        tone="danger"
                        title="Les templates n'ont pas pu être chargés"
                        action={<Button size="sm" variant="secondary" onClick={() => { setIsLoading(true); fetchTemplates(); }}>Réessayer</Button>}
                    >
                        {loadError}
                    </Callout>
                ) : templates.length === 0 ? (
                    <EmptyState
                        icon={FileText}
                        title="Aucun template pour l'instant"
                        description="Un template est un email type (objet et corps, avec des variables comme {{firstName}}). Assignez-le à une mission : les SDR l'envoient en un clic depuis l'écran d'appel."
                        action={<Button leftIcon={<Plus className="size-4" />} onClick={openNew}>Créer le premier template</Button>}
                    />
                ) : visible.length === 0 ? (
                    <EmptyState
                        icon={Search}
                        title="Aucun template ne correspond"
                        description="Modifiez la recherche ou les filtres."
                        action={<Button variant="secondary" onClick={resetFilters}>Réinitialiser les filtres</Button>}
                    />
                ) : view === "grid" ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {visible.map((t) => <TemplateCard key={t.id} {...itemProps(t)} />)}
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-panel border border-line bg-surface">
                        <table className="w-full min-w-[820px] table-fixed text-left">
                            <colgroup>
                                <col />
                                <col className="w-32" />
                                <col className="w-64" />
                                <col className="w-48" />
                                <col className="w-36" />
                                <col className="w-28" />
                            </colgroup>
                            <thead className="bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                                <tr>
                                    <th className="px-4 py-2.5">Template</th>
                                    <th className="px-4 py-2.5">Catégorie</th>
                                    <th className="px-4 py-2.5">Missions</th>
                                    <th className="px-4 py-2.5">Utilisation</th>
                                    <th className="px-4 py-2.5">Modifié</th>
                                    <th className="px-2 py-2.5"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((t) => <TemplateRow key={t.id} {...itemProps(t)} />)}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {editorOpen && (
                <TemplateEditor
                    key={editing?.id ?? "new"}
                    template={editing}
                    missions={missions}
                    initialMissionIds={initialMissionIds}
                    onClose={closeEditor}
                    onSaved={(saved) => {
                        handleSaved(saved);
                        closeEditor();
                    }}
                    onDuplicate={editing ? () => handleDuplicate(editing) : undefined}
                    onDelete={editing ? () => setDeleting(editing) : undefined}
                />
            )}

            <PreviewModal
                template={previewing}
                onClose={() => setPreviewing(null)}
                onEdit={() => {
                    const id = previewing?.id;
                    setPreviewing(null);
                    if (id) openEditor(id);
                }}
            />

            <ConfirmModal
                isOpen={Boolean(deleting)}
                onClose={() => !isDeleting && setDeleting(null)}
                onConfirm={handleDelete}
                isLoading={isDeleting}
                variant="danger"
                title="Supprimer ce template ?"
                message={
                    deleting
                        ? deleting.missionTemplates.length > 0
                            ? `« ${deleting.name} » est assigné à ${deleting.missionTemplates.length} mission${deleting.missionTemplates.length > 1 ? "s" : ""} : il disparaîtra de leur écran d'appel. Les emails déjà envoyés sont conservés.`
                            : `« ${deleting.name} » sera supprimé définitivement. Les emails déjà envoyés sont conservés.`
                        : ""
                }
                confirmText="Supprimer"
            />
        </EmailHubPage>
    );
}

