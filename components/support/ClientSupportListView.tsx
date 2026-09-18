"use client";

import { useMemo, useState } from "react";
import {
    MessageSquare,
    Search,
    Plus,
    X,
    User,
    Users,
    Inbox,
    FolderArchive,
    ArrowRight,
    Clock,
    CheckCircle2,
    Sparkles,
} from "lucide-react";
import { SUP_LIGHT } from "./supportStyles";
import { INTENT_CARD_CONFIG } from "@/lib/support/constants";
import { getIntentLucideIcon } from "./SupportIntentSelector";
import type { SupportConversationSummaryDTO, SupportIntent } from "@/lib/support/types";

const T = SUP_LIGHT;

function formatRelative(value: string | null): string {
    if (!value) return "";
    const ts = new Date(value).getTime();
    const diff = Date.now() - ts;
    if (diff < 60_000) return "à l'instant";
    if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
    if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`;
    return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

interface ClientSupportListViewProps {
    conversations: SupportConversationSummaryDTO[];
    onSelectConversation: (id: string) => void;
    onNewRequest: (prefillIntent?: SupportIntent) => void;
    onClose: () => void;
    userRole?: string;
    currentUserId?: string;
}

export function ClientSupportListView({
    conversations,
    onSelectConversation,
    onNewRequest,
    onClose,
    userRole,
    currentUserId,
}: ClientSupportListViewProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [statusTab, setStatusTab] = useState<"ACTIVE" | "RESOLVED">("ACTIVE");
    const [scopeFilter, setScopeFilter] = useState<"ALL" | "MINE">("ALL");

    // Filter conversations
    const filtered = useMemo(() => {
        return conversations.filter((c) => {
            // Status match
            if (c.status !== statusTab) return false;

            // Scope filter (for Client Admin)
            if (scopeFilter === "MINE" && currentUserId && c.createdById !== currentUserId) {
                return false;
            }

            // Search query
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (
                (c.subject && c.subject.toLowerCase().includes(q)) ||
                (c.lastMessagePreview && c.lastMessagePreview.toLowerCase().includes(q)) ||
                (c.createdByName && c.createdByName.toLowerCase().includes(q))
            );
        });
    }, [conversations, statusTab, scopeFilter, currentUserId, searchQuery]);

    const activeCount = conversations.filter((c) => c.status === "ACTIVE").length;
    const resolvedCount = conversations.filter((c) => c.status === "RESOLVED").length;
    const activeUnread = conversations
        .filter((c) => c.status === "ACTIVE")
        .reduce((sum, c) => sum + (c.unreadCount || 0), 0);

    return (
        <div
            className="cp-support-root cp-support-panel-responsive"
            role="region"
            aria-label="Vos demandes de support"
            style={{
                position: "fixed",
                bottom: 96,
                right: 24,
                width: 420,
                maxWidth: "calc(100vw - 32px)",
                height: 600,
                maxHeight: "calc(100vh - 120px)",
                borderRadius: T.radiusL,
                background: T.paper,
                boxShadow: T.shadowPanel,
                border: `1px solid ${T.line}`,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                zIndex: 99,
                animation: "cpSupPanelIn 0.35s cubic-bezier(.34,1.4,.64,1) both",
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    borderBottom: `1px solid ${T.line}`,
                    background: T.paperRaised,
                    flexShrink: 0,
                }}
            >
                <div style={{ minWidth: 0 }}>
                    <div
                        style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: T.ink,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <div
                            style={{
                                width: 26,
                                height: 26,
                                borderRadius: 7,
                                background: T.brandSoft,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: T.brandStrong,
                            }}
                        >
                            <MessageSquare className="w-4 h-4" />
                        </div>
                        <span>Assistance & Demandes</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2, paddingLeft: 34 }}>
                        {userRole === "COMMERCIAL"
                            ? "Vos demandes d'assistance dédiées"
                            : "Demandes de votre entreprise"}
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                        type="button"
                        onClick={() => onNewRequest()}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "6px 12px",
                            borderRadius: 999,
                            background: `linear-gradient(135deg, ${T.brand}, ${T.brandStrong})`,
                            color: "#FFFFFF",
                            fontSize: 12,
                            fontWeight: 600,
                            border: "none",
                            cursor: "pointer",
                            boxShadow: "0 2px 8px rgba(79,70,229,0.25)",
                            transition: "transform 150ms ease",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-1px)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                        }}
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Nouvelle</span>
                    </button>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Fermer"
                        style={{
                            width: 30,
                            height: 30,
                            borderRadius: T.radiusS,
                            background: T.paperSunken,
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
            </div>

            {/* Filter & Search Toolbar */}
            <div
                style={{
                    padding: "10px 14px",
                    borderBottom: `1px solid ${T.line}`,
                    background: T.paperRaised,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    flexShrink: 0,
                }}
            >
                {/* Search box */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        borderRadius: T.radiusS,
                        background: T.paperSunken,
                        border: `1px solid ${T.line}`,
                    }}
                >
                    <Search className="w-3.5 h-3.5" style={{ color: T.ink3 }} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Rechercher une demande..."
                        style={{
                            width: "100%",
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            fontSize: 12.5,
                            color: T.ink,
                        }}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            style={{
                                background: "none",
                                border: "none",
                                color: T.ink3,
                                cursor: "pointer",
                                padding: 0,
                                display: "flex",
                                alignItems: "center",
                            }}
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Segmented Status Tabs */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <div
                        style={{
                            display: "inline-flex",
                            padding: 2,
                            borderRadius: T.radiusS,
                            background: T.paperSunken,
                            border: `1px solid ${T.line}`,
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => setStatusTab("ACTIVE")}
                            style={{
                                padding: "4px 10px",
                                borderRadius: 8,
                                border: "none",
                                background: statusTab === "ACTIVE" ? T.paperRaised : "transparent",
                                color: statusTab === "ACTIVE" ? T.ink : T.ink3,
                                fontSize: 11.5,
                                fontWeight: statusTab === "ACTIVE" ? 700 : 500,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                boxShadow: statusTab === "ACTIVE" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                            }}
                        >
                            <span>En cours</span>
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: "1px 6px",
                                    borderRadius: 999,
                                    background: activeUnread > 0 ? T.danger : T.line,
                                    color: activeUnread > 0 ? "#fff" : T.ink2,
                                }}
                            >
                                {activeCount}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setStatusTab("RESOLVED")}
                            style={{
                                padding: "4px 10px",
                                borderRadius: 8,
                                border: "none",
                                background: statusTab === "RESOLVED" ? T.paperRaised : "transparent",
                                color: statusTab === "RESOLVED" ? T.ink : T.ink3,
                                fontSize: 11.5,
                                fontWeight: statusTab === "RESOLVED" ? 700 : 500,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                boxShadow: statusTab === "RESOLVED" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                            }}
                        >
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Résolues</span>
                            </span>
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: "1px 6px",
                                    borderRadius: 999,
                                    background: T.line,
                                    color: T.ink2,
                                }}
                            >
                                {resolvedCount}
                            </span>
                        </button>
                    </div>

                    {/* Scope toggle for client admins */}
                    {userRole === "CLIENT" && (
                        <div style={{ display: "flex", gap: 4 }}>
                            <button
                                type="button"
                                onClick={() => setScopeFilter((prev) => (prev === "ALL" ? "MINE" : "ALL"))}
                                style={{
                                    padding: "4px 9px",
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: scopeFilter === "MINE" ? T.brandSoft : "transparent",
                                    border: `1px solid ${scopeFilter === "MINE" ? "rgba(99,102,241,0.25)" : T.line}`,
                                    color: scopeFilter === "MINE" ? T.brandStrong : T.ink3,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                }}
                            >
                                {scopeFilter === "MINE" ? (
                                    <>
                                        <User className="w-3 h-3" />
                                        <span>Mes demandes</span>
                                    </>
                                ) : (
                                    <>
                                        <Users className="w-3 h-3" />
                                        <span>Toutes</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Conversation List */}
            <div
                className="cp-support-scroll"
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                }}
            >
                {filtered.length === 0 ? (
                    <div
                        style={{
                            padding: "36px 16px",
                            textAlign: "center",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 12,
                        }}
                    >
                        <div
                            style={{
                                width: 48,
                                height: 48,
                                borderRadius: "50%",
                                background: T.brandSoft,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: T.brandStrong,
                            }}
                        >
                            {statusTab === "ACTIVE" ? (
                                <Inbox className="w-6 h-6" />
                            ) : (
                                <FolderArchive className="w-6 h-6" />
                            )}
                        </div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>
                            {statusTab === "ACTIVE"
                                ? "Aucune demande en cours"
                                : "Aucune demande résolue"}
                        </div>
                        <div
                            style={{
                                fontSize: 12,
                                color: T.ink3,
                                lineHeight: 1.5,
                                maxWidth: 280,
                            }}
                        >
                            {statusTab === "ACTIVE"
                                ? "Besoin d'un accompagnement sur votre mission ? Démarrez une nouvelle demande :"
                                : "Les demandes traitées et archivées apparaîtront ici."}
                        </div>

                        {statusTab === "ACTIVE" && (
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 6,
                                    width: "100%",
                                    marginTop: 6,
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => onNewRequest("RDV")}
                                    style={{
                                        padding: "9px 12px",
                                        borderRadius: T.radiusS,
                                        background: T.paperRaised,
                                        border: `1px solid ${T.line}`,
                                        color: T.ink,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        transition: "all 150ms ease",
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = T.brand;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = T.line;
                                    }}
                                >
                                    {getIntentLucideIcon("RDV", "w-4 h-4 text-indigo-600")}
                                    <span>Question sur un rendez-vous</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onNewRequest("RAPPORT")}
                                    style={{
                                        padding: "9px 12px",
                                        borderRadius: T.radiusS,
                                        background: T.paperRaised,
                                        border: `1px solid ${T.line}`,
                                        color: T.ink,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        transition: "all 150ms ease",
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = T.brand;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = T.line;
                                    }}
                                >
                                    {getIntentLucideIcon("RAPPORT", "w-4 h-4 text-cyan-600")}
                                    <span>Demander un rapport de campagne</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onNewRequest("PROBLEME")}
                                    style={{
                                        padding: "9px 12px",
                                        borderRadius: T.radiusS,
                                        background: T.paperRaised,
                                        border: `1px solid ${T.line}`,
                                        color: T.ink,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        transition: "all 150ms ease",
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = T.brand;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = T.line;
                                    }}
                                >
                                    {getIntentLucideIcon("PROBLEME", "w-4 h-4 text-amber-600")}
                                    <span>Signaler un problème technique</span>
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    filtered.map((conv) => {
                        const intentCfg = conv.lastIntent ? INTENT_CARD_CONFIG[conv.lastIntent] : null;
                        const isUnread = (conv.unreadCount || 0) > 0;

                        return (
                            <button
                                key={conv.id}
                                type="button"
                                onClick={() => onSelectConversation(conv.id)}
                                className="cp-support-card-hover"
                                style={{
                                    width: "100%",
                                    textAlign: "left",
                                    padding: "12px 14px",
                                    borderRadius: T.radiusM,
                                    background: T.paperRaised,
                                    border: `1px solid ${isUnread ? T.brand : T.line}`,
                                    boxShadow: isUnread ? "0 2px 8px rgba(124,92,252,0.12)" : "0 1px 3px rgba(0,0,0,0.03)",
                                    cursor: "pointer",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 6,
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                        {intentCfg && conv.lastIntent && (
                                            <span
                                                style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: 4,
                                                    padding: "2px 7px",
                                                    borderRadius: 6,
                                                    fontSize: 10.5,
                                                    fontWeight: 600,
                                                    background: intentCfg.bg,
                                                    color: intentCfg.color,
                                                    border: `1px solid ${intentCfg.border}`,
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {getIntentLucideIcon(conv.lastIntent, "w-3 h-3")}
                                                <span>{intentCfg.label}</span>
                                            </span>
                                        )}
                                        <span
                                            style={{
                                                fontSize: 13,
                                                fontWeight: isUnread ? 700 : 600,
                                                color: T.ink,
                                                whiteSpace: "nowrap",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                            }}
                                        >
                                            {conv.subject}
                                        </span>
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                        {isUnread && (
                                            <span
                                                style={{
                                                    padding: "1px 6px",
                                                    borderRadius: 999,
                                                    background: T.danger,
                                                    color: "#FFFFFF",
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {conv.unreadCount} non lu{conv.unreadCount > 1 ? "s" : ""}
                                            </span>
                                        )}
                                        <span
                                            className="cp-support-root-mono"
                                            style={{
                                                fontSize: 10.5,
                                                color: T.ink3,
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 3,
                                            }}
                                        >
                                            <Clock className="w-3 h-3" />
                                            {formatRelative(conv.lastMessageAt || conv.updatedAt)}
                                        </span>
                                    </div>
                                </div>

                                {conv.lastMessagePreview && (
                                    <p
                                        style={{
                                            margin: 0,
                                            fontSize: 12,
                                            color: isUnread ? T.ink : T.ink3,
                                            fontWeight: isUnread ? 500 : 400,
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                        }}
                                    >
                                        {conv.lastMessagePreview}
                                    </p>
                                )}

                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        marginTop: 2,
                                        fontSize: 11,
                                        color: T.ink4,
                                    }}
                                >
                                    <span>
                                        {conv.createdByName ? `Par ${conv.createdByName}` : "Demande"}
                                        {conv.createdByRole ? ` (${conv.createdByRole === "COMMERCIAL" ? "Commercial" : "Client"})` : ""}
                                    </span>
                                    <span
                                        style={{
                                            color: T.brandStrong,
                                            fontWeight: 600,
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 3,
                                        }}
                                    >
                                        <span>Ouvrir</span>
                                        <ArrowRight className="w-3 h-3" />
                                    </span>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
