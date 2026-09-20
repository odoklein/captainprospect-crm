"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import {
    LifeBuoy,
    MessageSquare,
    MessagesSquare,
    Bell,
    Pin,
    CheckCircle2,
    RotateCcw,
    Wrench,
    Ticket,
    Search,
    X,
    Send,
    ArrowLeft,
    Clock,
    AlertTriangle,
    XCircle,
    Mail,
    Lightbulb,
    ExternalLink,
    Loader2,
    Calendar,
    BarChart3,
    Sparkles,
} from "lucide-react";
import { SUP_LIGHT, SupportStyles } from "./supportStyles";
import { AvatarRing, SupportBubble } from "./SupportBubble";
import {
    SupportAttachButton,
    SupportAttachmentPreviews,
    useSupportAttachments,
} from "./SupportAttachments";
import { ConvertSupportToTicketModal } from "./ConvertSupportToTicketModal";
import type {
    SupportConversationDetailDTO,
    SupportConversationSummaryDTO,
    SupportMessageDTO,
} from "@/lib/support/types";

type TabFilter = "ACTIVE" | "RESOLVED" | "ALL" | "UNREAD";
type WorkspaceMode = "conversations" | "alerts";

interface ClientAlert {
    id: string;
    title: string;
    message: string;
    type: "info" | "success" | "warning" | "error";
    link: string | null;
    isRead: boolean;
    createdAt: string;
}

const POLL_INTERVAL_MS = 20_000;
const ALERT_POLL_MS = 15_000;
const T = {
    ...SUP_LIGHT,
    surface: SUP_LIGHT.paper,
    surfaceRaised: SUP_LIGHT.paperRaised,
    surfaceSunken: SUP_LIGHT.paperSunken,
};

interface ManagerSupportWorkspaceProps {
    isOpen: boolean;
    onClose: () => void;
}

function formatRelative(value: string | null): string {
    if (!value) return "";
    const ts = new Date(value).getTime();
    const diff = Date.now() - ts;
    if (diff < 60_000) return "à l'instant";
    if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
    if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`;
    return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

const ALERT_TYPE_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
    "Signal client": { color: "#8B1A14", bg: "#FDE8E7", border: "rgba(217,48,37,0.18)" },
    "Avis client": { color: "#4238D0", bg: "#EEEDFB", border: "rgba(91,79,232,0.18)" },
    "Demande report": { color: "#8A4A00", bg: "#FEF6E4", border: "rgba(201,123,42,0.22)" },
    "Annulation client": { color: "#8B1A14", bg: "#FDE8E7", border: "rgba(217,48,37,0.18)" },
    "Message support": { color: "#155B7A", bg: "#E4EEF4", border: "rgba(21,91,122,0.18)" },
    "Suggestion SDR": { color: "#B45309", bg: "#FEF3C7", border: "rgba(245,158,11,0.25)" },
};

function getAlertTypeFromTitle(title: string): keyof typeof ALERT_TYPE_CONFIG {
    for (const key of Object.keys(ALERT_TYPE_CONFIG)) {
        if (title.startsWith(key)) return key;
    }
    return "Message support";
}

function renderAlertIcon(type: string, className = "w-4 h-4") {
    switch (type) {
        case "Signal client":
            return <AlertTriangle className={className} />;
        case "Avis client":
            return <MessageSquare className={className} />;
        case "Demande report":
            return <Calendar className={className} />;
        case "Annulation client":
            return <XCircle className={className} />;
        case "Message support":
            return <Mail className={className} />;
        case "Suggestion SDR":
            return <Lightbulb className={className} />;
        default:
            return <Bell className={className} />;
    }
}

function formatAlertTime(iso: string): string {
    const ts = new Date(iso).getTime();
    const diff = Date.now() - ts;
    if (diff < 60_000) return "à l'instant";
    if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
    if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`;
    if (diff < 172_800_000) return "hier";
    return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
}

