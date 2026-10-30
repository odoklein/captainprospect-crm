"use client";

/**
 * Mémoire tab: what Captain remembers, by layer (Agence, Dossier, Mes
 * préférences), one Card per layer. Kind filter (ToggleGroup), « Supprimés »
 * switch, inline edit, pin Toggle, row menu, add in a Dialog, delete with
 * undo. Every write is optimistic and rolls back on error.
 */

import { useEffect, useId, useRef, useState } from "react";
import {
    Brain,
    Building2,
    Check,
    Folder,
    MessageSquare,
    MoreHorizontal,
    Pencil,
    Pin,
    PinOff,
    Plus,
    RotateCcw,
    Trash2,
    User,
    X,
    type LucideIcon,
} from "lucide-react";
import type { MemoryItem, MemoryKind, MemoryScope } from "@/lib/assistant/api-contract";
import { useMemories } from "@/lib/assistant/client/folder-hooks";
import {
    MEMORY_CONTENT_MAX,
    MEMORY_KINDS,
    charCountLevel,
    groupMemories,
    kindFromToggle,
    memoryKindCounts,
    memoryKindLabel,
    tabCountLabel,
    type MemoryLayer,
} from "@/lib/assistant/client/folder-logic";
import { relativeTime } from "@/components/accueil/AccueilUI";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/shadcn/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { Kbd } from "@/components/ui/shadcn/kbd";
import { Label } from "@/components/ui/shadcn/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/shadcn/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Switch } from "@/components/ui/shadcn/switch";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { Toggle } from "@/components/ui/shadcn/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/shadcn/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { useToast } from "@/components/ui/Toast";
import { AiMark } from "@/components/ui/AiMark";
import { cn } from "@/lib/utils";
import { DegradedNotice, ENTER, ErrorState, Spinner, stagger } from "./parts";

const KIND_BADGE: Record<MemoryKind, "info" | "secondary" | "warning" | "success" | "danger"> = {
    FACT: "info",
    PREFERENCE: "secondary",
    DECISION: "warning",
    CONTACT: "success",
    GOAL: "danger",
};

const LAYER_ICON: Record<MemoryLayer, LucideIcon> = { agency: Building2, folder: Folder, user: User };
const LAYER_HINT: Record<MemoryLayer, string> = {
    agency: "Partagé avec toute l'équipe, dans chaque dossier.",
    folder: "Utilisé dans les conversations de ce dossier.",
    user: "Visible par toi seul, partout.",
};

const ALL = "ALL";

