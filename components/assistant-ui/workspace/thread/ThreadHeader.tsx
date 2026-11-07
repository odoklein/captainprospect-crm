"use client";

/**
 * Thread header: Dossier › titre (inline rename), chips (mission, Partagée,
 * Agent), and the actions menu — rename, pin, share, move, export as PDF,
 * delete. A thread the viewer cannot write to shows a read-only banner with a
 * fork button.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
    Bot,
    Building2,
    ChevronRight,
    Eye,
    FileDown,
    Folder,
    FolderInput,
    GitFork,
    Globe2,
    Loader2,
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
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { DeleteConversationDialog, MoveConversationDialog } from "./ConversationDialogs";

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
    /** The PDF of the whole conversation is being made. */
    exportingPdf?: boolean;
    onOpenFolder?: (folderId: string | null) => void;
    onRename: (title: string) => void;
    onTogglePin: () => void;
    onToggleVisibility: () => void;
    onMove: (folderId: string | null) => Promise<void> | void;
    onDelete: () => Promise<void>;
    onFork: () => void;
    onExportPdf?: () => void;
}

export function ThreadHeader({
    conversation,
    draftFolder,
    canWrite,
    generalFolders,
    leading,
    trailing,
    compact,
    forking,
    exportingPdf,
    onOpenFolder,
    onRename,
    onTogglePin,
    onToggleVisibility,
    onMove,
    onDelete,
    onFork,
    onExportPdf,
}: ThreadHeaderProps) {
    const [renaming, setRenaming] = useState(false);
    const [draftTitle, setDraftTitle] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [moveOpen, setMoveOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const renameFromMenuRef = useRef(false);

    useEffect(() => {
        if (renaming) inputRef.current?.select();
    }, [renaming]);

    const folder = conversation?.folder ?? null;
    const folderName = conversation ? (folder?.name ?? "Vue agence") : (draftFolder?.name ?? "Vue agence");
    const folderKind = conversation ? (folder?.kind ?? "AGENCY") : (draftFolder?.kind ?? "AGENCY");
    const folderId = conversation ? (conversation.folderId ?? null) : (draftFolder?.id ?? null);
    const FolderIcon = folderKind === "CLIENT" ? Building2 : folderKind === "GENERAL" ? Folder : Globe2;
    const isOwner = conversation?.isOwner ?? true;
    const title = conversation?.title?.trim() || "Nouvelle conversation";
    const pinned = conversation?.pinnedAt !== null && conversation?.pinnedAt !== undefined;
    const shared = conversation?.visibility === "SHARED";
    const isAgent = conversation?.kind === "AGENT";

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

    return (
        <>
            <header className={cn("flex shrink-0 items-center gap-1.5 border-b border-line-subtle bg-surface/90 backdrop-blur-sm", compact ? "h-11 px-2" : "h-14 px-3 sm:px-4")}>
                {leading}
                <nav aria-label="Fil d’Ariane" className="flex min-w-0 flex-1 items-center gap-1 text-[13.5px]">
                    {!compact && (
                        <>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => onOpenFolder?.(folderId)}
                                disabled={!onOpenFolder}
                                className="min-w-0 max-w-[40%] shrink justify-start px-2 font-medium text-ink-3 disabled:opacity-100"
                            >
                                <FolderIcon className="text-ink-4" aria-hidden />
                                <span className="truncate">{folderName}</span>
                            </Button>
                            <ChevronRight className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                        </>
                    )}
                    {renaming ? (
                        <input
                            ref={inputRef}
                            value={draftTitle}
                            onChange={(e) => setDraftTitle(e.target.value)}
                            onBlur={() => endRename(true)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    endRename(true);
                                } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    endRename(false);
                                }
                            }}
                            maxLength={120}
                            aria-label="Titre de la conversation"
                            className="h-8 min-w-0 flex-1 rounded-[10px] border border-primary-400 bg-surface px-2 text-[13.5px] font-semibold text-ink shadow-2xs outline-none ring-4 ring-primary-500/12"
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={startRename}
                            disabled={!conversation || !canWrite}
                            title={conversation && canWrite ? "Renommer" : undefined}
                            aria-current="page"
                            className="inline-flex h-8 min-w-0 items-center rounded-[10px] px-2 font-semibold text-ink transition-colors duration-150 ease-snappy hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none"
                        >
                            <span className="truncate">{title}</span>
                        </button>
                    )}
                    {!renaming && (
                        <div className="flex min-w-0 shrink items-center gap-1.5 max-sm:hidden">
                            {isAgent && (
                                <Badge variant="ai">
                                    <Bot aria-hidden /> Agent
                                </Badge>
                            )}
                            {conversation?.missionName && !compact && (
                                <Badge variant="secondary" className="max-w-[180px] max-md:hidden" title={`Mission : ${conversation.missionName}`}>
                                    <Target aria-hidden />
                                    <span className="truncate">{conversation.missionName}</span>
                                </Badge>
                            )}
                            {shared && (
                                <Badge variant="info" title="Visible par les managers">
                                    <Users aria-hidden /> Partagée
                                </Badge>
                            )}
                        </div>
                    )}
                </nav>

                {trailing}
                {conversation && (
                    <DropdownMenu>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Actions de la conversation">
                                        {exportingPdf ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
                                    </Button>
                                </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Actions</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent
                            align="end"
                            className="w-60"
                            onCloseAutoFocus={(e) => {
                                // « Renommer »: the focus goes to the title field, not back to the button.
                                if (renameFromMenuRef.current) {
                                    renameFromMenuRef.current = false;
                                    e.preventDefault();
                                    inputRef.current?.select();
                                }
                            }}
                        >
                            {canWrite && (
                                <DropdownMenuItem
                                    onSelect={() => {
                                        renameFromMenuRef.current = true;
                                        startRename();
                                    }}
                                >
                                    <Pencil aria-hidden /> Renommer
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onSelect={onTogglePin}>
                                {pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                                {pinned ? "Désépingler" : "Épingler"}
                            </DropdownMenuItem>
                            {isOwner && (
                                <>
                                    <DropdownMenuItem onSelect={onToggleVisibility}>
                                        {shared ? <Lock aria-hidden /> : <Users aria-hidden />}
                                        {shared ? "Rendre privée" : "Partager avec les managers"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setMoveOpen(true)}>
                                        <FolderInput aria-hidden /> Déplacer vers…
                                    </DropdownMenuItem>
                                </>
                            )}
                            {onExportPdf && (
                                <DropdownMenuItem onSelect={onExportPdf} disabled={exportingPdf}>
                                    <FileDown aria-hidden /> Exporter la conversation en PDF
                                </DropdownMenuItem>
                            )}
                            {!canWrite && (
                                <DropdownMenuItem onSelect={onFork} disabled={forking}>
                                    <GitFork aria-hidden /> Continuer dans une nouvelle conversation
                                </DropdownMenuItem>
                            )}
                            {isOwner && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                                        <Trash2 aria-hidden /> Supprimer
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </header>

            {conversation && !canWrite && (
                <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-info-line bg-info-soft/60 px-4 py-2 text-[12.5px] text-info-ink">
                    <Eye className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">Lecture seule{conversation.ownerName ? ` — conversation de ${conversation.ownerName}` : ""}.</span>
                    <Button type="button" variant="outline" size="sm" onClick={onFork} disabled={forking}>
                        {forking ? <Loader2 className="animate-spin" aria-hidden /> : <GitFork aria-hidden />}
                        {forking ? "Création…" : "Continuer dans une nouvelle conversation"}
                    </Button>
                </div>
            )}

            <DeleteConversationDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={title} onConfirm={onDelete} />
            <MoveConversationDialog
                open={moveOpen}
                onOpenChange={setMoveOpen}
                currentFolderId={conversation?.folderId ?? null}
                inClientFolder={folderKind === "CLIENT"}
                generalFolders={generalFolders}
                onMove={onMove}
            />
        </>
    );
}