export function ManagerSupportWorkspace({ isOpen, onClose }: ManagerSupportWorkspaceProps) {
    const { data: session } = useSession();
    const [conversations, setConversations] = useState<SupportConversationSummaryDTO[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<SupportConversationDetailDTO | null>(null);
    const [tab, setTab] = useState<TabFilter>("ACTIVE");
    const [search, setSearch] = useState("");
    const [loadingList, setLoadingList] = useState(false);
    const [replyValue, setReplyValue] = useState("");
    const [sending, setSending] = useState(false);
    const [resolving, setResolving] = useState(false);
    const [showDevTicketModal, setShowDevTicketModal] = useState(false);
    const [mounted, setMounted] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    const attachments = useSupportAttachments({
        conversationId: selectedId,
        disabled: sending,
    });
    const canReply =
        (replyValue.trim().length > 0 || attachments.readyIds.length > 0) &&
        !sending &&
        !attachments.isUploading;

    const [mode, setMode] = useState<WorkspaceMode>("conversations");
    const [alerts, setAlerts] = useState<ClientAlert[]>([]);
    const [alertsUnread, setAlertsUnread] = useState(0);
    const [loadingAlerts, setLoadingAlerts] = useState(false);
    const [selectedAlert, setSelectedAlert] = useState<ClientAlert | null>(null);

    const fetchAlerts = useCallback(async () => {
        try {
            setLoadingAlerts(true);
            const res = await fetch("/api/support/manager/alerts");
            const json = await res.json();
            if (json?.success) {
                setAlerts(json.data.alerts ?? []);
                setAlertsUnread(json.data.unreadCount ?? 0);
            }
        } catch {
            // ignore
        } finally {
            setLoadingAlerts(false);
        }
    }, []);

    const markAlertsRead = useCallback(async () => {
        try {
            await fetch("/api/support/manager/alerts", { method: "PATCH" });
            setAlertsUnread(0);
            setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })));
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        fetchAlerts();
        const id = window.setInterval(fetchAlerts, ALERT_POLL_MS);
        return () => window.clearInterval(id);
    }, [isOpen, fetchAlerts]);

    useEffect(() => {
        if (mode === "alerts" && alertsUnread > 0) {
            markAlertsRead();
        }
    }, [mode, alertsUnread, markAlertsRead]);

    const fetchList = useCallback(async () => {
        try {
            setLoadingList(true);
            const params = new URLSearchParams();
            if (tab === "ACTIVE" || tab === "RESOLVED") params.set("status", tab);
            if (tab === "UNREAD") params.set("unreadOnly", "true");
            if (search.trim()) params.set("search", search.trim());
            const res = await fetch(`/api/support/manager/conversations?${params.toString()}`);
            const json = await res.json();
            if (!json?.success) return;
            setConversations(json.data as SupportConversationSummaryDTO[]);
        } finally {
            setLoadingList(false);
        }
    }, [tab, search]);

    const fetchDetail = useCallback(async (id: string) => {
        const res = await fetch(`/api/support/manager/conversations/${id}`);
        const json = await res.json();
        if (json?.success) {
            setDetail(json.data as SupportConversationDetailDTO);
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        fetchList();
        const id = window.setInterval(fetchList, POLL_INTERVAL_MS);
        return () => window.clearInterval(id);
    }, [isOpen, fetchList]);

    useEffect(() => {
        if (!selectedId) {
            setDetail(null);
            return;
        }
        fetchDetail(selectedId);
        fetch(`/api/support/manager/conversations/${selectedId}/read`, { method: "POST" })
            .catch(() => undefined)
            .finally(() => fetchList());
    }, [selectedId, fetchDetail, fetchList]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [detail?.messages.length]);

    // Switching conversation must never carry a pending image over to another client.
    const discardAttachments = attachments.discard;
    useEffect(() => {
        discardAttachments();
    }, [selectedId, discardAttachments]);

    const filteredConversations = useMemo(() => {
        return conversations.filter((c) => {
            if (tab === "ACTIVE" && c.status !== "ACTIVE") return false;
            if (tab === "RESOLVED" && c.status !== "RESOLVED") return false;
            if (tab === "UNREAD" && c.unreadCount === 0) return false;
            return true;
        });
    }, [conversations, tab]);

    const handleReply = async () => {
        if (!selectedId || !canReply) return;
        const text = replyValue.trim();
        const readyAttachments = attachments.readyIds;
        setSending(true);

        const optimistic: SupportMessageDTO = {
            id: `tmp-${Date.now()}`,
            conversationId: selectedId,
            role: "MANAGER",
            author: {
                id: session?.user?.id ?? "me",
                name: session?.user?.name ?? "Support",
                email: session?.user?.email ?? "",
                role: "MANAGER",
            },
            content: text,
            attachments: attachments.pending
                .filter((p) => readyAttachments.includes(p.id))
                .map((p) => ({
                    id: p.id,
                    filename: p.filename,
                    byteSize: p.byteSize,
                    mimeType: p.mimeType,
                    url: p.previewUrl,
                })),
            isInternal: false,
            createdAt: new Date().toISOString(),
        };

        setDetail((current) =>
            current ? { ...current, messages: [...(current.messages || []), optimistic] } : current,
        );
        setReplyValue("");
        attachments.discard();

        try {
            const res = await fetch(
                `/api/support/manager/conversations/${selectedId}/messages`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        content: text,
                        attachmentIds: readyAttachments.length > 0 ? readyAttachments : undefined,
                    }),
                },
            );
            const json = await res.json();
            if (!json?.success) {
                throw new Error(json?.error ?? "Erreur d'envoi");
            }
            const saved = json.data as SupportMessageDTO;
            setDetail((current) =>
                current
                    ? {
                        ...current,
                        messages: (current.messages || []).map((m) =>
                            m.id === optimistic.id ? saved : m,
                        ),
                    }
                    : current,
            );
            fetchList();
        } catch {
            setDetail((current) =>
                current
                    ? {
                        ...current,
                        messages: (current.messages || []).filter((m) => m.id !== optimistic.id),
                    }
                    : current,
            );
        } finally {
            setSending(false);
        }
    };

    const handleResolveToggle = async () => {
        if (!detail || resolving) return;
        setResolving(true);
        const isResolved = detail.status === "RESOLVED";
        try {
            const res = await fetch(
                `/api/support/manager/conversations/${detail.id}/resolve`,
                { method: isResolved ? "DELETE" : "POST" },
            );
            if (!res.ok) return;
            await fetchDetail(detail.id);
            fetchList();
        } finally {
            setResolving(false);
        }
    };

    const handlePinToggle = async () => {
        if (!detail) return;
        const next = !detail.isPinned;
        try {
            await fetch(`/api/support/manager/conversations/${detail.id}/pin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pinned: next }),
            });
            setDetail({ ...detail, isPinned: next });
            fetchList();
        } catch {
            // ignore
        }
    };

    if (!isOpen || !mounted) return null;

    const tabButtonStyle = (active: boolean): React.CSSProperties => ({
        padding: "5px 11px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        border: "none",
        background: active ? T.brandSoft : "transparent",
        color: active ? T.brandStrong : T.ink3,
        transition: "all 150ms ease",
    });

    return createPortal(
        <>
            <SupportStyles />
            <div
                className="cp-support-root"
                role="dialog"
                aria-label="Support — espace manager"
                aria-modal="true"
                style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 110,
                    background: "rgba(15,23,42,0.45)",
                    backdropFilter: "blur(6px)",
                    display: "flex",
                    justifyContent: "flex-end",
                    animation: "cpSupPanelIn 0.25s ease both",
                }}
                onClick={(e) => {
                    if (e.target === e.currentTarget) onClose();
                }}
            >
                <aside
                    style={{
                        width: "min(1120px, 100%)",
                        height: "100%",
                        display: "flex",
                        background: T.surface,
                        borderLeft: `1px solid ${T.line}`,
                        boxShadow: "-20px 0 56px rgba(15,23,42,0.18)",
                        animation: "cpSupPanelIn 0.3s cubic-bezier(.34,1.4,.64,1) both",
                    }}
                >
                    {/* LIST column */}
                    <div
                        style={{
                            width: 360,
                            minWidth: 300,
                            borderRight: `1px solid ${T.line}`,
                            display: "flex",
                            flexDirection: "column",
                            background: T.surfaceSunken,
                        }}
                    >
                        <div
                            style={{
                                padding: "16px 18px 12px",
                                borderBottom: `1px solid ${T.lineSoft}`,
                                flexShrink: 0,
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    marginBottom: 12,
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <div
                                        style={{
                                            display: "inline-flex",
                                            padding: 3,
                                            borderRadius: 999,
                                            background: T.surfaceRaised,
                                            border: `1px solid ${T.line}`,
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => { setMode("conversations"); setSelectedAlert(null); }}
                                            style={{
                                                padding: "4px 12px",
                                                borderRadius: 999,
                                                fontSize: 12,
                                                fontWeight: 700,
                                                cursor: "pointer",
                                                border: "none",
                                                background: mode === "conversations" ? `linear-gradient(135deg, ${T.brand}, ${T.brandStrong})` : "transparent",
                                                color: mode === "conversations" ? "#fff" : T.ink2,
                                                transition: "all 150ms ease",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 5,
                                            }}
                                        >
                                            <MessagesSquare className="w-3.5 h-3.5" />
                                            <span>Support</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setMode("alerts"); setSelectedId(null); setDetail(null); }}
                                            style={{
                                                padding: "4px 12px",
                                                borderRadius: 999,
                                                fontSize: 12,
                                                fontWeight: 700,
                                                cursor: "pointer",
                                                border: "none",
                                                background: mode === "alerts" ? `linear-gradient(135deg, ${T.brand}, ${T.brandStrong})` : "transparent",
                                                color: mode === "alerts" ? "#fff" : T.ink2,
                                                transition: "all 150ms ease",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 5,
                                                position: "relative",
                                            }}
                                        >
                                            <Bell className="w-3.5 h-3.5" />
                                            <span>Alertes</span>
                                            {alertsUnread > 0 && (
                                                <span
                                                    style={{
                                                        minWidth: 16,
                                                        height: 16,
                                                        padding: "0 4px",
                                                        borderRadius: 999,
                                                        background: "#D93025",
                                                        color: "#fff",
                                                        fontSize: 9,
                                                        fontWeight: 700,
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        animation: "cpSupBadgePop 0.3s cubic-bezier(.34,1.56,.64,1) both",
                                                    }}
                                                >
                                                    {alertsUnread > 9 ? "9+" : alertsUnread}
                                                </span>
                                            )}
                                        </button>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    aria-label="Fermer"
                                    style={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: T.radiusS,
                                        background: T.surfaceRaised,
                                        border: `1px solid ${T.line}`,
                                        color: T.ink3,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {mode === "conversations" && (
                                <>
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                            padding: "6px 10px",
                                            borderRadius: T.radiusS,
                                            background: T.surfaceRaised,
                                            border: `1px solid ${T.line}`,
                                        }}
                                    >
                                        <Search className="w-3.5 h-3.5 text-slate-400" />
                                        <input
                                            type="search"
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") fetchList();
                                            }}
                                            placeholder="Rechercher un client..."
                                            style={{
                                                width: "100%",
                                                background: "transparent",
                                                border: "none",
                                                color: T.ink,
                                                fontSize: 12.5,
                                                fontFamily: "inherit",
                                                outline: "none",
                                            }}
                                        />
                                    </div>
                                    <div style={{ display: "flex", gap: 3, marginTop: 8 }}>
                                        <button type="button" style={tabButtonStyle(tab === "ACTIVE")} onClick={() => setTab("ACTIVE")}>
                                            Actives
                                        </button>
                                        <button type="button" style={tabButtonStyle(tab === "UNREAD")} onClick={() => setTab("UNREAD")}>
                                            Non lus
                                        </button>
                                        <button type="button" style={tabButtonStyle(tab === "RESOLVED")} onClick={() => setTab("RESOLVED")}>
                                            Résolues
                                        </button>
                                        <button type="button" style={tabButtonStyle(tab === "ALL")} onClick={() => setTab("ALL")}>
                                            Toutes
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                        <div
                            className="cp-sup-scroll-hidden"
                            style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}
                        >
                            {mode === "conversations" ? (
                                <>
                                    {loadingList && conversations.length === 0 ? (
                                        <div style={{ padding: 24, color: T.ink3, fontSize: 13, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                            <span>Chargement…</span>
                                        </div>
                                    ) : filteredConversations.length === 0 ? (
                                        <div
                                            style={{
                                                padding: 32,
                                                textAlign: "center",
                                                color: T.ink3,
                                                fontSize: 13,
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                gap: 8,
                                            }}
                                        >
                                            <LifeBuoy className="w-8 h-8 text-slate-300" />
                                            <span>Aucune conversation trouvée.</span>
                                        </div>
                                    ) : (
                                        filteredConversations.map((conv) => {
                                            const isActive = conv.id === selectedId;
                                            return (
                                                <button
                                                    type="button"
                                                    key={conv.id}
                                                    onClick={() => setSelectedId(conv.id)}
                                                    style={{
                                                        width: "100%",
                                                        textAlign: "left",
                                                        background: isActive ? T.brandSoft : "transparent",
                                                        borderLeft: isActive
                                                            ? `3px solid ${T.brand}`
                                                            : "3px solid transparent",
                                                        padding: "12px 16px",
                                                        cursor: "pointer",
                                                        border: "none",
                                                        borderBottom: `1px solid ${T.lineSoft}`,
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        gap: 4,
                                                        transition: "background 150ms ease",
                                                    }}
                                                >
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                        <AvatarRing
                                                            name={conv.clientName}
                                                            size={28}
                                                            theme="light"
                                                            status={conv.status === "ACTIVE" ? "online" : "offline"}
                                                        />
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div
                                                                style={{
                                                                    display: "flex",
                                                                    justifyContent: "space-between",
                                                                    alignItems: "baseline",
                                                                    gap: 6,
                                                                }}
                                                            >
                                                                <span
                                                                    style={{
                                                                        fontWeight: 700,
                                                                        fontSize: 13,
                                                                        color: T.ink,
                                                                        whiteSpace: "nowrap",
                                                                        overflow: "hidden",
                                                                        textOverflow: "ellipsis",
                                                                    }}
                                                                >
                                                                    {conv.clientName}
                                                                </span>
                                                                <span
                                                                    className="cp-support-root-mono"
                                                                    style={{
                                                                        fontSize: 10.5,
                                                                        color: T.ink4,
                                                                        flexShrink: 0,
                                                                    }}
                                                                >
                                                                    {formatRelative(conv.lastMessageAt)}
                                                                </span>
                                                            </div>
                                                            {conv.createdByName && (
                                                                <div style={{ fontSize: 11, color: T.brand, fontWeight: 500 }}>
                                                                    par {conv.createdByName} {conv.createdByRole === "COMMERCIAL" ? "(Commercial)" : ""}
                                                                </div>
                                                            )}
                                                            <div
                                                                style={{
                                                                    fontSize: 12.5,
                                                                    fontWeight: 600,
                                                                    color: T.ink,
                                                                    whiteSpace: "nowrap",
                                                                    overflow: "hidden",
                                                                    textOverflow: "ellipsis",
                                                                }}
                                                            >
                                                                {conv.subject}
                                                            </div>
                                                            <div
                                                                style={{
                                                                    fontSize: 12,
                                                                    color: T.ink3,
                                                                    whiteSpace: "nowrap",
                                                                    overflow: "hidden",
                                                                    textOverflow: "ellipsis",
                                                                }}
                                                            >
                                                                {conv.lastMessagePreview ?? "Aucun message"}
                                                            </div>
                                                        </div>
                                                        {conv.unreadCount > 0 && (
                                                            <span
                                                                style={{
                                                                    minWidth: 18,
                                                                    height: 18,
                                                                    padding: "0 6px",
                                                                    borderRadius: 9,
                                                                    background: T.danger,
                                                                    fontSize: 10,
                                                                    fontWeight: 700,
                                                                    color: "#fff",
                                                                    display: "inline-flex",
                                                                    alignItems: "center",
                                                                    justifyContent: "center",
                                                                }}
                                                            >
                                                                {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ display: "flex", gap: 6, marginLeft: 36, alignItems: "center" }}>
                                                        {conv.status === "RESOLVED" && (
                                                            <span
                                                                style={{
                                                                    fontSize: 10,
                                                                    padding: "1px 7px",
                                                                    borderRadius: 6,
                                                                    background: T.brandSoft,
                                                                    color: T.brand,
                                                                    fontWeight: 600,
                                                                    display: "inline-flex",
                                                                    alignItems: "center",
                                                                    gap: 3,
                                                                }}
                                                            >
                                                                <CheckCircle2 className="w-2.5 h-2.5" />
                                                                <span>Résolu</span>
                                                            </span>
                                                        )}
                                                        {conv.lastIntent && (
                                                            <span
                                                                style={{
                                                                    fontSize: 10,
                                                                    padding: "1px 7px",
                                                                    borderRadius: 6,
                                                                    background: T.accentAmberSoft,
                                                                    color: T.accentAmber,
                                                                    fontWeight: 600,
                                                                }}
                                                            >
                                                                {conv.lastIntent}
                                                            </span>
                                                        )}
                                                        {conv.isPinned && (
                                                            <Pin className="w-3 h-3 text-amber-500" />
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </>
                            ) : (
                                <>
                                    {loadingAlerts && alerts.length === 0 ? (
                                        <div style={{ padding: 24, color: T.ink3, fontSize: 13, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                            <span>Chargement…</span>
                                        </div>
                                    ) : alerts.length === 0 ? (
                                        <div
                                            style={{
                                                padding: 32,
                                                textAlign: "center",
                                                color: T.ink3,
                                                fontSize: 13,
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                gap: 8,
                                            }}
                                        >
                                            <Bell className="w-8 h-8 text-slate-300" />
                                            <span>Aucune alerte client pour le moment.</span>
                                        </div>
                                    ) : (
                                        alerts.map((alert) => {
                                            const aType = getAlertTypeFromTitle(alert.title);
                                            const cfg = ALERT_TYPE_CONFIG[aType];
                                            const isActive = selectedAlert?.id === alert.id;
                                            return (
                                                <button
                                                    type="button"
                                                    key={alert.id}
                                                    onClick={() => setSelectedAlert(alert)}
                                                    style={{
                                                        width: "100%",
                                                        textAlign: "left",
                                                        background: isActive ? cfg.bg : alert.isRead ? "transparent" : "rgba(217,48,37,0.04)",
                                                        borderLeft: isActive
                                                            ? `3px solid ${cfg.color}`
                                                            : alert.isRead ? "3px solid transparent" : `3px solid ${cfg.color}`,
                                                        padding: "12px 16px",
                                                        cursor: "pointer",
                                                        border: "none",
                                                        borderBottom: `1px solid ${T.lineSoft}`,
                                                        display: "flex",
                                                        gap: 10,
                                                        alignItems: "flex-start",
                                                        transition: "background 150ms ease",
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            width: 30,
                                                            height: 30,
                                                            borderRadius: 8,
                                                            background: cfg.bg,
                                                            border: `1px solid ${cfg.border}`,
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            color: cfg.color,
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        {renderAlertIcon(aType, "w-4 h-4")}
                                                    </span>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                justifyContent: "space-between",
                                                                alignItems: "baseline",
                                                                gap: 6,
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    fontWeight: alert.isRead ? 600 : 700,
                                                                    fontSize: 12,
                                                                    color: cfg.color,
                                                                    whiteSpace: "nowrap",
                                                                    overflow: "hidden",
                                                                    textOverflow: "ellipsis",
                                                                }}
                                                            >
                                                                {alert.title}
                                                            </span>
                                                            <span
                                                                className="cp-support-root-mono"
                                                                style={{
                                                                    fontSize: 10,
                                                                    color: T.ink4,
                                                                    flexShrink: 0,
                                                                }}
                                                            >
                                                                {formatAlertTime(alert.createdAt)}
                                                            </span>
                                                        </div>
                                                        <div
                                                            style={{
                                                                fontSize: 11.5,
                                                                color: T.ink3,
                                                                whiteSpace: "nowrap",
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                marginTop: 2,
                                                            }}
                                                        >
                                                            {alert.message}
                                                        </div>
                                                        <span
                                                            style={{
                                                                display: "inline-block",
                                                                marginTop: 4,
                                                                fontSize: 10,
                                                                padding: "1px 7px",
                                                                borderRadius: 6,
                                                                background: cfg.bg,
                                                                border: `1px solid ${cfg.border}`,
                                                                color: cfg.color,
                                                                fontWeight: 600,
                                                            }}
                                                        >
                                                            {aType}
                                                        </span>
                                                    </div>
                                                    {!alert.isRead && (
                                                        <span
                                                            style={{
                                                                width: 7,
                                                                height: 7,
                                                                borderRadius: "50%",
                                                                background: "#D93025",
                                                                flexShrink: 0,
                                                                marginTop: 4,
                                                            }}
                                                        />
                                                    )}
                                                </button>
                                            );
                                        })
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* DETAIL column */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                        {mode === "alerts" ? (
                            selectedAlert ? (
                                <AlertDetailView alert={selectedAlert} onBack={() => setSelectedAlert(null)} />
                            ) : (
                                <div
                                    style={{
                                        flex: 1,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: T.ink3,
                                        gap: 12,
                                        padding: 32,
                                        textAlign: "center",
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 56,
                                            height: 56,
                                            borderRadius: "50%",
                                            background: T.brandSoft,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color: T.brandStrong,
                                        }}
                                    >
                                        <Bell className="w-7 h-7" />
                                    </div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>
                                        Alertes clients & Actions directes
                                    </div>
                                    <div style={{ fontSize: 13, maxWidth: 400, lineHeight: 1.6 }}>
                                        Retrouvez ici toutes les alertes de vos clients : signalements de rendez-vous, demandes de report, avis de satisfaction, et messages support. Sélectionnez une alerte pour afficher son contexte.
                                    </div>
                                    {alerts.length > 0 && (
                                        <div
                                            style={{
                                                display: "flex",
                                                flexWrap: "wrap",
                                                gap: 8,
                                                justifyContent: "center",
                                                marginTop: 12,
                                            }}
                                        >
                                            {Object.entries(ALERT_TYPE_CONFIG).map(([key, cfg]) => {
                                                const count = alerts.filter((a) => a.title.startsWith(key)).length;
                                                if (count === 0) return null;
                                                return (
                                                    <span
                                                        key={key}
                                                        style={{
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            gap: 6,
                                                            padding: "5px 12px",
                                                            borderRadius: 999,
                                                            background: cfg.bg,
                                                            border: `1px solid ${cfg.border}`,
                                                            color: cfg.color,
                                                            fontSize: 12,
                                                            fontWeight: 600,
                                                        }}
                                                    >
                                                        {renderAlertIcon(key, "w-3.5 h-3.5")}
                                                        <span>{key}</span>
                                                        <span
                                                            style={{
                                                                background: cfg.color,
                                                                color: "#fff",
                                                                borderRadius: 999,
                                                                padding: "0 6px",
                                                                fontSize: 10,
                                                                fontWeight: 700,
                                                                minWidth: 18,
                                                                display: "inline-flex",
                                                                alignItems: "center",
                                                                justifyContent: "center",
                                                                height: 16,
                                                            }}
                                                        >
                                                            {count}
                                                        </span>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )
                        ) : !detail ? (
                            <div
                                style={{
                                    flex: 1,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: T.ink3,
                                    gap: 12,
                                    padding: 32,
                                    textAlign: "center",
                                }}
                            >
                                <div
                                    style={{
                                        width: 56,
                                        height: 56,
                                        borderRadius: "50%",
                                        background: T.brandSoft,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: T.brandStrong,
                                    }}
                                >
                                    <MessagesSquare className="w-7 h-7" />
                                </div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>
                                    Sélectionnez une conversation
                                </div>
                                <div style={{ fontSize: 13, maxWidth: 360, lineHeight: 1.5 }}>
                                    Toutes les demandes de support clients sont centralisées ici. Répondez directement ou créez un ticket d&apos;escalade pour l&apos;équipe technique.
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Detail header */}
                                <div
                                    style={{
                                        padding: "14px 20px",
                                        borderBottom: `1px solid ${T.line}`,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 12,
                                        flexShrink: 0,
                                        background: T.surfaceRaised,
                                    }}
                                >
                                    <AvatarRing
                                        name={detail.clientName}
                                        size={40}
                                        theme="light"
                                        status={detail.status === "ACTIVE" ? "online" : "offline"}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div
                                            style={{
                                                fontSize: 15,
                                                fontWeight: 700,
                                                color: T.ink,
                                                letterSpacing: "-0.01em",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <span>{detail.subject || detail.clientName}</span>
                                            {detail.subject && (
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        fontWeight: 600,
                                                        padding: "1px 6px",
                                                        borderRadius: 4,
                                                        background: T.surfaceSunken,
                                                        color: T.ink2,
                                                        border: `1px solid ${T.line}`,
                                                    }}
                                                >
                                                    {detail.clientName}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 12, color: T.ink3, marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                            {detail.createdByName && (
                                                <span>
                                                    Par <strong>{detail.createdByName}</strong>
                                                    {detail.createdByRole ? ` (${detail.createdByRole})` : ""} ·
                                                </span>
                                            )}
                                            <span>
                                                {detail.messageCount} messages ·{" "}
                                                {detail.status === "ACTIVE"
                                                    ? "Conversation active"
                                                    : "Résolu"}
                                                {detail.resolvedBy && detail.status === "RESOLVED" && (
                                                    <> · par {detail.resolvedBy.name}</>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowDevTicketModal(true)}
                                        title="Convertir cette demande en ticket de développement pour les développeurs"
                                        style={{
                                            padding: "6px 12px",
                                            borderRadius: T.radiusS,
                                            background: "#F5F3FF",
                                            border: "1px solid #DDD6FE",
                                            color: "#6D28D9",
                                            fontSize: 12,
                                            fontWeight: 600,
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6,
                                            transition: "all 150ms ease",
                                        }}
                                    >
                                        <Ticket className="w-3.5 h-3.5 text-purple-600" />
                                        <span>Créer ticket Dev</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handlePinToggle}
                                        aria-label={detail.isPinned ? "Détacher" : "Épingler"}
                                        style={{
                                            padding: "6px 11px",
                                            borderRadius: T.radiusS,
                                            background: detail.isPinned ? T.accentAmberSoft : T.surface,
                                            border: `1px solid ${detail.isPinned ? "rgba(244,181,96,0.3)" : T.line}`,
                                            color: detail.isPinned ? T.accentAmber : T.ink3,
                                            fontSize: 12,
                                            fontWeight: 600,
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 5,
                                            transition: "all 150ms ease",
                                        }}
                                    >
                                        <Pin className="w-3.5 h-3.5" />
                                        <span>{detail.isPinned ? "Épinglé" : "Épingler"}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleResolveToggle}
                                        disabled={resolving}
                                        style={{
                                            padding: "6px 12px",
                                            borderRadius: T.radiusS,
                                            background:
                                                detail.status === "RESOLVED" ? T.surface : T.brandSoft,
                                            border: `1px solid ${detail.status === "RESOLVED" ? T.line : "rgba(124,92,252,0.35)"}`,
                                            color: detail.status === "RESOLVED" ? T.ink2 : T.brandStrong,
                                            fontSize: 12,
                                            fontWeight: 600,
                                            cursor: resolving ? "not-allowed" : "pointer",
                                            opacity: resolving ? 0.5 : 1,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 5,
                                            transition: "all 150ms ease",
                                        }}
                                    >
                                        {detail.status === "RESOLVED" ? (
                                            <>
                                                <RotateCcw className="w-3.5 h-3.5" />
                                                <span>Rouvrir</span>
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                <span>Marquer résolu</span>
                                            </>
                                        )}
                                    </button>
                                </div>

                                {/* Messages */}
                                <div
                                    className="cp-sup-scroll-hidden"
                                    style={{
                                        flex: 1,
                                        overflowY: "auto",
                                        padding: "18px 20px",
                                        background:
                                            detail.status === "RESOLVED"
                                                ? "rgba(124,92,252,0.06)"
                                                : T.surface,
                                        transition: "background 0.4s ease",
                                    }}
                                >
                                    {(detail.messages || []).map((m, i) => (
                                        <SupportBubble
                                            key={m.id}
                                            message={m}
                                            viewpoint="manager"
                                            theme="light"
                                            isLast={
                                                i === (detail.messages || []).length - 1 && m.role === "MANAGER"
                                            }
                                            seen
                                        />
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Composer */}
                                {detail.status === "ACTIVE" ? (
                                    <div
                                        style={{
                                            borderTop: `1px solid ${T.line}`,
                                            padding: "12px 20px",
                                            // Reserve room on the right so the send button never sits under
                                            // the floating manager assistant FAB (bottom-right, ~68px zone).
                                            paddingRight: 76,
                                            background: T.surfaceRaised,
                                            flexShrink: 0,
                                        }}
                                    >
                                        <SupportAttachmentPreviews
                                            pending={attachments.pending}
                                            onRemove={attachments.remove}
                                            theme="light"
                                        />

                                        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
                                            <SupportAttachButton
                                                onFiles={attachments.addFiles}
                                                disabled={sending}
                                                theme="light"
                                                size={44}
                                            />
                                            <div
                                                style={{
                                                    flex: 1,
                                                    borderRadius: T.radiusS,
                                                    background: T.surface,
                                                    border: `1px solid ${T.line}`,
                                                    padding: "8px 12px",
                                                }}
                                            >
                                                <textarea
                                                    className="cp-sup-composer-input cp-sup-scroll-hidden"
                                                    value={replyValue}
                                                    onChange={(e) => setReplyValue(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" && !e.shiftKey) {
                                                            e.preventDefault();
                                                            handleReply();
                                                        }
                                                    }}
                                                    onPaste={attachments.handlePaste}
                                                    placeholder={`Répondre à ${detail.clientName}...`}
                                                    rows={2}
                                                    aria-label="Répondre au client"
                                                    style={{
                                                        width: "100%",
                                                        background: "transparent",
                                                        border: "none",
                                                        resize: "none",
                                                        color: T.ink,
                                                        fontSize: 13.5,
                                                        fontFamily: "inherit",
                                                        lineHeight: 1.5,
                                                        maxHeight: 160,
                                                    }}
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleReply}
                                                disabled={!canReply}
                                                aria-label="Envoyer"
                                                style={{
                                                    width: 44,
                                                    height: 44,
                                                    borderRadius: T.radiusS,
                                                    background: canReply
                                                        ? `linear-gradient(135deg, ${T.brand}, ${T.brandStrong})`
                                                        : T.surface,
                                                    border: canReply ? "none" : `1px solid ${T.line}`,
                                                    color: canReply ? "#FFFFFF" : T.ink4,
                                                    cursor: canReply ? "pointer" : "not-allowed",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    transition: "all 200ms cubic-bezier(.34,1.56,.64,1)",
                                                    boxShadow: canReply
                                                        ? "0 6px 14px rgba(99,102,241,0.25)"
                                                        : "none",
                                                }}
                                            >
                                                {sending ? (
                                                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                                                ) : (
                                                    <Send className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                        <p
                                            className="cp-support-root-mono"
                                            style={{
                                                fontSize: 10.5,
                                                color: T.ink4,
                                                textAlign: "center",
                                                marginTop: 6,
                                                letterSpacing: "0.02em",
                                            }}
                                        >
                                            Entrée pour envoyer · Maj+Entrée pour saut de ligne
                                        </p>
                                    </div>
                                ) : (
                                    <div
                                        style={{
                                            padding: "14px 20px",
                                            // Clear the floating assistant FAB in the bottom-right corner.
                                            paddingRight: 76,
                                            borderTop: `1px solid ${T.line}`,
                                            background: "rgba(124,92,252,0.08)",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            flexShrink: 0,
                                        }}
                                    >
                                        <div style={{ fontSize: 13, color: T.brandStrong, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                            <span>
                                                Conversation résolue{" "}
                                                {detail.resolvedAt
                                                    ? `le ${new Date(detail.resolvedAt).toLocaleString("fr-FR")}`
                                                    : ""}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleResolveToggle}
                                            disabled={resolving}
                                            style={{
                                                padding: "6px 14px",
                                                borderRadius: T.radiusS,
                                                background: T.brandSoft,
                                                border: "1px solid rgba(124,92,252,0.35)",
                                                color: T.brandStrong,
                                                fontSize: 12,
                                                fontWeight: 600,
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 5,
                                            }}
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                            <span>Rouvrir</span>
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </aside>
            </div>
            {detail && (
                <ConvertSupportToTicketModal
                    isOpen={showDevTicketModal}
                    onClose={() => setShowDevTicketModal(false)}
                    conversation={detail}
                    onSuccess={() => {
                        fetchList();
                    }}
                />
            )}
        </>,
        document.body,
    );
}

function AlertDetailView({ alert, onBack }: { alert: ClientAlert; onBack: () => void }) {
    const aType = getAlertTypeFromTitle(alert.title);
    const cfg = ALERT_TYPE_CONFIG[aType];
    const formattedDate = new Date(alert.createdAt).toLocaleString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Paris",
    });

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div
                style={{
                    padding: "14px 20px",
                    borderBottom: `1px solid ${T.line}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexShrink: 0,
                    background: T.surfaceRaised,
                }}
            >
                <button
                    type="button"
                    onClick={onBack}
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: T.radiusS,
                        background: T.surfaceSunken,
                        border: `1px solid ${T.line}`,
                        color: T.ink3,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div style={{ flex: 1 }}>
                    <div
                        style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: T.ink,
                            letterSpacing: "-0.01em",
                        }}
                    >
                        Détail de l&apos;alerte
                    </div>
                    <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>
                        {formattedDate}
                    </div>
                </div>
                {alert.link && (
                    <a
                        href={alert.link}
                        style={{
                            padding: "6px 14px",
                            borderRadius: T.radiusS,
                            background: T.brandSoft,
                            border: "1px solid rgba(124,92,252,0.35)",
                            color: T.brandStrong,
                            fontSize: 12,
                            fontWeight: 600,
                            textDecoration: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                        }}
                    >
                        <span>Voir le RDV</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                )}
            </div>

            <div
                style={{
                    flex: 1,
                    padding: "28px 32px",
                    overflowY: "auto",
                    background: T.surface,
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        marginBottom: 24,
                    }}
                >
                    <span
                        style={{
                            width: 48,
                            height: 48,
                            borderRadius: 14,
                            background: cfg.bg,
                            border: `1.5px solid ${cfg.border}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: cfg.color,
                            flexShrink: 0,
                        }}
                    >
                        {renderAlertIcon(aType, "w-6 h-6")}
                    </span>
                    <div>
                        <span
                            style={{
                                display: "inline-block",
                                padding: "3px 10px",
                                borderRadius: 999,
                                background: cfg.bg,
                                border: `1px solid ${cfg.border}`,
                                color: cfg.color,
                                fontSize: 11.5,
                                fontWeight: 700,
                                marginBottom: 4,
                            }}
                        >
                            {aType}
                        </span>
                        <div
                            style={{
                                fontSize: 18,
                                fontWeight: 700,
                                color: T.ink,
                                letterSpacing: "-0.02em",
                            }}
                        >
                            {alert.title}
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        padding: "18px 20px",
                        borderRadius: 14,
                        background: cfg.bg,
                        border: `1px solid ${cfg.border}`,
                        marginBottom: 20,
                    }}
                >
                    <div
                        style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: cfg.color,
                            marginBottom: 8,
                            opacity: 0.7,
                        }}
                    >
                        Détail
                    </div>
                    <p
                        style={{
                            fontSize: 14,
                            color: cfg.color,
                            fontWeight: 500,
                            lineHeight: 1.7,
                            margin: 0,
                            whiteSpace: "pre-wrap",
                        }}
                    >
                        {alert.message}
                    </p>
                </div>

                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 10,
                        marginTop: 16,
                    }}
                >
                    <div
                        style={{
                            padding: "12px 16px",
                            borderRadius: 12,
                            background: T.surfaceRaised,
                            border: `1px solid ${T.line}`,
                            flex: "1 1 160px",
                        }}
                    >
                        <div
                            style={{
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                color: T.ink4,
                                marginBottom: 6,
                            }}
                        >
                            Type
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, display: "flex", alignItems: "center", gap: 5 }}>
                            {alert.type === "warning" ? (
                                <>
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                    <span>Attention requise</span>
                                </>
                            ) : alert.type === "error" ? (
                                <>
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                    <span>Urgent</span>
                                </>
                            ) : alert.type === "success" ? (
                                <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    <span>Positif</span>
                                </>
                            ) : (
                                <>
                                    <Mail className="w-3.5 h-3.5 text-indigo-500" />
                                    <span>Information</span>
                                </>
                            )}
                        </div>
                    </div>
                    <div
                        style={{
                            padding: "12px 16px",
                            borderRadius: 12,
                            background: T.surfaceRaised,
                            border: `1px solid ${T.line}`,
                            flex: "1 1 160px",
                        }}
                    >
                        <div
                            style={{
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                color: T.ink4,
                                marginBottom: 6,
                            }}
                        >
                            Reçu le
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, display: "flex", alignItems: "center", gap: 5 }}>
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formattedDate}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
