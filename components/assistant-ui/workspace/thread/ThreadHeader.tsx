"use client";

/**
 * Thread header: Dossier › titre (inline rename), mission and visibility
 * chips, and the kebab menu — rename, pin, share, move, delete. A thread the
 * viewer cannot write to shows a read-only banner with a fork button.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
    Building2,
    ChevronRight,
    Eye,
    Folder,
    FolderInput,
    GitFork,
    Globe2,
    Lock,
    MoreHorizontal,
    Pencil,
    Pin,
    PinOff,
    Target,
    Trash2,
    Users,
} from "lucide-react";
import type { FolderCard, ThreadResponse } from "@/lib/assistant/api-contract";
import { cn } from "@/lib/utils";
import { FOCUS, PRIMARY_BUTTON, SECONDARY_BUTTON, SelectField } from "@/components/accueil/AccueilUI";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { ConfirmModal, Modal, ModalFooter } from "@/components/ui/Modal";

type Conversation = ThreadResponse["conversation"];

export interface ThreadHeaderProps {
    conversation: Conversation | null;
    /** Draft (no conversation yet): where it will be created. */
    draftFolder: { id: string | null; name: string; kind: FolderCard["kind"] | "AGENCY" } | null;
    canWrite: boolean;
    generalFolders: FolderCard[];
    leading?: ReactNode;
    trailing?: ReactNode;
    compact?: boolean;
    forking?: boolean;
    onOpenFolder?: (folderId: string | null) => void;
    onRename: (title: string) => void;
    onTogglePin: () => void;
    onToggleVisibility: () => void;
    onMove: (folderId: string | null) => Promise<void> | void;
    onDelete: () => Promise<void>;
    onFork: () => void;
}

const CHIP = "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11.5px] font-medium";

