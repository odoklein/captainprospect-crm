"use client";

// ============================================
// EMAIL HISTORY PANEL — email conversations with a contact / company /
// mission / client, compact, for CRM drawers and pages. Each row opens the
// conversation in the inbox of the viewer's role.
// ============================================

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowDownLeft, ArrowUpRight, Mail, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, Button, Skeleton } from "@/components/ui";
import { formatSmartDate, threadHref, type OutreachStatus, type ThreadSummary } from "@/components/email/inbox/inbox-utils";

interface EmailHistoryPanelProps {
    contactId?: string | null;
    companyId?: string | null;
    missionId?: string | null;
    clientId?: string | null;
    /** Max conversations shown (default 5). */
    limit?: number;
    className?: string;
}

const STATUS: Record<OutreachStatus, { label: string; variant: "default" | "info" | "success" | "danger" }> = {
    sent: { label: "Envoyé", variant: "default" },
    opened: { label: "Ouvert", variant: "info" },
    replied: { label: "Répondu", variant: "success" },
    bounced: { label: "Non distribué", variant: "danger" },
};

export function EmailHistoryPanel({ contactId, companyId, missionId, clientId, limit = 5, className }: EmailHistoryPanelProps) {
    const { data: session } = useSession();
    const role = session?.user?.role ?? null;
    const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
    const [total, setTotal] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const hasFilter = !!(contactId || companyId || missionId || clientId);

    const load = useCallback(async () => {
        if (!hasFilter) return;
        setError(null);
        setThreads(null);
        const params = new URLSearchParams({ folder: "all", limit: String(limit) });
        if (contactId) params.set("contactId", contactId);
        if (companyId) params.set("companyId", companyId);
        if (missionId) params.set("missionId", missionId);
        if (clientId) params.set("clientId", clientId);
        // Supervisors see the team's mailboxes; others their own + what they sent
        if (role === "MANAGER" || role === "DEVELOPER") params.set("scope", "team");
        try {
            const res = await fetch(`/api/email/threads?${params.toString()}`, { cache: "no-store" });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || `Erreur ${res.status}`);
            setThreads(json.data.threads);
            setTotal(json.data.total);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Erreur de chargement");
            setThreads([]);
        }
    }, [hasFilter, contactId, companyId, missionId, clientId, limit, role]);

    useEffect(() => {
        if (session === undefined) return; // wait for the role
        load();
    }, [load, session]);

    if (!hasFilter) return null;

    return (
        <div className={cn("space-y-1.5", className)}>
            {threads === null ? (
                <div className="space-y-2" aria-busy="true">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            ) : error ? (
                <div className="flex items-center justify-between gap-2 rounded-control border border-line px-3 py-2">
                    <p className="text-xs text-ink-3">Historique email indisponible.</p>
                    <Button size="xs" variant="ghost" leftIcon={<RefreshCw className="size-3" />} onClick={load}>Réessayer</Button>
                </div>
            ) : threads.length === 0 ? (
                <p className="flex items-center gap-2 py-1 text-xs text-ink-4">
                    <Mail className="size-3.5" aria-hidden />
                    Aucun email échangé.
                </p>
            ) : (
                <>
                    <ul className="divide-y divide-line overflow-hidden rounded-control border border-line">
                        {threads.map((t) => {
                            const status = t.outreachStatus ? STATUS[t.outreachStatus] : null;
                            const inbound = t.latestEmail?.direction === "INBOUND";
                            return (
                                <li key={t.id}>
                                    <Link
                                        href={threadHref(role, t.id)}
                                        className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-2"
                                    >
                                        {inbound ? (
                                            <ArrowDownLeft className="size-3.5 shrink-0 text-success" aria-label="Reçu" />
                                        ) : (
                                            <ArrowUpRight className="size-3.5 shrink-0 text-ink-4" aria-label="Envoyé" />
                                        )}
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[13px] font-medium text-ink">{t.subject || "(Sans objet)"}</span>
                                            <span className="block truncate text-2xs text-ink-4">
                                                {t.lastSentBy ? `${t.lastSentBy.name} · ` : ""}
                                                {t.messageCount} message{t.messageCount > 1 ? "s" : ""}
                                            </span>
                                        </span>
                                        {status && <Badge size="sm" variant={status.variant}>{status.label}</Badge>}
                                        <span className="shrink-0 text-2xs tabular-nums text-ink-4">{formatSmartDate(t.lastEmailAt)}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                    {total > threads.length && (
                        <p className="text-2xs text-ink-4">
                            {total - threads.length} autre{total - threads.length > 1 ? "s" : ""} conversation{total - threads.length > 1 ? "s" : ""} dans la boîte de réception.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}

export default EmailHistoryPanel;
