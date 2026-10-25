"use client";

import React, { useState, useEffect, useRef } from "react";
import { MailboxManagerDialog } from "./MailboxManagerDialog";
import { cn } from "@/lib/utils";
import { ChevronDown, Mail, Users, Check, Plus, Settings } from "lucide-react";
import { Avatar, StatusDot } from "@/components/ui";
import { TEAM_MAILBOX, type InboxMailbox } from "./inbox-utils";

// ============================================
// TYPES
// ============================================

export type MailboxData = InboxMailbox;

interface MailboxSwitcherProps {
    mailboxes: InboxMailbox[];
    /** Mailbox id, TEAM_MAILBOX, or undefined for "all my mailboxes". */
    selectedMailboxId?: string;
    onSelectMailbox: (mailboxId: string | undefined) => void;
    onMailboxAdded?: () => void;
    /** Supervisors: offer the whole team's mailboxes. */
    showTeamInbox?: boolean;
}

type Tone = "success" | "warning" | "danger" | "neutral";

function syncTone(status: string): Tone {
    if (status === "SYNCED") return "success";
    if (status === "SYNCING" || status === "PENDING") return "warning";
    if (status === "ERROR" || status === "DISCONNECTED") return "danger";
    return "neutral";
}

const SYNC_LABEL: Record<string, string> = {
    SYNCED: "Synchronisée",
    SYNCING: "Synchronisation…",
    PENDING: "En attente de synchronisation",
    ERROR: "Erreur de synchronisation",
    DISCONNECTED: "Déconnectée",
};

// ============================================
// MAILBOX SWITCHER
// ============================================

export function MailboxSwitcher({
    mailboxes,
    selectedMailboxId,
    onSelectMailbox,
    onMailboxAdded,
    showTeamInbox = false,
}: MailboxSwitcherProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [showManagerDialog, setShowManagerDialog] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey, true);
        return () => {
            document.removeEventListener("mousedown", onDown);
            window.removeEventListener("keydown", onKey, true);
        };
    }, [isOpen]);

    const own = mailboxes.filter((m) => m.isOwn !== false);
    const team = mailboxes.filter((m) => m.isOwn === false);
    const selected = mailboxes.find((m) => m.id === selectedMailboxId);
    const isTeam = selectedMailboxId === TEAM_MAILBOX;

    const title = isTeam
        ? "Toute l'équipe"
        : selected
            ? selected.displayName || selected.email
            : own.length > 0 ? "Toutes mes boîtes" : "Mes conversations";
    const subtitle = isTeam
        ? `${mailboxes.length} boîte${mailboxes.length > 1 ? "s" : ""}`
        : selected
            ? selected.isOwn === false && selected.owner ? `${selected.email} · ${selected.owner.name}` : selected.email
            : `${own.length} boîte${own.length > 1 ? "s" : ""}`;

    const pick = (id: string | undefined) => {
        onSelectMailbox(id);
        setIsOpen(false);
    };

    const row = (m: InboxMailbox) => (
        <button
            key={m.id}
            type="button"
            role="option"
            aria-selected={selectedMailboxId === m.id}
            onClick={() => pick(m.id)}
            className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-2",
                selectedMailboxId === m.id && "bg-primary-50",
            )}
        >
            <span className="relative">
                <Avatar name={m.displayName || m.email} size="xs" />
                <StatusDot
                    tone={syncTone(m.syncStatus)}
                    label={SYNC_LABEL[m.syncStatus] ?? m.syncStatus}
                    className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-surface"
                />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{m.displayName || m.email}</span>
                <span className="block truncate text-2xs text-ink-4">
                    {m.isOwn === false && m.owner ? `${m.owner.name} · ` : ""}{m.email}
                </span>
            </span>
            {selectedMailboxId === m.id && <Check className="size-4 shrink-0 text-primary-600" aria-hidden />}
        </button>
    );

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setIsOpen((v) => !v)}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                className={cn(
                    "flex w-full items-center gap-2.5 rounded-control border px-2 py-1.5 text-left transition-colors",
                    isOpen ? "border-line-strong bg-surface" : "border-line bg-surface hover:border-line-strong",
                )}
            >
                {selected ? (
                    <Avatar name={selected.displayName || selected.email} size="xs" />
                ) : (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-3 text-ink-3">
                        {isTeam ? <Users className="size-3.5" aria-hidden /> : <Mail className="size-3.5" aria-hidden />}
                    </span>
                )}
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">{title}</span>
                    <span className="block truncate text-2xs text-ink-4">{subtitle}</span>
                </span>
                <ChevronDown className={cn("size-4 shrink-0 text-ink-4 transition-transform", isOpen && "rotate-180")} aria-hidden />
            </button>

            {isOpen && (
                <div
                    role="listbox"
                    className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-panel border border-line bg-surface py-1 shadow-lg"
                >
                    {own.length > 0 && (
                        <button
                            type="button"
                            role="option"
                            aria-selected={!selectedMailboxId}
                            onClick={() => pick(undefined)}
                            className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2", !selectedMailboxId && "bg-primary-50")}
                        >
                            <span className="flex size-6 items-center justify-center rounded-md bg-surface-3 text-ink-3"><Mail className="size-3.5" aria-hidden /></span>
                            <span className="flex-1 text-[13px] font-medium text-ink">Toutes mes boîtes</span>
                            {!selectedMailboxId && <Check className="size-4 text-primary-600" aria-hidden />}
                        </button>
                    )}
                    {showTeamInbox && team.length > 0 && (
                        <button
                            type="button"
                            role="option"
                            aria-selected={isTeam}
                            onClick={() => pick(TEAM_MAILBOX)}
                            className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2", isTeam && "bg-primary-50")}
                        >
                            <span className="flex size-6 items-center justify-center rounded-md bg-surface-3 text-ink-3"><Users className="size-3.5" aria-hidden /></span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-medium text-ink">Toute l&apos;équipe</span>
                                <span className="block text-2xs text-ink-4">{mailboxes.length} boîtes</span>
                            </span>
                            {isTeam && <Check className="size-4 text-primary-600" aria-hidden />}
                        </button>
                    )}

                    {own.length > 0 && (
                        <>
                            <p className="px-3 pb-1 pt-2.5 text-2xs font-semibold uppercase tracking-wide text-ink-4">Mes boîtes</p>
                            {own.map(row)}
                        </>
                    )}
                    {showTeamInbox && team.length > 0 && (
                        <>
                            <p className="px-3 pb-1 pt-2.5 text-2xs font-semibold uppercase tracking-wide text-ink-4">Équipe</p>
                            {team.map(row)}
                        </>
                    )}

                    <div className="my-1 border-t border-line" />
                    <button
                        type="button"
                        onClick={() => {
                            setIsOpen(false);
                            setShowManagerDialog(true);
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-primary-700 hover:bg-primary-50"
                    >
                        {own.length === 0 ? <Plus className="size-4" aria-hidden /> : <Settings className="size-4" aria-hidden />}
                        {own.length === 0 ? "Connecter une boîte mail" : "Gérer mes boîtes mail"}
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