export function ThreadHeader({
    conversation,
    draftFolder,
    canWrite,
    generalFolders,
    leading,
    trailing,
    compact,
    forking,
    onOpenFolder,
    onRename,
    onTogglePin,
    onToggleVisibility,
    onMove,
    onDelete,
    onFork,
}: ThreadHeaderProps) {
    const [renaming, setRenaming] = useState(false);
    const [draftTitle, setDraftTitle] = useState("");
    const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [moveOpen, setMoveOpen] = useState(false);
    const [moveTarget, setMoveTarget] = useState("");
    const [moving, setMoving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const kebabRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (renaming) inputRef.current?.select();
    }, [renaming]);

    const folder = conversation?.folder ?? null;
    const folderName = conversation ? (folder?.name ?? "Vue agence") : (draftFolder?.name ?? "Vue agence");
    const folderKind = conversation ? (folder?.kind ?? "AGENCY") : (draftFolder?.kind ?? "AGENCY");
    const folderId = conversation ? (conversation.folderId ?? null) : (draftFolder?.id ?? null);
    const FolderIcon = folderKind === "CLIENT" ? Building2 : folderKind === "GENERAL" ? Folder : Globe2;
    const isOwner = conversation?.isOwner ?? true;
    const inClientFolder = folderKind === "CLIENT";
    const title = conversation?.title?.trim() || "Nouvelle conversation";

    // Enter, Échap and blur can all end one rename: only the first one counts.
    const renameDoneRef = useRef(false);
    const startRename = () => {
        if (!conversation || !canWrite) return;
        renameDoneRef.current = false;
        setDraftTitle(conversation.title ?? "");
        setRenaming(true);
    };
    const endRename = (save: boolean) => {
        if (renameDoneRef.current) return;
        renameDoneRef.current = true;
        setRenaming(false);
        const next = draftTitle.trim();
        if (save && conversation && next && next !== conversation.title) onRename(next);
    };
    const commitRename = () => endRename(true);

    const openMenu = () => {
        const rect = kebabRef.current?.getBoundingClientRect();
        if (!rect) return;
        setMenuAt({ x: rect.right - 200, y: rect.bottom + 6 });
    };

    const pinned = conversation?.pinnedAt !== null && conversation?.pinnedAt !== undefined;
    const shared = conversation?.visibility === "SHARED";

    const menuItems = conversation
        ? [
              ...(canWrite ? [{ label: "Renommer", icon: <Pencil className="size-4" />, onClick: startRename }] : []),
              { label: pinned ? "Désépingler" : "Épingler", icon: pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />, onClick: onTogglePin },
              ...(isOwner
                  ? [
                        {
                            label: shared ? "Rendre privée" : "Partager avec les managers",
                            icon: shared ? <Lock className="size-4" /> : <Users className="size-4" />,
                            onClick: onToggleVisibility,
                        },
                        {
                            label: "Déplacer vers…",
                            icon: <FolderInput className="size-4" />,
                            onClick: () => {
                                setMoveTarget(conversation.folderId ?? "");
                                setMoveOpen(true);
                            },
                        },
                        {
                            label: "Supprimer",
                            icon: <Trash2 className="size-4" />,
                            onClick: () => setConfirmDelete(true),
                            variant: "danger" as const,
                            divider: true,
                        },
                    ]
                  : []),
          ]
        : [];

    return (
        <>
            <header className={cn("flex shrink-0 items-center gap-1.5 border-b border-line-subtle bg-surface/90 backdrop-blur-sm", compact ? "h-11 px-2" : "h-14 px-3 sm:px-4")}>
                {leading}
                <nav aria-label="Fil d’Ariane" className="flex min-w-0 flex-1 items-center gap-1 text-[13.5px]">
                    {!compact && (
                        <>
                            <button
                                type="button"
                                onClick={() => onOpenFolder?.(folderId)}
                                disabled={!onOpenFolder}
                                className={cn(
                                    "inline-flex h-8 min-w-0 max-w-[40%] shrink items-center gap-1.5 rounded-lg px-2 text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:pointer-events-none",
                                    FOCUS,
                                )}
                            >
                                <FolderIcon className="size-4 shrink-0 text-ink-4" aria-hidden />
                                <span className="truncate">{folderName}</span>
                            </button>
                            <ChevronRight className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                        </>
                    )}
                    {renaming ? (
                        <input
                            ref={inputRef}
                            value={draftTitle}
                            onChange={(e) => setDraftTitle(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitRename();
                                } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    endRename(false);
                                }
                            }}
                            maxLength={120}
                            aria-label="Titre de la conversation"
                            className="h-8 min-w-0 flex-1 rounded-lg border border-primary-300 bg-surface px-2 text-[13.5px] font-semibold text-ink shadow-2xs outline-none ring-4 ring-primary-500/10 motion-safe:animate-ds-pop"
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={startRename}
                            disabled={!conversation || !canWrite}
                            title={conversation && canWrite ? "Renommer" : undefined}
                            aria-current="page"
                            className={cn(
                                "inline-flex h-8 min-w-0 items-center rounded-lg px-2 font-semibold text-ink transition-colors duration-150 hover:bg-surface-2 disabled:pointer-events-none",
                                FOCUS,
                            )}
                        >
                            <span key={title} className="truncate motion-safe:animate-ds-enter">
                                {title}
                            </span>
                        </button>
                    )}
                    {conversation?.missionName && !compact && (
                        <span className={cn(CHIP, "max-w-[180px] border-line bg-surface-2 text-ink-2 max-md:hidden")} title={`Mission : ${conversation.missionName}`}>
                            <Target className="size-3 shrink-0 text-ink-4" aria-hidden />
                            <span className="truncate">{conversation.missionName}</span>
                        </span>
                    )}
                    {conversation && (
                        <button
                            type="button"
                            onClick={isOwner ? onToggleVisibility : undefined}
                            disabled={!isOwner}
                            title={isOwner ? (shared ? "Visible par les managers — cliquer pour la rendre privée" : "Visible par vous seul — cliquer pour la partager") : undefined}
                            className={cn(
                                CHIP,
                                "transition-[background-color,border-color,color] duration-200 disabled:pointer-events-none max-sm:hidden",
                                FOCUS,
                                shared ? "border-primary-200 bg-primary-50 text-primary-700 hover:border-primary-300" : "border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink-2",
                            )}
                        >
                            {shared ? <Users className="size-3" aria-hidden /> : <Lock className="size-3" aria-hidden />}
                            {shared ? "Partagée" : "Privée"}
                        </button>
                    )}
                </nav>

                {trailing}
                {conversation && menuItems.length > 0 && (
                    <button
                        ref={kebabRef}
                        type="button"
                        onClick={openMenu}
                        aria-label="Actions de la conversation"
                        aria-haspopup="menu"
                        aria-expanded={menuAt !== null}
                        className={cn(
                            "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink",
                            menuAt && "bg-surface-2 text-ink",
                            FOCUS,
                        )}
                    >
                        <MoreHorizontal className="size-4" aria-hidden />
                    </button>
                )}
            </header>

            {conversation && !canWrite && (
                <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-info-line bg-info-soft/60 px-4 py-2 text-[12.5px] text-info-ink motion-safe:animate-ds-enter">
                    <Eye className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                        Lecture seule{conversation.ownerName ? ` — conversation de ${conversation.ownerName}` : ""}.
                    </span>
                    <button type="button" onClick={onFork} disabled={forking} className={cn(SECONDARY_BUTTON, "h-8")}>
                        <GitFork className="size-3.5" aria-hidden />
                        {forking ? "Création…" : "Continuer dans une nouvelle conversation"}
                    </button>
                </div>
            )}

            <ContextMenu items={menuItems} position={menuAt} onClose={() => setMenuAt(null)} />

            <ConfirmModal
                isOpen={confirmDelete}
                onClose={() => !deleting && setConfirmDelete(false)}
                onConfirm={async () => {
                    setDeleting(true);
                    try {
                        await onDelete();
                        setConfirmDelete(false);
                    } finally {
                        setDeleting(false);
                    }
                }}
                title="Supprimer la conversation ?"
                message={`« ${title} » et ses messages seront supprimés. Les éléments épinglés au tableau du dossier restent.`}
                confirmText="Supprimer"
                variant="danger"
                isLoading={deleting}
            />

            <Modal
                isOpen={moveOpen}
                onClose={() => !moving && setMoveOpen(false)}
                title="Déplacer la conversation"
                description={inClientFolder ? undefined : "Vers un dossier général ou la vue agence."}
                size="sm"
            >
                {inClientFolder ? (
                    <p className="flex items-start gap-2.5 rounded-panel border border-line bg-surface-2 p-3 text-[13px] leading-relaxed text-ink-2">
                        <Building2 className="mt-0.5 size-4 shrink-0 text-ink-4" aria-hidden />
                        Une conversation d’un dossier client reste dans ce dossier : elle s’appuie sur les données, la mémoire et les fichiers de ce client.
                    </p>
                ) : (
                    <SelectField value={moveTarget} onChange={setMoveTarget} ariaLabel="Dossier de destination">
                        <option value="">Vue agence</option>
                        {generalFolders
                            .filter((f) => !f.id.startsWith("tmp-"))
                            .map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.name}
                                </option>
                            ))}
                    </SelectField>
                )}
                <ModalFooter>
                    <button type="button" onClick={() => setMoveOpen(false)} disabled={moving} className={SECONDARY_BUTTON}>
                        {inClientFolder ? "Fermer" : "Annuler"}
                    </button>
                    {!inClientFolder && (
                        <button
                            type="button"
                            disabled={moving || moveTarget === (conversation?.folderId ?? "")}
                            onClick={async () => {
                                setMoving(true);
                                try {
                                    await onMove(moveTarget || null);
                                    setMoveOpen(false);
                                } finally {
                                    setMoving(false);
                                }
                            }}
                            className={cn(PRIMARY_BUTTON, "h-9 rounded-xl")}
                        >
                            {moving ? "Déplacement…" : "Déplacer"}
                        </button>
                    )}
                </ModalFooter>
            </Modal>
        </>
    );
}
