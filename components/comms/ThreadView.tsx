"use client";

import { useState, useRef, useEffect, useCallback, memo } from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
    X,
    MoreVertical,
    CheckCircle,
    Archive,
    Users,
    Send,
    Paperclip,
    ChevronDown,
    Clock,
    Loader2,
    Phone,
    Calendar,
    UserPlus,
    CheckCheck,
    Maximize2,
    Minimize2,
} from "lucide-react";
import { RichTextEditor } from "./RichTextEditor";
import { MessageContent } from "./MessageContent";
import { MessageAttachments } from "./MessageAttachments";
import { MessageReactions } from "./MessageReactions";
import { ThreadSummary } from "./ThreadSummary";
import { SuggestionChips } from "./SuggestionChips";
import { TemplatePicker } from "./TemplatePicker";
import type { CommsThreadView, CommsMessageView } from "@/lib/comms/types";

interface ThreadViewProps {
    thread: CommsThreadView;
    onClose: () => void;
    onStatusChange: (status: "RESOLVED" | "ARCHIVED") => void;
    onSendMessage: (
        content: string,
        opts?: { mentionIds?: string[]; files?: File[] }
    ) => Promise<void>;
    onReactionToggle?: (messageId: string, emoji: string) => Promise<void>;
    currentUserId: string;
    typingUserName?: string;
    /** When true, parent should hide page header/stats and collapse list for near full-screen chat */
    focusMode?: boolean;
    onFocusModeChange?: (active: boolean) => void;
    isRecipientOnline?: boolean;
    onTyping?: (isTyping: boolean) => void;
}