export function MemoryTab({ folderId, folderName, onOpenConversation }: { folderId: string | null; folderName: string | null; onOpenConversation(id: string): void }) {
    const [includeDeleted, setIncludeDeleted] = useState(false);
    const [kind, setKind] = useState<MemoryKind | null>(null);
    const [adding, setAdding] = useState(false);
    const { data, error, isLoading, create, patch, remove, restore } = useMemories(folderId, includeDeleted);
    const toast = useToast();
    const switchId = useId();

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

    const onRestore = (item: MemoryItem) =>
        restore(item)
            .then(() => toast.success("Souvenir restauré"))
            .catch((e: Error) => toast.error("Restauration impossible", e.message));

    const onPatch = (item: MemoryItem, body: { content?: string; pinned?: boolean }) =>
        patch(item.id, body).catch((e: Error) => {
            toast.error("Modification impossible", e.message);
            throw e;
        });

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="-mx-4 min-w-0 flex-1 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
                    <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        value={kind ?? ALL}
                        onValueChange={(v) => setKind(kindFromToggle(v))}
                        aria-label="Filtrer par type"
                        className="min-w-max"
                    >
                        <ToggleGroupItem value={ALL} className="group gap-1.5 px-2.5 text-xs">
                            Tous
                            <KindCount n={counts.ALL} />
                        </ToggleGroupItem>
                        {MEMORY_KINDS.map((k) => (
                            <ToggleGroupItem key={k.kind} value={k.kind} className="group gap-1.5 px-2.5 text-xs">
                                {k.label}
                                <KindCount n={counts[k.kind]} />
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Switch id={switchId} size="sm" checked={includeDeleted} onCheckedChange={setIncludeDeleted} />
                        <Label htmlFor={switchId} className="text-xs font-medium text-ink-2">
                            Supprimés
                        </Label>
                    </div>
                    <Button size="sm" onClick={() => setAdding(true)}>
                        <Plus aria-hidden />
                        Ajouter un souvenir
                    </Button>
                </div>
            </div>

            {data?.degraded && <DegradedNotice>La mémoire n&apos;est pas encore disponible sur cette instance.</DegradedNotice>}

            {error ? (
                <ErrorState title="Impossible de charger la mémoire" message={error.message} />
            ) : isLoading ? (
                <div className="space-y-4" aria-busy="true" aria-label="Chargement de la mémoire">
                    {[0, 1].map((g) => (
                        <Card key={g} className="gap-0 py-0">
                            <div className="border-b border-line-subtle px-5 py-4">
                                <Skeleton className="h-4 w-40 rounded-md" />
                            </div>
                            {[0, 1].map((r) => (
                                <div key={r} className="flex items-start gap-3 px-5 py-4">
                                    <Skeleton className="h-5 w-16 rounded-chip" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-3.5 w-11/12 rounded-md" />
                                        <Skeleton className="h-3 w-1/3 rounded-md" />
                                    </div>
                                </div>
                            ))}
                        </Card>
                    ))}
                </div>
            ) : (
                groups.map((g, gi) => {
                    const Icon = LAYER_ICON[g.layer];
                    return (
                        <Card key={g.layer} aria-labelledby={`mem-${g.layer}`} className={cn("gap-0 overflow-hidden py-0", ENTER)} style={stagger(gi, 60)} role="region">
                            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-subtle px-5 py-3.5">
                                <h3 id={`mem-${g.layer}`} className="flex items-center gap-2 text-sm font-semibold text-ink">
                                    <span className="flex size-7 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-3" aria-hidden>
                                        <Icon className="size-3.5" />
                                    </span>
                                    {g.label}
                                    <Badge variant="secondary" className="tabular-nums">
                                        {kind ? `${g.items.length} sur ${g.total}` : g.total}
                                    </Badge>
                                </h3>
                                <span className="text-xs text-ink-4">{LAYER_HINT[g.layer]}</span>
                            </header>
                            {g.items.length === 0 ? (
                                <p className="px-5 py-5 text-sm text-ink-3">
                                    {kind
                                        ? `Aucun souvenir de type « ${memoryKindLabel(kind)} » ici.`
                                        : g.layer === "user"
                                          ? "Captain retiendra ici tes préférences de travail."
                                          : "Rien de retenu pour l'instant."}
                                </p>
                            ) : (
                                <ul className="divide-y divide-line-subtle">
                                    {g.items.map((m, i) => (
                                        <li key={m.id} className={ENTER} style={stagger(i)}>
                                            <MemoryRow item={m} onPatch={onPatch} onDelete={onDelete} onRestore={onRestore} onOpenConversation={onOpenConversation} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>
                    );
                })
            )}

            <AddMemoryDialog
                open={adding}
                onOpenChange={setAdding}
                hasFolder={folderId !== null}
                folderName={folderName}
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
        </div>
    );
}

function KindCount({ n }: { n: number }) {
    const label = tabCountLabel(n);
    if (!label) return null;
    return <span className="rounded-chip bg-surface-3 px-1.5 text-3xs font-semibold tabular-nums text-ink-3 group-data-[state=on]:bg-surface">{label}</span>;
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
    const [menuOpen, setMenuOpen] = useState(false);
    const ref = useRef<HTMLTextAreaElement>(null);
    const keepFocus = useRef(false);
    const deleted = !!item.deletedAt;
    const pending = item.id.startsWith("tmp-");
    const conversationId = item.source?.conversationId ?? null;

    useEffect(() => {
        if (!editing) return;
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
    }, [editing]);

    const startEdit = () => {
        setDraft(item.content);
        setEditing(true);
    };

    const cancel = () => {
        setDraft(item.content);
        setEditing(false);
    };

    const save = () => {
        const next = draft.trim().slice(0, MEMORY_CONTENT_MAX);
        setEditing(false);
        if (next && next !== item.content) onPatch(item, { content: next }).catch(() => setDraft(item.content));
        else setDraft(item.content);
    };

    const togglePin = () => void onPatch(item, { pinned: !item.pinned }).catch(() => undefined);

    return (
        <div
            data-menu-open={menuOpen || undefined}
            className={cn(
                "group flex items-start gap-3 px-5 py-3.5 transition-[background-color,opacity] duration-150",
                deleted ? "bg-surface-2 opacity-70" : "hover:bg-surface-2 data-[menu-open]:bg-surface-2",
                pending && "opacity-60",
            )}
        >
            <Badge variant={KIND_BADGE[item.kind]} className="mt-0.5 w-[76px] justify-center">
                {memoryKindLabel(item.kind)}
            </Badge>
            <div className="min-w-0 flex-1">
                {editing ? (
                    <div className="space-y-1.5">
                        <Textarea
                            ref={ref}
                            value={draft}
                            maxLength={MEMORY_CONTENT_MAX}
                            aria-label="Contenu du souvenir"
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    save();
                                } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    cancel();
                                }
                            }}
                            className="min-h-14 text-[13.5px]"
                        />
                        <div className="flex items-center gap-2 text-2xs text-ink-4">
                            <CharCount value={draft.length} />
                            <span className="ml-auto hidden items-center gap-1 sm:inline-flex">
                                <Kbd>Entrée</Kbd> enregistrer · <Kbd>Échap</Kbd> annuler
                            </span>
                            <Button variant="ghost" size="icon-xs" onClick={save} aria-label="Enregistrer" className="text-success-ink hover:bg-success-soft hover:text-success-ink">
                                <Check aria-hidden />
                            </Button>
                            <Button variant="ghost" size="icon-xs" onClick={cancel} aria-label="Annuler">
                                <X aria-hidden />
                            </Button>
                        </div>
                    </div>
                ) : (
                    <p
                        className={cn("whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink", deleted && "line-through decoration-ink-4")}
                        onDoubleClick={() => !deleted && !pending && startEdit()}
                    >
                        {item.content}
                    </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-4">
                    {item.source?.by === "model" ? (
                        <span className="inline-flex items-center gap-1 text-accent-600">
                            <AiMark className="size-3" aria-hidden />
                            Retenu par Captain
                        </span>
                    ) : (
                        <span>Ajouté à la main</span>
                    )}
                    {conversationId && (
                        <Button variant="link" size="xs" className="h-auto gap-1 px-0 text-xs" onClick={() => onOpenConversation(conversationId)}>
                            <MessageSquare className="size-3" aria-hidden />
                            Voir la conversation
                        </Button>
                    )}
                    <span aria-hidden>·</span>
                    <time dateTime={item.updatedAt}>{deleted && item.deletedAt ? `supprimé ${relativeTime(item.deletedAt)}` : relativeTime(item.updatedAt)}</time>
                    {item.useCount > 0 && <span>· utilisé {item.useCount} fois</span>}
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
                {deleted ? (
                    <Button variant="outline" size="xs" onClick={() => onRestore(item)}>
                        <RotateCcw aria-hidden />
                        Restaurer
                    </Button>
                ) : (
                    <>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Toggle
                                    size="sm"
                                    pressed={item.pinned}
                                    onPressedChange={togglePin}
                                    disabled={pending}
                                    aria-label={item.pinned ? "Désépingler" : "Épingler : toujours utilisé"}
                                    className={cn(
                                        "size-8 min-w-8",
                                        !item.pinned && !editing && "sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 sm:group-data-[menu-open]:opacity-100",
                                    )}
                                >
                                    <Pin className={cn("size-3.5", item.pinned && "fill-current")} aria-hidden />
                                </Toggle>
                            </TooltipTrigger>
                            <TooltipContent>{item.pinned ? "Épinglé : toujours utilisé" : "Épingler : toujours utilisé"}</TooltipContent>
                        </Tooltip>
                        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    disabled={pending}
                                    aria-label="Actions du souvenir"
                                    className="sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 sm:data-[state=open]:opacity-100"
                                >
                                    <MoreHorizontal aria-hidden />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="w-56"
                                onCloseAutoFocus={(e) => {
                                    if (keepFocus.current) {
                                        e.preventDefault();
                                        keepFocus.current = false;
                                    }
                                }}
                            >
                                <DropdownMenuItem
                                    onSelect={() => {
                                        keepFocus.current = true;
                                        startEdit();
                                    }}
                                >
                                    <Pencil aria-hidden />
                                    Modifier
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={togglePin}>
                                    {item.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                                    {item.pinned ? "Désépingler" : "Épingler"}
                                </DropdownMenuItem>
                                {conversationId && (
                                    <DropdownMenuItem onSelect={() => onOpenConversation(conversationId)}>
                                        <MessageSquare aria-hidden />
                                        Ouvrir la conversation source
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onSelect={() => onDelete(item)}>
                                    <Trash2 aria-hidden />
                                    Supprimer
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                )}
            </div>
        </div>
    );
}

function CharCount({ value }: { value: number }) {
    const level = charCountLevel(value, MEMORY_CONTENT_MAX);
    return (
        <span className={cn("tabular-nums", level === "over" ? "text-danger-ink" : level === "warn" ? "text-warning-ink" : "text-ink-4")} aria-live="polite">
            {value} / {MEMORY_CONTENT_MAX}
        </span>
    );
}

// ============================================
// Add dialog
// ============================================

function AddMemoryDialog({
    open,
    onOpenChange,
    hasFolder,
    folderName,
    onSubmit,
}: {
    open: boolean;
    onOpenChange(open: boolean): void;
    hasFolder: boolean;
    folderName: string | null;
    onSubmit(body: { scope: MemoryScope; kind: MemoryKind; content: string }): Promise<void>;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {/* Remounted on each open: the form starts clean. */}
                {open && <AddMemoryForm hasFolder={hasFolder} folderName={folderName} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} />}
            </DialogContent>
        </Dialog>
    );
}

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

    const scopes: Array<{ value: MemoryScope; label: string; hint: string; icon: LucideIcon }> = [
        ...(hasFolder ? [{ value: "FOLDER" as const, label: `Dossier « ${folderName ?? ""} »`, hint: "Utilisé dans les conversations de ce dossier.", icon: Folder }] : []),
        { value: "AGENCY", label: "Agence", hint: "Toute l'équipe, dans chaque dossier.", icon: Building2 },
        { value: "USER", label: "Mes préférences", hint: "Toi seul, partout.", icon: User },
    ];

    const value = content.trim();
    const canSubmit = !!value && value.length <= MEMORY_CONTENT_MAX && !busy;

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true);
        try {
            await onSubmit({ scope, kind, content: value });
        } finally {
            setBusy(false);
        }
    };

    return (
        <form
            className="grid gap-5"
            onSubmit={(e) => {
                e.preventDefault();
                void submit();
            }}
        >
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Brain className="size-5 text-ink-3" aria-hidden />
                    Ajouter un souvenir
                </DialogTitle>
                <DialogDescription>Captain s&apos;en servira dans les prochaines conversations, selon la portée choisie.</DialogDescription>
            </DialogHeader>

            <fieldset className="grid gap-2">
                <legend className="mb-2 text-xs font-semibold text-ink-2">Portée</legend>
                <RadioGroup value={scope} onValueChange={(v) => setScope(v as MemoryScope)} className="gap-2">
                    {scopes.map((s) => (
                        <Label
                            key={s.value}
                            htmlFor={`${id}-${s.value}`}
                            className={cn(
                                "cursor-pointer items-start gap-3 rounded-control border border-line bg-surface p-3 font-normal transition-[border-color,background-color] duration-150 hover:border-line-strong",
                                scope === s.value && "border-primary-400 bg-primary-50/50",
                            )}
                        >
                            <RadioGroupItem id={`${id}-${s.value}`} value={s.value} className="mt-0.5" />
                            <s.icon className="mt-px size-4 text-ink-4" aria-hidden />
                            <span className="grid gap-0.5">
                                <span className="text-sm font-semibold text-ink">{s.label}</span>
                                <span className="text-xs leading-snug text-ink-3">{s.hint}</span>
                            </span>
                        </Label>
                    ))}
                </RadioGroup>
            </fieldset>

            <div className="grid gap-2">
                <Label htmlFor={`${id}-kind`} className="text-xs font-semibold text-ink-2">
                    Type
                </Label>
                <Select value={kind} onValueChange={(v) => setKind(v as MemoryKind)}>
                    <SelectTrigger id={`${id}-kind`} className="w-full sm:w-56">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {MEMORY_KINDS.map((k) => (
                            <SelectItem key={k.kind} value={k.kind}>
                                {k.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid gap-2">
                <Label htmlFor={`${id}-content`} className="text-xs font-semibold text-ink-2">
                    Contenu
                </Label>
                <Textarea
                    id={`${id}-content`}
                    autoFocus
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
                    className="max-h-60 min-h-24"
                />
                <div className="flex items-center justify-between text-xs">
                    <span className="hidden items-center gap-1 text-ink-4 sm:inline-flex">
                        <Kbd>Ctrl</Kbd>
                        <Kbd>Entrée</Kbd> ajouter
                    </span>
                    <span className="ml-auto">
                        <CharCount value={content.length} />
                    </span>
                </div>
            </div>

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
                    Annuler
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                    {busy ? <Spinner /> : <Plus aria-hidden />}
                    {busy ? "Ajout…" : "Ajouter"}
                </Button>
            </DialogFooter>
        </form>
    );
}
