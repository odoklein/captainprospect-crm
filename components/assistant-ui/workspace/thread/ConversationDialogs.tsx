"use client";

/**
 * The two confirmations a conversation's menus share (thread header and rail
 * rows): move it to another folder, delete it.
 */

import { useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import type { FolderCard } from "@/lib/assistant/api-contract";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/shadcn/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";

const AGENCY = "__agency__";

export function MoveConversationDialog({
    open,
    onOpenChange,
    currentFolderId,
    inClientFolder,
    generalFolders,
    onMove,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentFolderId: string | null;
    /** A client folder's thread stays in it (it reads that client's data). */
    inClientFolder: boolean;
    generalFolders: FolderCard[];
    onMove: (folderId: string | null) => Promise<void> | void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* Remount per opening: the choice starts on the current folder. */}
            {open && (
                <MoveBody
                    currentFolderId={currentFolderId}
                    inClientFolder={inClientFolder}
                    generalFolders={generalFolders}
                    onMove={onMove}
                    onClose={() => onOpenChange(false)}
                />
            )}
        </Dialog>
    );
}

function MoveBody({
    currentFolderId,
    inClientFolder,
    generalFolders,
    onMove,
    onClose,
}: {
    currentFolderId: string | null;
    inClientFolder: boolean;
    generalFolders: FolderCard[];
    onMove: (folderId: string | null) => Promise<void> | void;
    onClose: () => void;
}) {
    const [target, setTarget] = useState(currentFolderId ?? AGENCY);
    const [moving, setMoving] = useState(false);
    const unchanged = target === (currentFolderId ?? AGENCY);

    return (
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => moving && e.preventDefault()}>
            <DialogHeader>
                <DialogTitle>Déplacer la conversation</DialogTitle>
                <DialogDescription>{inClientFolder ? "Elle reste dans son dossier client." : "Vers un dossier général ou la vue agence."}</DialogDescription>
            </DialogHeader>
            {inClientFolder ? (
                <p className="flex items-start gap-2.5 rounded-panel border border-line bg-surface-2 p-3 text-[13px] leading-relaxed text-ink-2">
                    <Building2 className="mt-0.5 size-4 shrink-0 text-ink-4" aria-hidden />
                    Une conversation d’un dossier client reste dans ce dossier : elle s’appuie sur les données, la mémoire et les fichiers de ce client.
                </p>
            ) : (
                <Select value={target} onValueChange={setTarget}>
                    <SelectTrigger className="w-full" aria-label="Dossier de destination">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={AGENCY}>Vue agence</SelectItem>
                        {generalFolders
                            .filter((f) => !f.id.startsWith("tmp-"))
                            .map((f) => (
                                <SelectItem key={f.id} value={f.id}>
                                    {f.name}
                                </SelectItem>
                            ))}
                    </SelectContent>
                </Select>
            )}
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={moving}>
                    {inClientFolder ? "Fermer" : "Annuler"}
                </Button>
                {!inClientFolder && (
                    <Button
                        type="button"
                        disabled={moving || unchanged}
                        onClick={async () => {
                            setMoving(true);
                            try {
                                await onMove(target === AGENCY ? null : target);
                                onClose();
                            } finally {
                                setMoving(false);
                            }
                        }}
                    >
                        {moving && <Loader2 className="animate-spin" aria-hidden />}
                        {moving ? "Déplacement…" : "Déplacer"}
                    </Button>
                )}
            </DialogFooter>
        </DialogContent>
    );
}

export function DeleteConversationDialog({
    open,
    onOpenChange,
    title,
    onConfirm,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    onConfirm: () => Promise<void>;
}) {
    const [deleting, setDeleting] = useState(false);
    return (
        <AlertDialog open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer la conversation ?</AlertDialogTitle>
                    <AlertDialogDescription>
                        « {title} » et ses messages seront supprimés. Les éléments épinglés au tableau du dossier restent.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                        className={buttonVariants({ variant: "destructive" })}
                        disabled={deleting}
                        onClick={async (e) => {
                            e.preventDefault();
                            setDeleting(true);
                            try {
                                await onConfirm();
                                onOpenChange(false);
                            } finally {
                                setDeleting(false);
                            }
                        }}
                    >
                        {deleting && <Loader2 className="animate-spin" aria-hidden />}
                        {deleting ? "Suppression…" : "Supprimer"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
