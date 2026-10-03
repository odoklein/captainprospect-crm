"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
    Building2,
    Target,
    Users,
    Mail,
    Phone,
    Globe,
    MapPin,
    Briefcase,
    Calendar,
    Plus,
    Link2,
    Unlink,
    MessageSquare,
    Send,
    Loader2,
    User,
    Clock,
    Tag,
    X,
} from "lucide-react";
import { LabelSection } from "./LabelSection";

// ============================================
// TYPES
// ============================================

interface Contact {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    title: string | null;
    phone: string | null;
    company: {
        id: string;
        name: string;
    } | null;
}

interface Client {
    id: string;
    name: string;
    email: string | null;
    industry: string | null;
}

interface Mission {
    id: string;
    name: string;
    client: { id: string; name: string };
}

interface Campaign {
    id: string;
    name: string;
}

interface ThreadContext {
    contact: Contact | null;
    client: Client | null;
    mission: Mission | null;
    campaign: Campaign | null;
    opportunity: {
        id: string;
        needSummary: string | null;
        urgency: string | null;
    } | null;
    assignedTo: {
        id: string;
        name: string;
        email: string;
    } | null;
    labels: string[];
    comments: {
        id: string;
        content: string;
        createdAt: string;
        user: { id: string; name: string };
    }[];
}

interface ContextPanelProps {
    threadId: string;
}

// ============================================
// CONTEXT PANEL COMPONENT
// ============================================