export function ThreadView({
    thread,
    onClose,
    onStatusChange,
    onSendMessage,
    onReactionToggle,
    currentUserId,
    typingUserName,
    focusMode,
    onFocusModeChange,
    isRecipientOnline,
    onTyping,
}: ThreadViewProps) {
    const [messageContent, setMessageContent] = useState("");
    const [mentionIds, setMentionIds] = useState<string[]>([]);
    const [files, setFiles] = useState<File[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const mentionOptions = thread.participants.map((p) => ({
        id: p.userId,
        name: p.userName,
    }));

    const notifyTyping = useCallback(
        (isTyping: boolean) => {
            if (!onTyping) return;

            if (typingDebounceRef.current) {
                clearTimeout(typingDebounceRef.current);
                typingDebounceRef.current = null;
            }
            if (typingStopRef.current) {
                clearTimeout(typingStopRef.current);
                typingStopRef.current = null;
            }
            if (isTyping) {
                typingDebounceRef.current = setTimeout(() => {
                    typingDebounceRef.current = null;
                    onTyping(true);
                    typingStopRef.current = setTimeout(() => {
                        typingStopRef.current = null;
                        onTyping(false);
                    }, 2500);
                }, 300);
            } else {
                onTyping(false);
            }
        },
        [onTyping]
    );

    useEffect(() => {
        return () => {
            if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
            if (typingStopRef.current) clearTimeout(typingStopRef.current);
            if (onTyping) onTyping(false);
        };
    }, [thread.id, onTyping]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [thread.messages]);

    const handleSend = async () => {
        const trimmed = messageContent.trim();
        if ((!trimmed && files.length === 0) || isSending) return;

        notifyTyping(false);
        setIsSending(true);
        try {
            await onSendMessage(trimmed, {
                mentionIds: mentionIds.length > 0 ? mentionIds : undefined,
                files: files.length > 0 ? files : undefined,
            });
            setMessageContent("");
            setMentionIds([]);
            setFiles([]);
        } finally {
            setIsSending(false);
        }
    };

    // Helper to get display title for thread
    const getThreadTitle = () => {
        if (thread.channelType === "DIRECT") {
            const otherParticipant = thread.participants.find(p => p.userId !== currentUserId);
            if (otherParticipant) {
                return otherParticipant.userName;
            }
            if (thread.subject.startsWith("Message avec ")) {
                return thread.subject.replace("Message avec ", "");
            }
        }
        return thread.subject;
    };

    const isDirectMessage = thread.channelType === "DIRECT";
    const threadTitle = getThreadTitle();

    return (
        <div className="flex flex-col h-full bg-white dark:bg-[#151c2a]">
            <header className="h-12 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 bg-white/80 dark:bg-[#151c2a]/90 backdrop-blur-sm z-10 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="size-8 rounded-full bg-primary-100 dark:bg-indigo-900/50 flex items-center justify-center text-xs font-semibold text-primary-600 dark:text-indigo-400 shrink-0">
                        {threadTitle.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-slate-900 dark:text-white truncate text-sm">{threadTitle}</h3>
                            {isRecipientOnline && (
                                <span className="relative flex h-2 w-2 items-center justify-center shrink-0" title="En ligne">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                    {onFocusModeChange && (
                        <button
                            onClick={() => onFocusModeChange(!focusMode)}
                            className={cn(
                                "p-2 rounded-lg transition-colors",
                                focusMode
                                    ? "text-primary-600 bg-primary-500/10"
                                    : "text-slate-500 hover:text-primary-600 hover:bg-primary-500/5"
                            )}
                            title={focusMode ? "Quitter le mode focus" : "Mode focus (plein écran chat)"}
                        >
                            {focusMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                    )}
                    <button className="p-2 text-slate-500 hover:text-primary-600 hover:bg-primary-500/5 rounded-lg transition-colors">
                        <Phone className="w-4 h-4" />
                    </button>
                    <div className="relative">
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            className={cn(
                                "p-2 rounded-lg transition-colors",
                                showMenu
                                    ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                                    : "text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                            )}
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>
                        {showMenu && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                                <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-20">
                                    <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700">
                                        <Calendar className="w-4 h-4 text-slate-400" />
                                        <span>Planifier un RDV</span>
                                    </button>
                                    <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700">
                                        <UserPlus className="w-4 h-4 text-slate-400" />
                                        <span>Assigner</span>
                                    </button>
                                    {(thread.status === "OPEN" || thread.status === "RESOLVED") && (
                                        <>
                                            <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                                            {thread.status === "OPEN" && (
                                                <button
                                                    onClick={() => { onStatusChange("RESOLVED"); setShowMenu(false); }}
                                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                                                >
                                                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                                                    <span>Marquer comme résolu</span>
                                                </button>
                                            )}
                                            <button
                                                onClick={() => { onStatusChange("ARCHIVED"); setShowMenu(false); }}
                                                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                                            >
                                                <Archive className="w-4 h-4 text-slate-400" />
                                                <span>Archiver</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {typingUserName && (
                <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex gap-0.5">
                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <p className="text-xs text-primary-600 dark:text-indigo-400 font-medium">{typingUserName} écrit…</p>
                </div>
            )}

            {thread.messages.length >= 5 && <ThreadSummary threadId={thread.id} />}

            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-1 bg-slate-50 dark:bg-slate-900/50">
                {thread.messages.length > 0 && (
                    <div className="flex justify-center py-2">
                        <span className="text-xs font-medium text-slate-400 bg-slate-200 dark:bg-slate-800 px-2.5 py-0.5 rounded-full">
                            {format(new Date(thread.messages[0].createdAt), "EEEE d MMMM", { locale: fr })}
                        </span>
                    </div>
                )}
                {thread.messages.map((message, index) => {
                    const isOwn = message.author.id === currentUserId;
                    const prevMessage = index > 0 ? thread.messages[index - 1] : null;
                    const sameAuthor = !!(prevMessage && prevMessage.author.id === message.author.id);
                    const showAvatar = !sameAuthor;
                    const currentDate = new Date(message.createdAt).toDateString();
                    const prevDate = prevMessage ? new Date(prevMessage.createdAt).toDateString() : null;
                    const showDateSeparator = prevDate && currentDate !== prevDate;

                    return (
                        <div key={message.id}>
                            {showDateSeparator && (
                                <div className="flex justify-center py-3">
                                    <span className="text-xs font-medium text-slate-400 bg-slate-200 dark:bg-slate-800 px-2.5 py-0.5 rounded-full">
                                        {format(new Date(message.createdAt), "EEEE d MMMM", { locale: fr })}
                                    </span>
                                </div>
                            )}
                            <MessageBubble
                                message={message}
                                isOwn={isOwn}
                                showAvatar={showAvatar}
                                sameAuthor={sameAuthor}
                                currentUserId={currentUserId}
                                onReactionToggle={onReactionToggle}
                            />
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {thread.status === "OPEN" && !thread.isBroadcast && (
                <div className="p-4 bg-white dark:bg-[#151c2a] border-t border-slate-200 dark:border-slate-800 shrink-0">
                    <div className="max-w-4xl mx-auto flex flex-col gap-2">
                        {!messageContent && thread.messages.length > 0 && (
                            <div className="flex gap-2 mb-1">
                                <SuggestionChips threadId={thread.id} onSelect={setMessageContent} />
                                <TemplatePicker onSelect={setMessageContent} />
                            </div>
                        )}
                        <MessageAttachments files={files} onChange={setFiles} disabled={isSending} />
                        <div className="relative bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500 transition-all">
                            <RichTextEditor
                                value={messageContent}
                                onChange={(v, ids) => {
                                    setMessageContent(v);
                                    setMentionIds(ids);
                                    if (thread.status === "OPEN" && !thread.isBroadcast) notifyTyping(true);
                                }}
                                onBlur={() => notifyTyping(false)}
                                onSubmit={handleSend}
                                placeholder="Écrire un message... @mention pour notifier"
                                disabled={isSending}
                                mentionOptions={mentionOptions}
                                minRows={2}
                                maxRows={6}
                            />
                            <div className="flex justify-between items-center px-3 pb-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                    <span>Visible par : Tous les participants</span>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleSend}
                                        disabled={(!messageContent.trim() && files.length === 0) || isSending}
                                        className={cn(
                                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm",
                                            (messageContent.trim() || files.length > 0)
                                                ? "bg-primary-500 hover:bg-primary-600 text-white"
                                                : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                                        )}
                                    >
                                        Envoyer <Send className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {thread.status !== "OPEN" && (
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
                    <div className="flex items-center justify-center gap-3">
                        {thread.status === "RESOLVED" ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <Archive className="w-5 h-5 text-slate-400" />}
                        <span className="text-sm font-medium text-slate-600">
                            Cette discussion est {thread.status === "RESOLVED" ? "résolue" : "archivée"}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

function MessageBubble({
    message,
    isOwn,
    showAvatar,
    sameAuthor,
    currentUserId,
    onReactionToggle,
}: {
    message: CommsMessageView;
    isOwn: boolean;
    showAvatar: boolean;
    sameAuthor: boolean;
    currentUserId: string;
    onReactionToggle?: (messageId: string, emoji: string) => Promise<void>;
}) {
    if (message.type === "SYSTEM") {
        return (
            <div className="flex justify-center py-2">
                <span className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full font-medium">
                    {message.content}
                </span>
            </div>
        );
    }

    const hasReadReceipt = isOwn && message.readBy && message.readBy.length > 0;

    return (
        <div className={cn("flex gap-2.5 group", sameAuthor && "mt-0.5", isOwn ? "flex-row-reverse" : "flex-row")}>
            {showAvatar ? (
                <div className={cn("size-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 mt-0.5", isOwn ? "bg-primary-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300")}>
                    {message.author.initials}
                </div>
            ) : <div className="size-7 flex-shrink-0 w-[26px]" />}

            <div className={cn("flex flex-col gap-0.5 max-w-[75%]", isOwn && "items-end")}>
                {showAvatar && (
                    <div className={cn("flex items-baseline gap-1.5 px-0.5", isOwn && "flex-row-reverse")}>
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">{isOwn ? "Vous" : message.author.name}</span>
                        <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                            {format(new Date(message.createdAt), "HH:mm", { locale: fr })}
                            {(message as { isOptimistic?: boolean }).isOptimistic && (
                                <span className="flex items-center gap-0.5 text-primary-500"><Loader2 className="w-2.5 h-2.5 animate-spin" /> Envoi…</span>
                            )}
                        </span>
                    </div>
                )}
                <div className={cn("px-3 py-2 text-sm leading-snug shadow-sm", (message as { isOptimistic?: boolean }).isOptimistic && "opacity-90", isOwn ? "bg-primary-500 text-white rounded-xl rounded-tr-sm" : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl rounded-tl-sm")}>
                    <MessageContent content={message.content} isOwn={isOwn} className={isOwn ? "text-white" : ""} />
                    {message.isEdited && <span className={cn("text-[10px] ml-2", isOwn ? "text-primary-200" : "text-slate-400")}>(modifié)</span>}
                </div>
                {hasReadReceipt && (
                    <span className="text-xs font-medium text-slate-400 flex items-center gap-1">Lu <CheckCheck className="w-3.5 h-3.5" /></span>
                )}
                {message.type === "TEXT" && !(message as { isOptimistic?: boolean }).isOptimistic && (
                    <MessageReactions
                        messageId={message.id}
                        reactions={message.reactions ?? []}
                        currentUserId={currentUserId}
                        onToggle={(msgId, emoji) => onReactionToggle?.(msgId, emoji) ?? Promise.resolve()}
                        isOwn={isOwn}
                    />
                )}
                {message.attachments.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                        {message.attachments.map((att) => (
                            <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className={cn("flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-colors", isOwn ? "bg-primary-400/30 text-primary-100 hover:bg-primary-400/50" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                                <Paperclip className="w-3.5 h-3.5" /> {att.filename}
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

const MemoizedThreadView = memo(ThreadView);
export default MemoizedThreadView;
