"use client";

/**
 * Mémoire tab: what Captain remembers, by layer (Agence, Dossier, Mes
 * préférences). Inline edit, pin, delete with undo, add, filter by kind,
 * show deleted. Every write is optimistic and rolls back on error.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Brain, Building2, Check, CornerDownLeft, Folder, MessageSquare, Pencil, Pin, Plus, RotateCcw, Trash2, User, X, type LucideIcon } from "lucide-react";
import type { MemoryItem, MemoryKind, MemoryScope } from "@/lib/assistant/api-contract";
import { useMemories } from "@/lib/assistant/client/folder-hooks";
import { CARD, EmptyBlock, FOCUS, PRIMARY_BUTTON, SECONDARY_BUTTON, SelectField, Shimmer, relativeTime } from "@/components/accueil/AccueilUI";
import { AiMark } from "@/components/ui/AiMark";
import { Chip } from "@/components/ui/Chip";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { MEMORY_CONTENT_MAX, MEMORY_KINDS, groupMemories, memoryKindCounts, memoryKindLabel, type MemoryLayer } from "./logic";

const KIND_TONE: Record<MemoryKind, string> = {
    FACT: "border-primary-200 bg-primary-50 text-primary-700",
    PREFERENCE: "border-teal-200 bg-teal-50 text-teal-700",
    DECISION: "border-amber-200 bg-amber-50 text-amber-800",
    CONTACT: "border-emerald-200 bg-emerald-50 text-emerald-700",
    GOAL: "border-rose-200 bg-rose-50 text-rose-700",
};

const LAYER_ICON: Record<MemoryLayer, LucideIcon> = { agency: Building2, folder: Folder, user: User };
const LAYER_HINT: Record<MemoryLayer, string> = {
    agency: "Partagé avec toute l'équipe, dans chaque dossier.",
    folder: "Utilisé dans les conversations de ce dossier.",
    user: "Visible par toi seul, partout.",
};

export function MemoryTab({ folderId, folderName, onOpenConversation }: { folderId: string | null; folderName: string | null; onOpenConversation(id: string): void }) {
    const [includeDeleted, setIncludeDeleted] = useState(false);
    const [kind, setKind] = useState<MemoryKind | null>(null);
    const [adding, setAdding] = useState(false);
    const { data, error, isLoading, create, patch, remove, restore } = useMemories(folderId, includeDeleted);
    const toast = useToast();

    const groups = groupMemories(data, { folderName, kind, includeDeleted });
    const counts = memoryKindCounts(data, includeDeleted, folderName !== null);

    const onDelete = async (item: MemoryItem) => {
        try {
            await remove(item);
            toast.addToast({
                type: "info",
                title: "Souvenir supprimé",
                message: item.content.length > 80 ? `${item.content.slice(0, 80)}…` : item.content,
                duration: 6000,
                action: {
                    label: "Annuler",
                    onClick: () => {
                        restore(item).catch((e: Error) => toast.error("Restauration impossible", e.message));
                    },
                },
            });
        } catch (e) {
            toast.error("Suppression impossible", (e as Error).message);
        }
    };

    const onRestore = (item: MemoryItem) => restore(item).catch((e: Error) => toast.error("Restauration impossible", e.message));

    const onPatch = (item: MemoryItem, body: { content?: string; pinned?: boolean }) =>
        patch(item.id, body).catch((e: Error) => {
            toast.error("Modification impossible", e.message);
            throw e;
        });

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="-mx-4 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrer par type">
                    <Chip selected={kind === null} onClick={() => setKind(null)} count={counts.ALL}>
                        Tous
                    </Chip>
                    {MEMORY_KINDS.map((k) => (
                        <Chip key={k.kind} selected={kind === k.kind} onClick={() => setKind(kind === k.kind ? null : k.kind)} count={counts[k.kind]}>
                            {k.label}
                        </Chip>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                    <Switch size="sm" checked={includeDeleted} onChange={setIncludeDeleted} label={<span className="text-xs font-bold text-ink-2">Supprimés</span>} />
                    <button type="button" className={PRIMARY_BUTTON + " h-9 rounded-xl px-3.5"} onClick={() => setAdding(true)} aria-expanded={adding}>
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Ajouter un souvenir
                    </button>
                </div>
            </div>

            {adding && (
                <AddMemoryForm
                    hasFolder={folderId !== null}
                    folderName={folderName}
                    onCancel={() => setAdding(false)}
                    onSubmit={async (body) => {
                        try {
                            await create({ ...body, folderId: body.scope === "FOLDER" ? folderId : null });
                            setAdding(false);
                            toast.success("Souvenir ajouté");
                        } catch (e) {
                            toast.error("Ajout impossible", (e as Error).message);
                        }
                    }}
                />
            )}

            {data?.degraded && (
                <p className="rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-[11px] font-semibold text-warning-ink">La mémoire n&apos;est pas encore disponible sur cette instance.</p>
            )}

            {error ? (
                <EmptyBlock compact icon={Brain} tone="rose" title="Impossible de charger la mémoire" hint={error.message} />
            ) : isLoading ? (
                <div className="space-y-4" aria-busy="true" aria-label="Chargement de la mémoire">
                    {[0, 1].map((g) => (
                        <div key={g} className="space-y-2">
                            <Shimmer className="h-4 w-32 rounded-md" />
                            <Shimmer className="h-16" />
                            <Shimmer className="h-16" />
                        </div>
                    ))}
                </div>
            ) : (
                groups.map((g, gi) => {
                    const Icon = LAYER_ICON[g.layer];
                    return (
                        <section key={g.layer} aria-labelledby={`mem-${g.layer}`} className="space-y-2 motion-safe:animate-ds-enter" style={{ animationDelay: `${gi * 60}ms` }}>
                            <header className="flex items-baseline gap-2">
                                <h3 id={`mem-${g.layer}`} className="flex items-center gap-1.5 text-xs font-extrabold text-ink">
                                    <Icon className="h-3.5 w-3.5 text-ink-4" aria-hidden />
                                    {g.label}
                                </h3>
                                <span className="text-[11px] font-semibold text-ink-4">
                                    {kind ? `${g.items.length} sur ${g.total}` : g.total} · {LAYER_HINT[g.layer]}
                                </span>
                            </header>
                            {g.items.length === 0 ? (
                                <p className="rounded-2xl border border-dashed border-line bg-surface-2/60 px-4 py-3 text-xs text-ink-3">
                                    {kind ? `Aucun souvenir de type « ${memoryKindLabel(kind)} » ici.` : g.layer === "user" ? "Captain retiendra ici tes préférences de travail." : "Rien de retenu pour l'instant."}
                                </p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {g.items.map((m, i) => (
                                        <li key={m.id} className="motion-safe:animate-ds-enter" style={{ animationDelay: `${Math.min(i, 7) * 30}ms` }}>
                                            <MemoryRow item={m} onPatch={onPatch} onDelete={onDelete} onRestore={onRestore} onOpenConversation={onOpenConversation} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    );
                })
            )}
        </div>
    );
}

// ============================================
// Row
// ============================================

function MemoryRow({
    item,
    onPatch,
    onDelete,
    onRestore,
    onOpenConversation,
}: {
    item: MemoryItem;
    onPatch(item: MemoryItem, body: { content?: string; pinned?: boolean }): Promise<unknown>;
    onDelete(item: MemoryItem): void;
    onRestore(item: MemoryItem): void;
    onOpenConversation(id: string): void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(item.content);
    const ref = useRef<HTMLTextAreaElement>(null);
    const deleted = !!item.deletedAt;
    const pending = item.id.startsWith("tmp-");

    useEffect(() => {
        if (!editing) return;
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
    }, [editing]);

    const save = () => {
        const next = draft.trim().slice(0, MEMORY_CONTENT_MAX);
        setEditing(false);
        if (next && next !== item.content) onPatch(item, { content: next }).catch(() => setDraft(item.content));
        else setDraft(item.content);
    };

    const conversationId = item.source?.conversationId ?? null;

    return (
        <div
            className={cn(
                CARD,
                "group flex items-start gap-3 rounded-2xl px-3.5 py-3 transition-[border-color,opacity] duration-200",
                deleted ? "border-dashed opacity-60" : "hover:border-line-strong",
                pending && "opacity-70",
            )}
        >
            <span className={cn("mt-0.5 inline-flex h-5 flex-shrink-0 items-center rounded-full border px-2 text-[10px] font-bold", KIND_TONE[item.kind])}>{memoryKindLabel(item.kind)}</span>
            <div className="min-w-0 flex-1">
                {editing ? (
                    <div>
                        <textarea
                            ref={ref}
                            value={draft}
                            rows={Math.min(6, Math.max(2, Math.ceil(draft.length / 80)))}
                            maxLength={MEMORY_CONTENT_MAX}
                            aria-label="Contenu du souvenir"
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    save();
                                } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    setDraft(item.content);
                                    setEditing(false);
                                }
                            }}
                            className="w-full resize-none rounded-xl border border-primary-300 bg-surface px-2.5 py-1.5 text-[13px] leading-relaxed text-ink outline-none ring-4 ring-primary-500/12"
                        />
                        <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold text-ink-4">
                            <CharCount value={draft.length} />
                            <span className="ml-auto inline-flex items-center gap-1">
                                <CornerDownLeft className="h-3 w-3" aria-hidden /> enregistrer · Échap annuler
                            </span>
                            <button type="button" onClick={save} className={cn("inline-flex h-6 w-6 items-center justify-center rounded-md text-success-ink hover:bg-success-soft", FOCUS)} aria-label="Enregistrer">
                                <Check className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setDraft(item.content);
                                    setEditing(false);
                                }}
                                className={cn("inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-3 hover:bg-surface-3", FOCUS)}
                                aria-label="Annuler"
                            >
                                <X className="h-3.5 w-3.5" aria-hidden />
                            </button>
                        </div>
                    </div>
                ) : (
                    <p
                        className={cn("whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink", deleted && "line-through decoration-ink-4")}
                        onDoubleClick={() => !deleted && !pending && setEditing(true)}
                    >
                        {item.content}
                    </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-ink-4">
                    {item.source?.by === "model" ? (
                        <span className="inline-flex items-center gap-1 text-accent-700">
                            <AiMark className="h-3 w-3" aria-hidden />
                            Retenu par Captain
                        </span>
                    ) : (
                        <span>Ajouté à la main</span>
                    )}
                    {conversationId && (
                        <button
                            type="button"
                            onClick={() => onOpenConversation(conversationId)}
                            className={cn("inline-flex items-center gap-1 rounded-md text-link hover:underline", FOCUS)}
                        >
                            <MessageSquare className="h-3 w-3" aria-hidden />
                            depuis la conversation…
                        </button>
                    )}
                    <span aria-hidden>·</span>
                    <time dateTime={item.updatedAt}>{deleted && item.deletedAt ? `supprimé ${relativeTime(item.deletedAt)}` : relativeTime(item.updatedAt)}</time>
                    {item.useCount > 0 && <span>· utilisé {item.useCount} fois</span>}
                </div>
            </div>
            <div className={cn("flex flex-shrink-0 items-center gap-0.5", !editing && !item.pinned && !deleted && "sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100")}>
                {deleted ? (
                    <RowButton label="Restaurer" onClick={() => onRestore(item)}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    </RowButton>
                ) : (
                    <>
                        <RowButton
                            label={item.pinned ? "Désépingler" : "Épingler : toujours utilisé"}
                            pressed={item.pinned}
                            disabled={pending}
                            onClick={() => void onPatch(item, { pinned: !item.pinned }).catch(() => undefined)}
                            className={item.pinned ? "text-accent-700" : undefined}
                        >
                            <Pin className={cn("h-3.5 w-3.5", item.pinned && "fill-current")} aria-hidden />
                        </RowButton>
                        {!editing && (
                            <RowButton label="Modifier" disabled={pending} onClick={() => setEditing(true)}>
                                <Pencil className="h-3.5 w-3.5" aria-hidden />
                            </RowButton>
                        )}
                        <RowButton label="Supprimer" disabled={pending} onClick={() => onDelete(item)} className="hover:bg-danger-soft hover:text-danger-ink">
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </RowButton>
                    </>
                )}
            </div>
        </div>
    );
}

function RowButton({
    label,
    onClick,
    children,
    pressed,
    disabled,
    className,
}: {
    label: string;
    onClick(): void;
    children: React.ReactNode;
    pressed?: boolean;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            aria-pressed={pressed}
            disabled={disabled}
            className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 transition-colors duration-150 hover:bg-surface-3 hover:text-ink disabled:opacity-40",
                FOCUS,
                className,
            )}
        >
            {children}
        </button>
    );
}

function CharCount({ value }: { value: number }) {
    return (
        <span
            className={cn("tabular-nums", value >= MEMORY_CONTENT_MAX ? "text-danger-ink" : value >= MEMORY_CONTENT_MAX * 0.9 ? "text-warning-ink" : "text-ink-4")}
            aria-live="polite"
        >
            {value} / {MEMORY_CONTENT_MAX}
        </span>
    );
}

// ============================================
// Add form
// ============================================

function AddMemoryForm({
    hasFolder,
    folderName,
    onCancel,
    onSubmit,
}: {
    hasFolder: boolean;
    folderName: string | null;
    onCancel(): void;
    onSubmit(body: { scope: MemoryScope; kind: MemoryKind; content: string }): Promise<void>;
}) {
    const [scope, setScope] = useState<MemoryScope>(hasFolder ? "FOLDER" : "AGENCY");
    const [kind, setKind] = useState<MemoryKind>("FACT");
    const [content, setContent] = useState("");
    const [busy, setBusy] = useState(false);
    const id = useId();
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => ref.current?.focus(), []);

    const submit = async () => {
        const value = content.trim();
        if (!value || value.length > MEMORY_CONTENT_MAX || busy) return;
        setBusy(true);
        try {
            await onSubmit({ scope, kind, content: value });
        } finally {
            setBusy(false);
        }
    };

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                void submit();
            }}
            onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), onCancel())}
            className={cn(CARD, "space-y-3 rounded-2xl border-primary-200 p-4 motion-safe:animate-ds-pop")}
        >
            <div className="flex flex-wrap gap-2">
                <SelectField value={scope} onChange={(v) => setScope(v as MemoryScope)} ariaLabel="Portée du souvenir" className="w-full sm:w-56">
                    <option value="AGENCY">Agence (toute l&apos;équipe)</option>
                    {hasFolder && <option value="FOLDER">{`Dossier « ${folderName ?? ""} »`}</option>}
                    <option value="USER">Mes préférences (moi seul)</option>
                </SelectField>
                <SelectField value={kind} onChange={(v) => setKind(v as MemoryKind)} ariaLabel="Type de souvenir" className="w-full sm:w-40">
                    {MEMORY_KINDS.map((k) => (
                        <option key={k.kind} value={k.kind}>
                            {k.label}
                        </option>
                    ))}
                </SelectField>
            </div>
            <div>
                <label htmlFor={id} className="sr-only">
                    Contenu du souvenir
                </label>
                <textarea
                    id={id}
                    ref={ref}
                    rows={3}
                    value={content}
                    maxLength={MEMORY_CONTENT_MAX}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            void submit();
                        }
                    }}
                    placeholder="Ex. : Le client préfère les RDV le mardi matin. Ne jamais appeler avant 9 h."
                    className="w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink shadow-2xs placeholder:text-ink-4 transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-500/12"
                />
                <div className="mt-1 flex justify-end text-[11px] font-semibold">
                    <CharCount value={content.length} />
                </div>
            </div>
            <div className="flex justify-end gap-2">
                <button type="button" className={SECONDARY_BUTTON} onClick={onCancel}>
                    Annuler
                </button>
                <button type="submit" className={cn(PRIMARY_BUTTON, "h-9 rounded-xl px-4")} disabled={!content.trim() || busy}>
                    {busy ? "Ajout…" : "Ajouter"}
                </button>
            </div>
        </form>
    );
}