export function ContextPanel({ threadId }: ContextPanelProps) {
    const [context, setContext] = useState<ThreadContext | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"context" | "comments">("context");
    const [newComment, setNewComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch context
    useEffect(() => {
        const fetchContext = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/email/threads/${threadId}`);
                const json = await res.json();

                if (json.success) {
                    setContext({
                        contact: json.data.contact,
                        client: json.data.client,
                        mission: json.data.mission,
                        campaign: json.data.campaign,
                        opportunity: json.data.opportunity,
                        assignedTo: json.data.assignedTo,
                        labels: json.data.labels || [],
                        comments: json.data.comments || [],
                    });
                }
            } catch (error) {
                console.error("Failed to fetch context:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchContext();
    }, [threadId]);

    // Submit comment
    const handleSubmitComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || isSubmitting) return;

        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/email/threads/${threadId}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: newComment }),
            });
            const json = await res.json();

            if (json.success) {
                setContext(prev => prev ? {
                    ...prev,
                    comments: [...prev.comments, json.data],
                } : null);
                setNewComment("");
            }
        } catch (error) {
            console.error("Failed to add comment:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
        );
    }

    const handleUpdate = (updates: Partial<ThreadContext>) => {
        setContext(prev => prev ? { ...prev, ...updates } : null);
    };

    return (
        <div className="flex flex-col h-full">
            {/* Tabs */}
            <div className="flex border-b border-slate-200">
                <button
                    onClick={() => setActiveTab("context")}
                    className={cn(
                        "flex-1 px-4 py-3 text-sm font-medium transition-colors",
                        activeTab === "context"
                            ? "text-primary-600 border-b-2 border-primary-600"
                            : "text-slate-500 hover:text-slate-700"
                    )}
                >
                    Contexte
                </button>
                <button
                    onClick={() => setActiveTab("comments")}
                    className={cn(
                        "flex-1 px-4 py-3 text-sm font-medium transition-colors relative",
                        activeTab === "comments"
                            ? "text-primary-600 border-b-2 border-primary-600"
                            : "text-slate-500 hover:text-slate-700"
                    )}
                >
                    Notes
                    {context && context.comments.length > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-slate-200 rounded-full">
                            {context.comments.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === "context" ? (
                    <ContextContent
                        context={context}
                        threadId={threadId}
                        onUpdate={handleUpdate}
                    />
                ) : (
                    <CommentsContent
                        comments={context?.comments || []}
                        newComment={newComment}
                        setNewComment={setNewComment}
                        onSubmit={handleSubmitComment}
                        isSubmitting={isSubmitting}
                    />
                )}
            </div>
        </div>
    );
}

// ============================================
// CONTEXT CONTENT
// ============================================

function ContextContent({
    context,
    threadId,
    onUpdate,
}: {
    context: ThreadContext | null;
    threadId: string;
    onUpdate: (updates: Partial<ThreadContext>) => void;
}) {
    const [isEditingClient, setIsEditingClient] = useState(false);
    const [clientSearch, setClientSearch] = useState("");

    const [isEditingMission, setIsEditingMission] = useState(false);
    const [missionSearch, setMissionSearch] = useState("");

    if (!context) return null;

    const handleLinkClient = async () => {
        if (!clientSearch.trim()) return;
        // Mock linking - in real app would search and select ID
        const mockClient = { id: "new-client", name: clientSearch, email: null, industry: null };
        onUpdate({ client: mockClient });
        setIsEditingClient(false);
        setClientSearch("");
        // Mock API call
        // await fetch(...)
    };

    const handleLinkMission = async () => {
        if (!missionSearch.trim()) return;
        const mockMission = { id: "new-mission", name: missionSearch, client: { id: "c", name: "Client" } };
        onUpdate({ mission: mockMission });
        setIsEditingMission(false);
        setMissionSearch("");
    };

    return (
        <div className="p-4 space-y-4">

            {/* Contact Card */}
            {context.contact && (
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold">
                            {(context.contact.firstName?.[0] || context.contact.email?.[0] || "?").toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                                {context.contact.firstName} {context.contact.lastName}
                            </p>
                            {context.contact.title && (
                                <p className="text-xs text-slate-500 truncate">
                                    {context.contact.title}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2 text-sm">
                        {context.contact.email && (
                            <div className="flex items-center gap-2 text-slate-600">
                                <Mail className="w-4 h-4 text-slate-400" />
                                <span className="truncate">{context.contact.email}</span>
                            </div>
                        )}
                        {context.contact.phone && (
                            <div className="flex items-center gap-2 text-slate-600">
                                <Phone className="w-4 h-4 text-slate-400" />
                                <span>{context.contact.phone}</span>
                            </div>
                        )}
                        {context.contact.company && (
                            <div className="flex items-center gap-2 text-slate-600">
                                <Building2 className="w-4 h-4 text-slate-400" />
                                <span className="truncate">{context.contact.company.name}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Client Link */}
            {context.client ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-emerald-600" />
                            <span className="text-sm font-medium text-emerald-800">Client</span>
                        </div>
                        <button
                            onClick={() => onUpdate({ client: null })}
                            className="p-1 text-emerald-600 hover:bg-emerald-100 rounded"
                        >
                            <Unlink className="w-3 h-3" />
                        </button>
                    </div>
                    <p className="text-sm font-semibold text-emerald-900">{context.client.name}</p>
                    {context.client.industry && (
                        <p className="text-xs text-emerald-600">{context.client.industry}</p>
                    )}
                </div>
            ) : isEditingClient ? (
                <div className="p-3 border border-slate-200 rounded-xl bg-slate-50">
                    <p className="text-xs font-semibold text-slate-500 mb-2">Lier un client</p>
                    <div className="flex gap-2">
                        <input
                            autoFocus
                            type="text"
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleLinkClient();
                                if (e.key === 'Escape') setIsEditingClient(false);
                            }}
                            placeholder="Nom du client..."
                            className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded-lg outline-none focus:border-emerald-500"
                        />
                        <button onClick={handleLinkClient} className="px-2 py-1 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700">OK</button>
                        <button onClick={() => setIsEditingClient(false)} className="px-2 py-1 text-slate-500 hover:bg-slate-200 rounded-lg"><X className="w-3 h-3" /></button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setIsEditingClient(true)}
                    className="w-full p-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors flex items-center justify-center gap-2"
                >
                    <Link2 className="w-4 h-4" />
                    Lier à un client
                </button>
            )}

            {/* Mission Link */}
            {context.mission ? (
                <div className="p-3 bg-primary-50 border border-primary-200 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Target className="w-4 h-4 text-primary-600" />
                            <span className="text-sm font-medium text-primary-800">Mission</span>
                        </div>
                        <button
                            onClick={() => onUpdate({ mission: null })}
                            className="p-1 text-primary-600 hover:bg-primary-100 rounded"
                        >
                            <Unlink className="w-3 h-3" />
                        </button>
                    </div>
                    <p className="text-sm font-semibold text-primary-900">{context.mission.name}</p>
                    <p className="text-xs text-primary-600">{context.mission.client.name}</p>
                </div>
            ) : isEditingMission ? (
                <div className="p-3 border border-slate-200 rounded-xl bg-slate-50">
                    <p className="text-xs font-semibold text-slate-500 mb-2">Lier une mission</p>
                    <div className="flex gap-2">
                        <input
                            autoFocus
                            type="text"
                            value={missionSearch}
                            onChange={(e) => setMissionSearch(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleLinkMission();
                                if (e.key === 'Escape') setIsEditingMission(false);
                            }}
                            placeholder="Nom de la mission..."
                            className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded-lg outline-none focus:border-primary-500"
                        />
                        <button onClick={handleLinkMission} className="px-2 py-1 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700">OK</button>
                        <button onClick={() => setIsEditingMission(false)} className="px-2 py-1 text-slate-500 hover:bg-slate-200 rounded-lg"><X className="w-3 h-3" /></button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setIsEditingMission(true)}
                    className="w-full p-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-primary-300 hover:text-primary-600 transition-colors flex items-center justify-center gap-2"
                >
                    <Link2 className="w-4 h-4" />
                    Lier à une mission
                </button>
            )}



            {/* Labels */}
            <LabelSection
                labels={context.labels}
                onAddLabel={async (label: string) => {
                    // Optimistic
                    const newLabels = [...context.labels, label];
                    onUpdate({ labels: newLabels });
                    // Call API to update
                    try {
                        await fetch(`/api/email/threads/${threadId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ labels: newLabels }),
                        });
                    } catch (e) {
                        console.error("Failed to add label", e);
                        // Revert could happen here but simplistic optimistic UI assumes success usually or needs parent to handle error based revert
                    }
                }}
                onRemoveLabel={async (label: string) => {
                    const newLabels = context.labels.filter(l => l !== label);
                    onUpdate({ labels: newLabels });
                    try {
                        await fetch(`/api/email/threads/${threadId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ labels: newLabels }),
                        });
                    } catch (e) {
                        console.error("Failed to remove label", e);
                    }
                }}
            />
        </div>
    );
}

// ============================================
// COMMENTS CONTENT
// ============================================

interface CommentsContentProps {
    comments: ThreadContext["comments"];
    newComment: string;
    setNewComment: (value: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    isSubmitting: boolean;
}

function CommentsContent({
    comments,
    newComment,
    setNewComment,
    onSubmit,
    isSubmitting,
}: CommentsContentProps) {
    return (
        <div className="flex flex-col h-full">
            {/* Comments list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {comments.length === 0 ? (
                    <div className="text-center py-8">
                        <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-500">Aucune note interne</p>
                    </div>
                ) : (
                    comments.map((comment) => (
                        <div
                            key={comment.id}
                            className="p-3 bg-amber-50 border border-amber-200 rounded-xl"
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-amber-800">
                                    {comment.user.name}
                                </span>
                                <span className="text-xs text-amber-600">
                                    {new Date(comment.createdAt).toLocaleDateString("fr-FR")}
                                </span>
                            </div>
                            <p className="text-sm text-amber-900">{comment.content}</p>
                        </div>
                    ))
                )}
            </div>

            {/* New comment form */}
            <form onSubmit={onSubmit} className="p-3 border-t border-slate-200">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Ajouter une note..."
                        className="flex-1 px-3 py-2.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                    />
                    <button
                        type="submit"
                        disabled={!newComment.trim() || isSubmitting}
                        className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isSubmitting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default ContextPanel;
