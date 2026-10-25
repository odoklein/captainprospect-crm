"use client";

// ============================================
// INBOX — three panes (folders · conversations · conversation) + CRM context.
//
// URL is the source of truth for navigation, so deep links, refresh and the
// back button work:  ?folder=  ?mailbox=<id|team>  ?thread=  ?q=  ?compose=1[&to=]
// Fills its parent (Email Hub frame, developer layout); never sizes itself
// against the viewport.
// ============================================

import React, { useState, useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
    PanelLeftClose,
    PanelLeftOpen,
    PenSquare,
    RefreshCw,
    Keyboard,
    Search,
    X,
    Mail,
    AlertTriangle,
} from "lucide-react";
import { Button, Callout, IconButton, Kbd, Modal, Skeleton, useToast } from "@/components/ui";
import { MailboxSwitcher } from "./MailboxSwitcher";
import { MailboxManagerDialog } from "./MailboxManagerDialog";
import { FolderNav } from "./FolderNav";
import { ThreadList } from "./ThreadList";
import { ThreadView } from "./ThreadView";
import { ContextPanel } from "./ContextPanel";
import { EmailComposer, type ComposerContext } from "./EmailComposer";
import { EmailOnboarding } from "./EmailOnboarding";
import {
    TEAM_MAILBOX,
    buildComposeDraft,
    fetchJson,
    folderLabel,
    isSupervisorRole,
    type ComposeDraft,
    type ComposeMode,
    type InboxMailbox,
    type ThreadDetail,
    type ThreadLinks,
    type ThreadSummary,
} from "./inbox-utils";

// ============================================
// TYPES
// ============================================

export interface InboxLayoutProps {
    initialMailboxId?: string;
    initialFolder?: string;
    /** Supervisors (manager/developer): offer the team's mailboxes. */
    showTeamInbox?: boolean;
    className?: string;
    /** Rendered outside the Email Hub frame (developer mailbox). Same layout. */
    standalone?: boolean;
}

/** @deprecated kept for imports; the layout works with ThreadSummary. */
export interface SelectedThread {
    id: string;
    subject: string;
    mailboxId: string;
}

const PAGE_SIZE = 40;
const LS_RAIL = "cp.inbox.railCollapsed";
const LS_CONTEXT = "cp.inbox.contextOpen";

function readLs(key: string, fallback: boolean): boolean {
    try {
        const v = window.localStorage.getItem(key);
        return v === null ? fallback : v === "1";
    } catch {
        return fallback;
    }
}

function writeLs(key: string, value: boolean) {
    try {
        window.localStorage.setItem(key, value ? "1" : "0");
    } catch {
        // private mode / blocked storage: preference not kept
    }
}

const SHORTCUTS: { keys: string[]; label: string }[] = [
    { keys: ["J"], label: "Conversation suivante" },
    { keys: ["K"], label: "Conversation précédente" },
    { keys: ["E"], label: "Archiver / désarchiver" },
    { keys: ["S"], label: "Ajouter / retirer des favoris" },
    { keys: ["#"], label: "Mettre à la corbeille" },
    { keys: ["U"], label: "Marquer comme non lu" },
    { keys: ["R"], label: "Répondre" },
    { keys: ["A"], label: "Répondre à tous" },
    { keys: ["F"], label: "Transférer" },
    { keys: ["C"], label: "Nouveau message" },
    { keys: ["/"], label: "Rechercher" },
    { keys: ["I"], label: "Afficher / masquer le contexte CRM" },
    { keys: ["Échap"], label: "Fermer la conversation" },
    { keys: ["Ctrl", "Entrée"], label: "Envoyer (dans l'éditeur)" },
    { keys: ["?"], label: "Afficher cette aide" },
];

// ============================================
// INBOX LAYOUT
// ============================================

