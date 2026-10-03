"use client";

import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
    Inbox,
    Send,
    FileText,
    Archive,
    Trash2,
    Star,
    Tag,
    ChevronRight,
    MailOpen,
} from "lucide-react";

// ============================================
// TYPES
// ============================================

interface FolderNavProps {
    selectedFolder: string;
    onSelectFolder: (folder: string) => void;
    mailboxId?: string;
}

interface FolderCounts {
    inbox: number;
    unread: number;
    sent: number;
    drafts: number;
    archive: number;
    trash: number;
    starred: number;
}

// ============================================
// FOLDER NAV COMPONENT
// ============================================

export function FolderNav({
    selectedFolder,
    onSelectFolder,
    mailboxId,
}: FolderNavProps) {
    const [counts, setCounts] = useState<FolderCounts>({
        inbox: 0,
        unread: 0,
        sent: 0,
        drafts: 0,
        archive: 0,
        trash: 0,
        starred: 0,
    });
    const [customLabels, setCustomLabels] = useState<string[]>([]);
    const [showLabels, setShowLabels] = useState(true);

    // Fetch folder counts
    const fetchCounts = useCallback(async () => {
        try {
            const baseParams = new URLSearchParams();
            if (mailboxId) {
                baseParams.set("mailboxId", mailboxId);
            }

            // Fetch inbox and unread counts in parallel
            const inboxParams = new URLSearchParams(baseParams);
            inboxParams.set("folder", "inbox");
            inboxParams.set("limit", "1");

            const unreadParams = new URLSearchParams(baseParams);
            unreadParams.set("folder", "unread");
            unreadParams.set("limit", "1");

            const [inboxRes, unreadRes] = await Promise.all([
                fetch(`/api/email/threads?${inboxParams.toString()}`),
                fetch(`/api/email/threads?${unreadParams.toString()}`),
            ]);

            const [inboxJson, unreadJson] = await Promise.all([
                inboxRes.json(),
                unreadRes.json(),
            ]);

            setCounts(prev => ({
                ...prev,
                inbox: inboxJson.data?.total || 0,
                unread: unreadJson.data?.total || 0,
            }));
        } catch (error) {
            console.error("Failed to fetch folder counts:", error);
        }
    }, [mailboxId]);

    useEffect(() => {
        fetchCounts();
    }, [fetchCounts]);

    const folders = [
        {
            id: "inbox",
            label: "Boîte de réception",
            icon: Inbox,
            count: counts.unread,
            showCount: counts.unread > 0,
        },
        {
            id: "starred",
            label: "Favoris",
            icon: Star,
            count: counts.starred,
            showCount: false,
        },
        {
            id: "sent",
            label: "Envoyés",
            icon: Send,
            count: counts.sent,
            showCount: false,
        },
        {
            id: "drafts",
            label: "Brouillons",
            icon: FileText,
            count: counts.drafts,
            showCount: counts.drafts > 0,
        },
        {
            id: "archive",
            label: "Archives",
            icon: Archive,
            count: counts.archive,
            showCount: false,
        },
        {
            id: "trash",
            label: "Corbeille",
            icon: Trash2,
            count: counts.trash,
            showCount: false,
        },
    ];

    return (
        <div className="py-1">
            {/* Section Label */}
            <div className="px-4 pt-2 pb-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Dossiers
                </span>
            </div>

            {/* Main Folders */}
            <nav className="space-y-0.5 px-2">
                {folders.map((folder) => {
                    const isSelected = selectedFolder === folder.id;
                    return (
                        <button
                            key={folder.id}
                            onClick={() => onSelectFolder(folder.id)}
                            className={cn(
                                "w-full flex items-center gap-2.5 px-3 py-[9px] rounded-xl text-[13px] font-medium transition-all duration-200 group relative",
                                isSelected
                                    ? "bg-primary-50/80 text-primary-700 shadow-sm"
                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                            )}
                        >
                            {isSelected && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary-500 rounded-r-full" />
                            )}
                            <folder.icon className={cn(
                                "w-[18px] h-[18px] flex-shrink-0 transition-colors",
                                isSelected ? "text-primary-500" : "text-slate-400 group-hover:text-slate-500"
                            )} />
                            <span className="flex-1 text-left truncate">{folder.label}</span>
                            {folder.showCount && folder.count > 0 && (
                                <span className={cn(
                                    "min-w-[20px] h-5 flex items-center justify-center px-1.5 text-[11px] font-bold rounded-full tabular-nums",
                                    isSelected
                                        ? "bg-primary-500 text-white"
                                        : "bg-slate-200/80 text-slate-600"
                                )}>
                                    {folder.count > 99 ? "99+" : folder.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Quick Filters */}
            <div className="mt-3 px-2">
                <div className="px-2 pt-2 pb-1.5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Filtres rapides
                    </span>
                </div>
                <div className="space-y-0.5">
                    <button
                        onClick={() => onSelectFolder("unread")}
                        className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-[9px] rounded-xl text-[13px] font-medium transition-all duration-200 group relative",
                            selectedFolder === "unread"
                                ? "bg-primary-50/80 text-primary-700 shadow-sm"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                        )}
                    >
                        {selectedFolder === "unread" && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary-500 rounded-r-full" />
                        )}
                        <MailOpen className={cn(
                            "w-[18px] h-[18px] flex-shrink-0 transition-colors",
                            selectedFolder === "unread" ? "text-primary-500" : "text-slate-400 group-hover:text-slate-500"
                        )} />
                        <span className="flex-1 text-left">Non lus</span>
                        {counts.unread > 0 && (
                            <span className={cn(
                                "min-w-[20px] h-5 flex items-center justify-center px-1.5 text-[11px] font-bold rounded-full tabular-nums",
                                selectedFolder === "unread"
                                    ? "bg-primary-500 text-white"
                                    : "bg-primary-100 text-primary-600"
                            )}>
                                {counts.unread > 99 ? "99+" : counts.unread}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Labels Section */}
            {customLabels.length > 0 && (
                <div className="mt-3 px-2">
                    <button
                        onClick={() => setShowLabels(!showLabels)}
                        className="w-full flex items-center gap-2 px-2 pt-2 pb-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors"
                    >
                        <ChevronRight className={cn(
                            "w-3 h-3 transition-transform duration-200",
                            showLabels && "rotate-90"
                        )} />
                        Labels
                    </button>
                    {showLabels && (
                        <div className="space-y-0.5 mt-0.5">
                            {customLabels.map((label) => (
                                <button
                                    key={label}
                                    onClick={() => onSelectFolder(`label:${label}`)}
                                    className={cn(
                                        "w-full flex items-center gap-2.5 px-3 py-[9px] rounded-xl text-[13px] font-medium transition-all duration-200",
                                        selectedFolder === `label:${label}`
                                            ? "bg-primary-50/80 text-primary-700"
                                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                                    )}
                                >
                                    <Tag className="w-[18px] h-[18px] text-slate-400" />
                                    <span className="flex-1 text-left truncate">{label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default FolderNav;
