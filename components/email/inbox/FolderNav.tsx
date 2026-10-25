"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Inbox, Send, Archive, Trash2, Star, Tag, MailOpen, ChevronRight, Layers } from "lucide-react";
import { fetchJson } from "./inbox-utils";

// ============================================
// TYPES
// ============================================

interface FolderNavProps {
    selectedFolder: string;
    onSelectFolder: (folder: string) => void;
    /** Visibility query shared with the thread list ("mailboxId=…", "scope=team" or ""). */
    scopeQuery: string;
    /** Bumped by the layout after any change that can move counts. */
    refreshKey?: number;
}

// ============================================
// FOLDER NAV
// ============================================

const FOLDERS = [
    { id: "inbox", label: "Boîte de réception", icon: Inbox },
    { id: "unread", label: "Non lus", icon: MailOpen },
    { id: "starred", label: "Favoris", icon: Star },
    { id: "sent", label: "Envoyés", icon: Send },
    { id: "archive", label: "Archives", icon: Archive },
    { id: "all", label: "Tous les messages", icon: Layers },
    { id: "trash", label: "Corbeille", icon: Trash2 },
] as const;

export function FolderNav({ selectedFolder, onSelectFolder, scopeQuery, refreshKey = 0 }: FolderNavProps) {
    const [unread, setUnread] = useState(0);
    const [labels, setLabels] = useState<{ label: string; count: number }[]>([]);
    const [showLabels, setShowLabels] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const q = scopeQuery ? `&${scopeQuery}` : "";
        Promise.allSettled([
            fetchJson<{ total: number }>(`/api/email/threads?folder=unread&limit=1${q}`),
            fetchJson<{ label: string; count: number }[]>(`/api/email/threads/labels?${scopeQuery}`),
        ]).then(([u, l]) => {
            if (cancelled) return;
            if (u.status === "fulfilled") setUnread(u.value.total || 0);
            if (l.status === "fulfilled") setLabels(l.value || []);
        });
        return () => {
            cancelled = true;
        };
    }, [scopeQuery, refreshKey]);

    return (
        <nav className="py-1" aria-label="Dossiers">
            <ul className="space-y-px px-2">
                {FOLDERS.map((folder) => {
                    const isSelected = selectedFolder === folder.id;
                    const count = folder.id === "inbox" || folder.id === "unread" ? unread : 0;
                    return (
                        <li key={folder.id}>
                            <button
                                type="button"
                                onClick={() => onSelectFolder(folder.id)}
                                aria-current={isSelected ? "page" : undefined}
                                className={cn(
                                    "flex h-8 w-full items-center gap-2.5 rounded-control px-2.5 text-[13px] transition-colors",
                                    isSelected
                                        ? "bg-primary-50 font-semibold text-primary-700"
                                        : "font-medium text-ink-2 hover:bg-surface-3 hover:text-ink",
                                )}
                            >
                                <folder.icon className={cn("size-4 shrink-0", isSelected ? "text-primary-600" : "text-ink-4")} aria-hidden />
                                <span className="flex-1 truncate text-left">{folder.label}</span>
                                {count > 0 && (
                                    <span
                                        className={cn(
                                            "min-w-5 rounded-full px-1.5 text-center text-2xs font-semibold tabular-nums",
                                            isSelected ? "bg-primary-600 text-primary-fg" : "text-ink-3",
                                        )}
                                    >
                                        {count > 99 ? "99+" : count}
                                    </span>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>

            {labels.length > 0 && (
                <div className="mt-3 px-2">
                    <button
                        type="button"
                        onClick={() => setShowLabels((v) => !v)}
                        aria-expanded={showLabels}
                        className="flex w-full items-center gap-1.5 px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-ink-4 transition-colors hover:text-ink-2"
                    >
                        <ChevronRight className={cn("size-3 transition-transform", showLabels && "rotate-90")} aria-hidden />
                        Libellés
                    </button>
                    {showLabels && (
                        <ul className="space-y-px">
                            {labels.map(({ label, count }) => {
                                const id = `label:${label}`;
                                const isSelected = selectedFolder === id;
                                return (
                                    <li key={label}>
                                        <button
                                            type="button"
                                            onClick={() => onSelectFolder(id)}
                                            aria-current={isSelected ? "page" : undefined}
                                            className={cn(
                                                "flex h-8 w-full items-center gap-2.5 rounded-control px-2.5 text-[13px] transition-colors",
                                                isSelected
                                                    ? "bg-primary-50 font-semibold text-primary-700"
                                                    : "font-medium text-ink-2 hover:bg-surface-3 hover:text-ink",
                                            )}
                                        >
                                            <Tag className={cn("size-4 shrink-0", isSelected ? "text-primary-600" : "text-ink-4")} aria-hidden />
                                            <span className="flex-1 truncate text-left">{label}</span>
                                            <span className="text-2xs tabular-nums text-ink-4">{count}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </nav>
    );
}

export default FolderNav;
