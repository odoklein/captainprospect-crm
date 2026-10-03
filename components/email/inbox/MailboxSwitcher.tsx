"use client";

import React, { useState, useEffect, useRef } from "react";
import { MailboxManagerDialog } from "./MailboxManagerDialog";
import { cn } from "@/lib/utils";
import {
    ChevronDown,
    Mail,
    Users,
    Check,
    Plus,
    Loader2,
    Settings,
} from "lucide-react";
import { getProviderColor } from "@/lib/email/providers/client-utils";
import type { EmailProvider } from "@prisma/client";

// ============================================
// TYPES
// ============================================

export interface MailboxData {
    id: string;
    email: string;
    displayName: string | null;
    provider: EmailProvider;
    type: string;
    syncStatus: string;
    healthScore: number;
}

interface MailboxSwitcherProps {
    mailboxes: MailboxData[];
    selectedMailboxId?: string;
    onSelectMailbox: (mailboxId: string | undefined) => void;
    onMailboxAdded?: () => void;
    showTeamInbox?: boolean;
    isLoading?: boolean;
}

// ============================================
// MAILBOX SWITCHER COMPONENT
// ============================================

export function MailboxSwitcher({
    mailboxes,
    selectedMailboxId,
    onSelectMailbox,
    onMailboxAdded,
    showTeamInbox = false,
    isLoading = false,
}: MailboxSwitcherProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [showManagerDialog, setShowManagerDialog] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsOpen(false);
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [isOpen]);

    const selectedMailbox = mailboxes.find(m => m.id === selectedMailboxId);

    const getStatusColor = (status: string) => {
        switch (status) {
            case "SYNCED":
                return "bg-emerald-400";
            case "SYNCING":
                return "bg-amber-400 animate-pulse";
            case "ERROR":
                return "bg-red-400";
            default:
                return "bg-slate-400";
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-10">
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            </div>
        );
    }

    if (mailboxes.length === 0) {
        return (
            <>
                <button
                    className="flex items-center justify-center gap-2 h-10 px-3 text-sm text-primary-600 hover:bg-primary-50 rounded-xl transition-colors w-full"
                    onClick={() => setShowManagerDialog(true)}
                >
                    <Plus className="w-4 h-4" />
                    Connecter une boîte mail
                </button>
                <MailboxManagerDialog
                    isOpen={showManagerDialog}
                    onClose={() => setShowManagerDialog(false)}
                    onMailboxAdded={() => {
                        onMailboxAdded?.();
                        setShowManagerDialog(false);
                    }}
                />
            </>
        );
    }

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Selected Mailbox Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-full flex items-center gap-2.5 p-2 rounded-xl transition-all duration-200",
                    isOpen ? "bg-slate-100 shadow-sm" : "hover:bg-slate-50"
                )}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
            >
                <div
                    className="relative w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm flex-shrink-0"
                    style={{ backgroundColor: selectedMailbox ? getProviderColor(selectedMailbox.provider) : "#6366f1" }}
                >
                    {selectedMailbox?.email?.[0]?.toUpperCase() || <Mail className="w-4 h-4" />}
                    {selectedMailbox && (
                        <div className={cn(
                            "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white",
                            getStatusColor(selectedMailbox.syncStatus)
                        )} />
                    )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                    <p className="text-[13px] font-semibold text-slate-800 truncate">
                        {selectedMailbox?.displayName || selectedMailbox?.email || "Toutes les boîtes"}
                    </p>
                    {selectedMailbox && (
                        <p className="text-[11px] text-slate-400 truncate">
                            {selectedMailbox.email}
                        </p>
                    )}
                </div>
                <ChevronDown className={cn(
                    "w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0",
                    isOpen && "rotate-180"
                )} />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div
                    className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 max-h-72 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200"
                    role="listbox"
                >
                    {/* All mailboxes option */}
                    <button
                        onClick={() => {
                            onSelectMailbox(undefined);
                            setIsOpen(false);
                        }}
                        className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors",
                            !selectedMailboxId && "bg-primary-50/60"
                        )}
                        role="option"
                        aria-selected={!selectedMailboxId}
                    >
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <Mail className="w-4 h-4 text-slate-500" />
                        </div>
                        <div className="flex-1 text-left">
                            <p className="text-[13px] font-medium text-slate-800">Toutes les boîtes</p>
                            <p className="text-[11px] text-slate-400">{mailboxes.length} boîte{mailboxes.length > 1 ? "s" : ""}</p>
                        </div>
                        {!selectedMailboxId && (
                            <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />
                        )}
                    </button>

                    {/* Team inbox option */}
                    {showTeamInbox && (
                        <button
                            onClick={() => {
                                setIsOpen(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors"
                            role="option"
                        >
                            <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                                <Users className="w-4 h-4 text-primary-600" />
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-[13px] font-medium text-slate-800">Team Inbox</p>
                                <p className="text-[11px] text-slate-400">Toute l&apos;équipe</p>
                            </div>
                        </button>
                    )}

                    <div className="my-1.5 border-t border-slate-100" />

                    {/* Individual mailboxes */}
                    {mailboxes.map((mailbox) => (
                        <button
                            key={mailbox.id}
                            onClick={() => {
                                onSelectMailbox(mailbox.id);
                                setIsOpen(false);
                            }}
                            className={cn(
                                "w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors",
                                selectedMailboxId === mailbox.id && "bg-primary-50/60"
                            )}
                            role="option"
                            aria-selected={selectedMailboxId === mailbox.id}
                        >
                            <div
                                className="relative w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm"
                                style={{ backgroundColor: getProviderColor(mailbox.provider) }}
                            >
                                {mailbox.email[0].toUpperCase()}
                                <div className={cn(
                                    "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white",
                                    getStatusColor(mailbox.syncStatus)
                                )} />
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                                <p className="text-[13px] font-medium text-slate-800 truncate">
                                    {mailbox.displayName || mailbox.email}
                                </p>
                                <p className="text-[11px] text-slate-400 truncate">
                                    {mailbox.email}
                                </p>
                            </div>
                            {selectedMailboxId === mailbox.id && (
                                <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />
                            )}
                        </button>
                    ))}

                    {/* Manage mailboxes */}
                    <div className="my-1.5 border-t border-slate-100" />
                    <button
                        onClick={() => {
                            setIsOpen(false);
                            setShowManagerDialog(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-primary-600 hover:bg-primary-50 transition-colors font-medium"
                    >
                        <Settings className="w-4 h-4" />
                        Gérer les boîtes mails
                    </button>
                </div>
            )}

            <MailboxManagerDialog
                isOpen={showManagerDialog}
                onClose={() => setShowManagerDialog(false)}
                onMailboxAdded={() => {
                    onMailboxAdded?.();
                    setShowManagerDialog(false);
                }}
            />
        </div>
    );
}

export default MailboxSwitcher;