export function InboxLayout({
    initialMailboxId,
    initialFolder = "inbox",
    showTeamInbox = false,
    className,
    standalone = false,
}: InboxLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { data: session } = useSession();
    const role = session?.user?.role ?? null;
    const supervisor = isSupervisorRole(role);
    const toast = useToast();

    // ---- URL state ------------------------------------------------------
    const folder = searchParams.get("folder") || initialFolder;
    const mailboxParam = searchParams.get("mailbox") || initialMailboxId || undefined;
    const threadId = searchParams.get("thread");
    const q = searchParams.get("q") || "";

    const setParams = useCallback(
        (patch: Record<string, string | null | undefined>, mode: "push" | "replace" = "push") => {
            const p = new URLSearchParams(searchParams.toString());
            for (const [k, v] of Object.entries(patch)) {
                if (v === null || v === undefined || v === "") p.delete(k);
                else p.set(k, v);
            }
            if (p.get("folder") === "inbox") p.delete("folder");
            const qs = p.toString();
            const url = qs ? `${pathname}?${qs}` : pathname;
            if (mode === "push") router.push(url, { scroll: false });
            else router.replace(url, { scroll: false });
        },
        [router, pathname, searchParams],
    );

    // ---- Mailboxes ------------------------------------------------------
    const [mailboxes, setMailboxes] = useState<InboxMailbox[]>([]);
    const [mailboxesLoading, setMailboxesLoading] = useState(true);
    const [mailboxError, setMailboxError] = useState<string | null>(null);
    const [showMailboxDialog, setShowMailboxDialog] = useState(false);

    const loadMailboxes = useCallback(async () => {
        setMailboxesLoading(true);
        setMailboxError(null);
        try {
            const url = showTeamInbox && supervisor ? "/api/email/mailboxes?scope=team" : "/api/email/mailboxes?includeShared=true";
            setMailboxes(await fetchJson<InboxMailbox[]>(url));
        } catch (e) {
            setMailboxError(e instanceof Error ? e.message : "Impossible de charger les boîtes mail");
        } finally {
            setMailboxesLoading(false);
        }
    }, [showTeamInbox, supervisor]);

    useEffect(() => {
        if (session === undefined) return; // wait for the role
        loadMailboxes();
    }, [loadMailboxes, session]);

    const ownMailboxes = mailboxes.filter((m) => m.isOwn !== false);
    // Supervisor without own mailbox lands on the team view
    const mailboxSel: string | undefined =
        mailboxParam ?? (ownMailboxes.length === 0 && supervisor && showTeamInbox && mailboxes.length > 0 ? TEAM_MAILBOX : undefined);
    const scopeQuery =
        mailboxSel === TEAM_MAILBOX ? "scope=team" : mailboxSel ? `mailboxId=${encodeURIComponent(mailboxSel)}` : "";
    const selectedMailbox = mailboxes.find((m) => m.id === mailboxSel);

    // ---- Sync -----------------------------------------------------------
    const [isSyncing, setIsSyncing] = useState(false);
    const syncedOnce = useRef(false);
    const [listRefresh, setListRefresh] = useState(0);
    const [navRefresh, setNavRefresh] = useState(0);

    useEffect(() => {
        if (ownMailboxes.length > 0 && !syncedOnce.current) {
            syncedOnce.current = true;
            fetch("/api/email/sync", { method: "POST" }).catch(() => undefined);
        }
    }, [ownMailboxes.length]);

    const handleSync = useCallback(async () => {
        setIsSyncing(true);
        try {
            const res = await fetch("/api/email/sync", { method: "POST" });
            if (!res.ok) throw new Error();
            setListRefresh((k) => k + 1);
            setNavRefresh((k) => k + 1);
            toast.success("Synchronisation terminée");
        } catch {
            toast.error("Échec de la synchronisation", "Réessayez dans quelques instants.");
        } finally {
            setIsSyncing(false);
        }
    }, [toast]);

    // ---- Search (debounced into ?q=) --------------------------------------
    const [searchInput, setSearchInput] = useState(q);
    const searchRef = useRef<HTMLInputElement>(null);
    const lastPushedQ = useRef(q);

    useEffect(() => {
        if (q !== lastPushedQ.current) {
            lastPushedQ.current = q;
            setSearchInput(q);
        }
    }, [q]);

    useEffect(() => {
        const value = searchInput.trim();
        if (value === lastPushedQ.current) return;
        const t = setTimeout(() => {
            lastPushedQ.current = value;
            setParams({ q: value || null }, "replace");
        }, 300);
        return () => clearTimeout(t);
    }, [searchInput, setParams]);

    // ---- Thread list ------------------------------------------------------
    const [threads, setThreads] = useState<ThreadSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [listLoading, setListLoading] = useState(true);
    const [listLoadingMore, setListLoadingMore] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const listReq = useRef(0);
    const listReady = !mailboxesLoading && !mailboxError;

    const loadThreads = useCallback(
        async (pageNum: number) => {
            const reqId = ++listReq.current;
            if (pageNum === 1) {
                setListLoading(true);
                setListError(null);
            } else {
                setListLoadingMore(true);
            }
            try {
                const params = new URLSearchParams({ folder, page: String(pageNum), limit: String(PAGE_SIZE) });
                if (q) params.set("search", q);
                const url = `/api/email/threads?${params.toString()}${scopeQuery ? `&${scopeQuery}` : ""}`;
                const data = await fetchJson<{ threads: ThreadSummary[]; total: number; hasMore: boolean }>(url);
                if (reqId !== listReq.current) return;
                setThreads((prev) => (pageNum === 1 ? data.threads : [...prev, ...data.threads.filter((t) => !prev.some((p) => p.id === t.id))]));
                setTotal(data.total);
                setHasMore(data.hasMore);
                setPage(pageNum);
            } catch (e) {
                if (reqId !== listReq.current) return;
                setListError(e instanceof Error ? e.message : "Erreur de chargement");
            } finally {
                if (reqId === listReq.current) {
                    setListLoading(false);
                    setListLoadingMore(false);
                }
            }
        },
        [folder, q, scopeQuery],
    );

    useEffect(() => {
        if (!listReady) return;
        loadThreads(1);
    }, [loadThreads, listRefresh, listReady]);

    // Background refresh every 60 s while the tab is visible
    useEffect(() => {
        if (!listReady) return;
        const id = window.setInterval(() => {
            if (document.visibilityState === "visible" && page === 1) {
                loadThreads(1);
                setNavRefresh((k) => k + 1);
            }
        }, 60_000);
        return () => window.clearInterval(id);
    }, [listReady, loadThreads, page]);

    // ---- Thread detail ----------------------------------------------------
    const [detail, setDetail] = useState<ThreadDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [detailRefresh, setDetailRefresh] = useState(0);

    useEffect(() => {
        if (!threadId) {
            setDetail(null);
            setDetailError(null);
            return;
        }
        let cancelled = false;
        setDetailLoading(true);
        setDetailError(null);
        setDetail((d) => (d?.id === threadId ? d : null));
        fetchJson<ThreadDetail>(`/api/email/threads/${encodeURIComponent(threadId)}`)
            .then((data) => {
                if (cancelled) return;
                setDetail(data);
                // Opening marks it read: reflect in the list and the counters
                setThreads((prev) => prev.map((t) => (t.id === data.id && !t.isRead ? { ...t, isRead: true } : t)));
                setNavRefresh((k) => k + 1);
            })
            .catch((e: Error) => !cancelled && setDetailError(e.message))
            .finally(() => !cancelled && setDetailLoading(false));
        return () => {
            cancelled = true;
        };
    }, [threadId, detailRefresh]);

    // ---- Panels -----------------------------------------------------------
    const [railCollapsed, setRailCollapsed] = useState(false);
    const [contextOpen, setContextOpen] = useState(true);
    useEffect(() => {
        setRailCollapsed(readLs(LS_RAIL, false));
        setContextOpen(readLs(LS_CONTEXT, true));
    }, []);
    const toggleRail = useCallback(() => {
        setRailCollapsed((v) => {
            writeLs(LS_RAIL, !v);
            return !v;
        });
    }, []);
    const toggleContext = useCallback(() => {
        setContextOpen((v) => {
            writeLs(LS_CONTEXT, !v);
            return !v;
        });
    }, []);
    const [showHelp, setShowHelp] = useState(false);

    // ---- Navigation handlers ---------------------------------------------
    const openThread = useCallback(
        (id: string, mode: "push" | "replace" = "push") => setParams({ thread: id, compose: null }, mode),
        [setParams],
    );
    const closeThread = useCallback(() => setParams({ thread: null }, "replace"), [setParams]);
    const selectFolder = useCallback((f: string) => setParams({ folder: f, thread: null }), [setParams]);
    const selectMailbox = useCallback(
        (id: string | undefined) => setParams({ mailbox: id ?? null, thread: null }),
        [setParams],
    );

    const neighbour = useCallback(
        (id: string, dir: 1 | -1): ThreadSummary | null => {
            const i = threads.findIndex((t) => t.id === id);
            if (i === -1) return null;
            return threads[i + dir] ?? null;
        },
        [threads],
    );

    // ---- Thread actions (optimistic) --------------------------------------
    const patchThread = useCallback(
        async (id: string, patch: Partial<Pick<ThreadSummary, "isStarred" | "isArchived" | "isRead" | "isTrashed">>, opts: { removeFromList?: boolean } = {}) => {
            const prevThreads = threads;
            const prevDetail = detail;
            setThreads((list) =>
                opts.removeFromList ? list.filter((t) => t.id !== id) : list.map((t) => (t.id === id ? { ...t, ...patch } : t)),
            );
            if (opts.removeFromList) setTotal((n) => Math.max(0, n - 1));
            setDetail((d) => (d && d.id === id ? { ...d, ...patch } : d));
            try {
                await fetchJson(`/api/email/threads/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(patch),
                });
                setNavRefresh((k) => k + 1);
                return true;
            } catch (e) {
                setThreads(prevThreads);
                setDetail(prevDetail);
                if (opts.removeFromList) setTotal((n) => n + 1);
                toast.error("Action impossible", e instanceof Error ? e.message : undefined);
                return false;
            }
        },
        [threads, detail, toast],
    );

    const findThread = useCallback(
        (id: string) => threads.find((t) => t.id === id) ?? (detail?.id === id ? detail : null),
        [threads, detail],
    );

    const toggleStar = useCallback(
        (id: string) => {
            const t = findThread(id);
            if (!t) return;
            patchThread(id, { isStarred: !t.isStarred }, { removeFromList: folder === "starred" && t.isStarred });
        },
        [findThread, patchThread, folder],
    );

    /** Leaves the open thread for its neighbour (Gmail-like) when it disappears from the list. */
    const moveAwayFrom = useCallback(
        (id: string) => {
            if (threadId !== id) return;
            const next = neighbour(id, 1) ?? neighbour(id, -1);
            if (next) openThread(next.id, "replace");
            else closeThread();
        },
        [threadId, neighbour, openThread, closeThread],
    );

    const toggleArchive = useCallback(
        async (id: string) => {
            const t = findThread(id);
            if (!t) return;
            const archiving = !t.isArchived;
            const leavesList = folder === "inbox" || folder === "unread" || folder === "archive";
            if (leavesList) moveAwayFrom(id);
            const ok = await patchThread(id, { isArchived: archiving }, { removeFromList: leavesList });
            if (ok) {
                toast.addToast({
                    type: "success",
                    title: archiving ? "Conversation archivée" : "Remise en boîte de réception",
                    action: {
                        label: "Annuler",
                        onClick: () => {
                            fetchJson(`/api/email/threads/${id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ isArchived: !archiving }),
                            })
                                .then(() => setListRefresh((k) => k + 1))
                                .catch(() => toast.error("Annulation impossible"));
                        },
                    },
                });
            }
        },
        [findThread, folder, moveAwayFrom, patchThread, toast],
    );

    const trashThread = useCallback(
        async (id: string) => {
            if (folder === "trash") return;
            moveAwayFrom(id);
            const prevThreads = threads;
            setThreads((list) => list.filter((t) => t.id !== id));
            setTotal((n) => Math.max(0, n - 1));
            try {
                await fetchJson(`/api/email/threads/${id}`, { method: "DELETE" });
                setNavRefresh((k) => k + 1);
                toast.addToast({
                    type: "success",
                    title: "Conversation déplacée dans la corbeille",
                    action: {
                        label: "Annuler",
                        onClick: () => {
                            fetchJson(`/api/email/threads/${id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ isTrashed: false }),
                            })
                                .then(() => setListRefresh((k) => k + 1))
                                .catch(() => toast.error("Annulation impossible"));
                        },
                    },
                });
            } catch (e) {
                setThreads(prevThreads);
                setTotal((n) => n + 1);
                toast.error("Suppression impossible", e instanceof Error ? e.message : undefined);
            }
        },
        [folder, moveAwayFrom, threads, toast],
    );

    const markUnread = useCallback(
        (id: string) => {
            patchThread(id, { isRead: false }, { removeFromList: false });
            if (threadId === id) closeThread();
        },
        [patchThread, threadId, closeThread],
    );

    // ---- Composer ----------------------------------------------------------
    const [composer, setComposer] = useState<{
        key: number;
        draft: ComposeDraft;
        context?: ComposerContext;
        lockedMailbox?: { id: string; email: string; displayName: string | null } | null;
    } | null>(null);

    const openNewComposer = useCallback((to: string[] = []) => {
        setComposer({ key: Date.now(), draft: { mode: "new", subject: "", to, cc: [] } });
    }, []);

    const openReplyComposer = useCallback(
        (mode: Exclude<ComposeMode, "new">) => {
            if (!detail) return;
            if (!detail.permissions.canSend) {
                toast.warning("Réponse impossible", detail.permissions.sendBlockedReason ?? "Vous ne pouvez pas envoyer depuis cette boîte.");
                return;
            }
            const contact = detail.contact;
            setComposer({
                key: Date.now(),
                draft: buildComposeDraft(detail, mode),
                lockedMailbox: { id: detail.mailbox.id, email: detail.mailbox.email, displayName: detail.mailbox.displayName },
                context: {
                    contactId: detail.contactId,
                    missionId: detail.missionId,
                    missionName: detail.mission?.name ?? null,
                    contact: contact
                        ? {
                            firstName: contact.firstName,
                            lastName: contact.lastName,
                            title: contact.title,
                            email: contact.email,
                            companyName: contact.company?.name ?? null,
                        }
                        : null,
                },
            });
        },
        [detail, toast],
    );

    // ?compose=1[&to=a@b.c] opens a new message, then leaves the URL
    const composeParam = searchParams.get("compose");
    useEffect(() => {
        if (composeParam !== "1") return;
        const to = (searchParams.get("to") || "").split(",").map((s) => s.trim()).filter(Boolean);
        openNewComposer(to);
        setParams({ compose: null, to: null }, "replace");
    }, [composeParam, searchParams, openNewComposer, setParams]);

    const handleSent = useCallback(
        (result: { threadId?: string }) => {
            const wasReplyHere = !!composer?.draft.threadId && composer.draft.threadId === threadId;
            setComposer(null);
            setListRefresh((k) => k + 1);
            setNavRefresh((k) => k + 1);
            if (wasReplyHere) setDetailRefresh((k) => k + 1);
            const newThread = result.threadId && result.threadId !== threadId ? result.threadId : null;
            toast.addToast({
                type: "success",
                title: "Message envoyé",
                ...(newThread && {
                    action: { label: "Voir la conversation", onClick: () => openThread(newThread) },
                }),
            });
        },
        [composer, threadId, toast, openThread],
    );

    // ---- Keyboard ------------------------------------------------------------
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
            const t = e.target as HTMLElement | null;
            if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
            if (document.querySelector('[aria-modal="true"]')) return;

            const current = threadId;
            const key = e.key;
            const go = (dir: 1 | -1) => {
                if (threads.length === 0) return;
                const target = current ? neighbour(current, dir) : threads[0];
                if (target) openThread(target.id, "replace");
            };

            switch (key) {
                case "j": e.preventDefault(); go(1); break;
                case "k": e.preventDefault(); go(-1); break;
                case "e": if (current) { e.preventDefault(); toggleArchive(current); } break;
                case "s": if (current) { e.preventDefault(); toggleStar(current); } break;
                case "#": if (current) { e.preventDefault(); trashThread(current); } break;
                case "u": if (current) { e.preventDefault(); markUnread(current); } break;
                case "r": if (current && detail) { e.preventDefault(); openReplyComposer("reply"); } break;
                case "a": if (current && detail) { e.preventDefault(); openReplyComposer("replyAll"); } break;
                case "f": if (current && detail) { e.preventDefault(); openReplyComposer("forward"); } break;
                case "c": e.preventDefault(); openNewComposer(); break;
                case "i": if (current) { e.preventDefault(); toggleContext(); } break;
                case "/": e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); break;
                case "?": e.preventDefault(); setShowHelp(true); break;
                case "Escape": if (current) { e.preventDefault(); closeThread(); } break;
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [threadId, threads, detail, neighbour, openThread, closeThread, toggleArchive, toggleStar, trashThread, markUnread, openReplyComposer, openNewComposer, toggleContext]);

    // ---- Detail updates from the context panel --------------------------
    const onLinksChanged = useCallback((links: ThreadLinks) => {
        setDetail((d) => (d ? { ...d, ...links } : d));
        setThreads((list) =>
            list.map((t) =>
                t.id === threadId
                    ? {
                        ...t,
                        contactId: links.contactId,
                        missionId: links.missionId,
                        clientId: links.clientId,
                        contact: links.contact ? { id: links.contact.id, firstName: links.contact.firstName, lastName: links.contact.lastName, companyId: links.contact.company?.id ?? "" } : null,
                        mission: links.mission ? { id: links.mission.id, name: links.mission.name } : null,
                    }
                    : t,
            ),
        );
    }, [threadId]);

    const showContext = !!threadId && !!detail && contextOpen;
    const noOwnMailbox = !mailboxesLoading && ownMailboxes.length === 0;
    const header = folderLabel(folder);

    // ======================================================================
    // RENDER
    // ======================================================================

    const frame = cn("flex h-full min-h-0 w-full flex-1 overflow-hidden bg-surface", standalone && "border-t border-line", className);

    if (mailboxesLoading && mailboxes.length === 0) {
        return (
            <div className={frame} aria-busy="true">
                <div className="hidden w-[220px] shrink-0 space-y-3 border-r border-line bg-surface-2 p-3 lg:block">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-11 w-full" />
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
                </div>
                <div className="w-full shrink-0 space-y-3 border-r border-line p-3 lg:w-[340px]">
                    <Skeleton className="h-9 w-full" />
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="space-y-2 py-1">
                            <Skeleton className="h-3.5 w-1/2" />
                            <Skeleton className="h-3 w-5/6" />
                        </div>
                    ))}
                </div>
                <div className="hidden flex-1 bg-canvas lg:block" />
            </div>
        );
    }

    if (mailboxError && mailboxes.length === 0) {
        return (
            <div className={cn(frame, "items-start justify-center bg-canvas p-6")}>
                <Callout
                    tone="danger"
                    title="Impossible de charger vos boîtes mail"
                    className="max-w-lg"
                    action={<Button size="sm" variant="secondary" leftIcon={<RefreshCw className="size-3.5" />} onClick={loadMailboxes}>Réessayer</Button>}
                >
                    {mailboxError}
                </Callout>
            </div>
        );
    }

    // Nobody to read for: connect a mailbox first (SDR-side roles still see
    // the conversations they started from mission mailboxes, below)
    if (mailboxes.length === 0 && supervisor) {
        return (
            <div className={cn(frame, "overflow-y-auto bg-canvas")}>
                <div className="w-full">
                    <EmailOnboarding onMailboxConnected={() => { loadMailboxes(); toast.success("Boîte mail connectée"); }} />
                </div>
            </div>
        );
    }

    return (
        <div className={frame}>
            {/* ---------------- Left rail: compose, mailbox, folders ---------------- */}
            <aside
                className={cn(
                    "hidden shrink-0 flex-col border-r border-line bg-surface-2 lg:flex",
                    railCollapsed ? "w-0 overflow-hidden border-r-0" : "w-[220px]",
                )}
                aria-label="Navigation de la messagerie"
            >
                <div className="space-y-2 p-3">
                    <Button fullWidth size="sm" leftIcon={<PenSquare className="size-4" />} onClick={() => openNewComposer()}>
                        Nouveau message
                    </Button>
                    <MailboxSwitcher
                        mailboxes={mailboxes}
                        selectedMailboxId={mailboxSel}
                        onSelectMailbox={selectMailbox}
                        onMailboxAdded={loadMailboxes}
                        showTeamInbox={showTeamInbox && supervisor}
                    />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto pb-3 email-scrollbar">
                    <FolderNav selectedFolder={folder} onSelectFolder={selectFolder} scopeQuery={scopeQuery} refreshKey={navRefresh} />
                </div>
            </aside>

            {/* ---------------- Conversation list ---------------- */}
            <section
                className={cn(
                    "flex min-h-0 w-full shrink-0 flex-col border-r border-line bg-surface lg:w-[340px] xl:w-[360px]",
                    threadId && "hidden lg:flex",
                )}
                aria-label="Liste des conversations"
            >
                <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
                    <IconButton
                        size="sm"
                        icon={railCollapsed ? PanelLeftOpen : PanelLeftClose}
                        label={railCollapsed ? "Afficher les dossiers" : "Masquer les dossiers"}
                        onClick={toggleRail}
                        className="hidden lg:inline-flex"
                    />
                    <h1 className="min-w-0 flex-1 truncate px-1 text-sm font-semibold text-ink">
                        {header}
                        {!listLoading && total > 0 && <span className="ml-1.5 text-xs font-normal tabular-nums text-ink-4">{total}</span>}
                    </h1>
                    {/* Folders on small screens */}
                    <select
                        value={folder}
                        onChange={(e) => selectFolder(e.target.value)}
                        aria-label="Dossier"
                        className="h-8 rounded-control border border-line bg-surface px-2 text-xs text-ink-2 lg:hidden"
                    >
                        {["inbox", "unread", "starred", "sent", "archive", "all", "trash"].map((f) => (
                            <option key={f} value={f}>{folderLabel(f)}</option>
                        ))}
                    </select>
                    <IconButton size="sm" icon={PenSquare} label="Nouveau message (C)" onClick={() => openNewComposer()} className="lg:hidden" />
                    <IconButton size="sm" icon={RefreshCw} label="Synchroniser" onClick={handleSync} isLoading={isSyncing} />
                    <IconButton size="sm" icon={Keyboard} label="Raccourcis clavier (?)" onClick={() => setShowHelp(true)} className="hidden sm:inline-flex" />
                </div>

                <div className="shrink-0 border-b border-line px-3 py-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" aria-hidden />
                        <input
                            ref={searchRef}
                            type="search"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    e.stopPropagation();
                                    if (searchInput) setSearchInput("");
                                    else (e.target as HTMLInputElement).blur();
                                } else if (e.key === "Enter" || e.key === "ArrowDown") {
                                    (e.target as HTMLInputElement).blur();
                                }
                            }}
                            placeholder="Rechercher"
                            aria-label="Rechercher dans les conversations"
                            className="h-8 w-full rounded-control border border-line bg-surface-2 pl-8 pr-14 text-[13px] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-4 focus:border-primary-400 focus:bg-surface focus:ring-4 focus:ring-primary-500/12 [&::-webkit-search-cancel-button]:hidden"
                        />
                        {searchInput ? (
                            <button
                                type="button"
                                onClick={() => setSearchInput("")}
                                aria-label="Effacer la recherche"
                                className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-4 hover:bg-surface-3 hover:text-ink"
                            >
                                <X className="size-3.5" aria-hidden />
                            </button>
                        ) : (
                            <Kbd className="absolute right-2 top-1/2 -translate-y-1/2">/</Kbd>
                        )}
                    </div>
                </div>

                {selectedMailbox?.syncStatus === "ERROR" && (
                    <div className="shrink-0 border-b border-line px-3 py-2">
                        <p className="flex items-start gap-2 text-xs text-warning-ink">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            <span className="min-w-0">
                                La synchronisation de {selectedMailbox.email} a échoué
                                {selectedMailbox.lastError ? ` : ${selectedMailbox.lastError}` : "."}
                            </span>
                        </p>
                    </div>
                )}

                {noOwnMailbox && !supervisor && (
                    <div className="shrink-0 border-b border-line bg-surface-2 px-3 py-2.5">
                        <p className="text-xs text-ink-2">
                            Pas de boîte mail personnelle : vous voyez ici les échanges envoyés depuis vos missions.
                        </p>
                        <Button size="xs" variant="link" className="mt-0.5 px-0" leftIcon={<Mail className="size-3.5" />} onClick={() => setShowMailboxDialog(true)}>
                            Connecter une boîte mail
                        </Button>
                    </div>
                )}

                <ThreadList
                    threads={threads}
                    folder={folder}
                    search={q}
                    isLoading={listLoading}
                    isLoadingMore={listLoadingMore}
                    error={listError}
                    hasMore={hasMore}
                    selectedThreadId={threadId}
                    showMailbox={mailboxSel === TEAM_MAILBOX}
                    onLoadMore={() => loadThreads(page + 1)}
                    onRetry={() => loadThreads(1)}
                    onClearSearch={() => setSearchInput("")}
                    onSelectThread={(t) => openThread(t.id)}
                    onStar={(t) => toggleStar(t.id)}
                    onArchive={(t) => toggleArchive(t.id)}
                    onTrash={(t) => trashThread(t.id)}
                />
            </section>

            {/* ---------------- Conversation ---------------- */}
            <main className={cn("min-w-0 flex-1 flex-col bg-canvas", threadId ? "flex" : "hidden lg:flex")}>
                {threadId ? (
                    <ThreadView
                        thread={detail?.id === threadId ? detail : null}
                        isLoading={detailLoading}
                        error={detailError}
                        onRetry={() => setDetailRefresh((k) => k + 1)}
                        onClose={closeThread}
                        onCompose={openReplyComposer}
                        onStar={() => toggleStar(threadId)}
                        onArchive={() => toggleArchive(threadId)}
                        onTrash={() => trashThread(threadId)}
                        isContextOpen={contextOpen}
                        onToggleContext={toggleContext}
                    />
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                        <Mail className="mb-3 size-6 text-ink-4" aria-hidden />
                        <p className="text-sm font-medium text-ink-2">Aucune conversation ouverte</p>
                        <p className="mt-1 text-xs text-ink-4">
                            Sélectionnez une conversation, ou appuyez sur <Kbd>J</Kbd> pour ouvrir la première, <Kbd>C</Kbd> pour écrire.
                        </p>
                    </div>
                )}
            </main>

            {/* ---------------- CRM context ---------------- */}
            {showContext && detail && (
                <div className="hidden w-[300px] shrink-0 border-l border-line xl:block">
                    <ContextPanel
                        thread={detail}
                        role={role}
                        onLinksChanged={onLinksChanged}
                        onLabelsChanged={(labels) => {
                            setDetail((d) => (d ? { ...d, labels } : d));
                            setThreads((list) => list.map((t) => (t.id === detail.id ? { ...t, labels } : t)));
                            setNavRefresh((k) => k + 1);
                        }}
                        onCommentAdded={(c) => setDetail((d) => (d ? { ...d, comments: [...d.comments, c] } : d))}
                        onClose={toggleContext}
                    />
                </div>
            )}

            {composer && (
                <EmailComposer
                    key={composer.key}
                    draft={composer.draft}
                    defaultMailboxId={mailboxSel && mailboxSel !== TEAM_MAILBOX ? mailboxSel : undefined}
                    lockedMailbox={composer.lockedMailbox}
                    context={composer.context}
                    onClose={() => setComposer(null)}
                    onSent={handleSent}
                />
            )}

            <Modal isOpen={showHelp} onClose={() => setShowHelp(false)} title="Raccourcis clavier" size="sm">
                <ul className="divide-y divide-line">
                    {SHORTCUTS.map((s) => (
                        <li key={s.label} className="flex items-center justify-between gap-4 py-2">
                            <span className="text-[13px] text-ink-2">{s.label}</span>
                            <span className="flex shrink-0 gap-1">{s.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
                        </li>
                    ))}
                </ul>
            </Modal>

            <MailboxManagerDialog
                isOpen={showMailboxDialog}
                onClose={() => setShowMailboxDialog(false)}
                onMailboxAdded={() => {
                    setShowMailboxDialog(false);
                    loadMailboxes();
                    toast.success("Boîte mail connectée");
                }}
            />
        </div>
    );
}

export default InboxLayout;
