"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Send, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, useToast } from "@/components/ui";
import {
    TICKET_PRIORITY_LABELS,
    TICKET_SCOPE_LABELS,
    TICKET_STATUS_LABELS,
    USER_ROLE_LABELS,
} from "@/lib/tickets/constants";
import type { TicketDetail, TicketComment, TicketHistoryEntry } from "./types";

interface TicketThreadProps {
    ticket: TicketDetail;
    currentUserId: string;
    canComment: boolean;
    onRefresh: () => void;
}

type FeedEntry =
    | { kind: "comment"; at: string; data: TicketComment }
    | { kind: "event"; at: string; data: TicketHistoryEntry };

/** Turns a raw history row into the sentence shown inline in the thread. */
function describeEvent(entry: TicketHistoryEntry): string {
    const actor = entry.user?.name ?? "Quelqu'un";

    switch (entry.field) {
        case "created":
            return `${actor} a créé le ticket`;
        case "status":
            return `${actor} a changé le statut en ${TICKET_STATUS_LABELS[entry.toValue as keyof typeof TICKET_STATUS_LABELS] ?? entry.toValue}`;
        case "priority":
            return `${actor} a changé la priorité en ${TICKET_PRIORITY_LABELS[entry.toValue as keyof typeof TICKET_PRIORITY_LABELS] ?? entry.toValue}`;
        case "scope":
            return `${actor} a changé la portée en ${TICKET_SCOPE_LABELS[entry.toValue as keyof typeof TICKET_SCOPE_LABELS] ?? entry.toValue}`;
        case "assigneeId":
            return entry.toValue ? `${actor} a réassigné le ticket` : `${actor} a retiré l'assignation`;
        case "affectedRoles": {
            const roles = (entry.toValue ?? "")
                .split(",")
                .filter(Boolean)
                .map((role) => USER_ROLE_LABELS[role as keyof typeof USER_ROLE_LABELS] ?? role)
                .join(", ");
            return `${actor} a mis à jour les rôles impactés : ${roles || "aucun"}`;
        }
        case "publishToRoadmap":
            return entry.toValue === "true"
                ? `${actor} a publié le ticket sur la roadmap client`
                : `${actor} a retiré le ticket de la roadmap client`;
        case "title":
            return `${actor} a modifié le titre`;
        case "description":
            return `${actor} a modifié la description`;
        case "dueDate":
            return entry.toValue ? `${actor} a modifié l'échéance` : `${actor} a retiré l'échéance`;
        default:
            return `${actor} a modifié ${entry.field}`;
    }
}

function formatTime(value: string) {
    return new Date(value).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function initials(name: string) {
    return name
        .split(" ")
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

export function TicketThread({ ticket, currentUserId, canComment, onRefresh }: TicketThreadProps) {
    const toast = useToast();
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    const feed = useMemo<FeedEntry[]>(() => {
        const entries: FeedEntry[] = [
            ...ticket.comments.map((comment) => ({ kind: "comment" as const, at: comment.createdAt, data: comment })),
            ...ticket.history.map((event) => ({ kind: "event" as const, at: event.createdAt, data: event })),
        ];
        return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    }, [ticket.comments, ticket.history]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ block: "end" });
    }, [feed.length, ticket.id]);

    const handleSend = async () => {
        const content = message.trim();
        if (!content) return;

        setIsSending(true);
        try {
            const response = await fetch(`/api/tickets/${ticket.id}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || "Envoi impossible");
            }
            setMessage("");
            onRefresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Erreur serveur");
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <p className="text-sm font-semibold text-slate-900 mb-1">{ticket.title}</p>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">
                        {ticket.description || "Aucune description fournie."}
                    </p>
                    <p className="mt-3 text-xs text-slate-400">
                        Ouvert par {ticket.requester.name} · {formatTime(ticket.createdAt)}
                    </p>
                </div>

                {ticket.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {ticket.attachments.map((attachment) => (
                            <a
                                key={attachment.id}
                                href={attachment.url ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-xl hover:border-slate-300"
                            >
                                <Paperclip className="w-3.5 h-3.5" />
                                {attachment.originalName}
                            </a>
                        ))}
                    </div>
                )}

                {feed.map((entry) =>
                    entry.kind === "event" ? (
                        <div key={`event-${entry.data.id}`} className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="h-px flex-1 bg-slate-200" />
                            <span className="whitespace-nowrap">
                                {describeEvent(entry.data)} · {formatTime(entry.at)}
                            </span>
                            <span className="h-px flex-1 bg-slate-200" />
                        </div>
                    ) : (
                        <CommentBubble
                            key={`comment-${entry.data.id}`}
                            comment={entry.data}
                            isMine={entry.data.user.id === currentUserId}
                        />
                    ),
                )}

                <div ref={bottomRef} />
            </div>

            {canComment && (
                <div className="border-t border-slate-200 bg-white p-4">
                    <div className="flex items-end gap-3">
                        <textarea
                            value={message}
                            onChange={(event) => setMessage(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                                    event.preventDefault();
                                    handleSend();
                                }
                            }}
                            rows={2}
                            placeholder="Ajouter un commentaire… (Ctrl+Entrée pour envoyer)"
                            className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-500 resize-none focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <Button onClick={handleSend} isLoading={isSending} disabled={!message.trim()} className="!p-3">
                            <Send className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

function CommentBubble({ comment, isMine }: { comment: TicketComment; isMine: boolean }) {
    return (
        <div className={cn("flex gap-3", isMine && "flex-row-reverse")}>
            <div
                className={cn(
                    "w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold",
                    isMine ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600",
                )}
            >
                {initials(comment.user.name)}
            </div>
            <div className={cn("max-w-[75%]", isMine && "text-right")}>
                <div
                    className={cn(
                        "inline-block px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap text-left",
                        isMine
                            ? "bg-indigo-50 text-slate-800 border border-indigo-100"
                            : "bg-white text-slate-700 border border-slate-200",
                    )}
                >
                    {comment.content}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                    {comment.user.name} · {formatTime(comment.createdAt)}
                </p>
            </div>
        </div>
    );
}

export default TicketThread;
