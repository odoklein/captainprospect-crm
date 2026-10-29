"use client";

/**
 * One thread: header, messages, composer and the canvas slot, with files
 * droppable anywhere on it. `conversationId === null` is a draft: the empty
 * state and the composer, the conversation being created on the first send
 * (by the host, through `onStart`).
 *
 * Mounted with `key={conversationId}` so local state (canvas, pins, edit,
 * secrets) never leaks from one thread to the next.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDropzone } from "react-dropzone";
import { useSession } from "next-auth/react";
import { ArrowRight, MessageSquareOff, Upload } from "lucide-react";
import {
    ASSISTANT_API,
    type FolderCard,
    type FolderKind,
    type ThreadMessage,
} from "@/lib/assistant/api-contract";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import { apiSend } from "@/lib/assistant/client/fetcher";
import { useThread, useThreadActions } from "@/lib/assistant/client/thread-hooks";
import { cn } from "@/lib/utils";
import { EmptyBlock, FOCUS, SECONDARY_BUTTON } from "@/components/accueil/AccueilUI";
import { AiMark } from "@/components/ui/AiMark";
import { useToast } from "@/components/ui/Toast";
import type { RevealedSecret } from "@/components/vault/SecretCard";
import type { VisualHandlers } from "../../AnswerBody";
import type { StoredAction } from "../../types";
import { Canvas } from "../Canvas";
import { Composer, type ComposerHandle, type ComposerSubmit } from "../Composer";
import type { ChatStream } from "../useChatStream";
import { AssistantMessage } from "./AssistantMessage";
import { ErrorTurn } from "./ErrorTurn";
import { MessageList } from "./MessageList";
import { ThreadHeader } from "./ThreadHeader";
import { UserMessage } from "./UserMessage";
import { isLocalId, lastOfRole, parseAction, patchMessage } from "./model";
import { useAttachments } from "./useAttachments";

export interface DraftScope {
    folderId: string | null;
    folderName: string;
    folderKind: FolderKind | "AGENCY";
    clientId?: string | null;
    missionId?: string | null;
}

export interface StartRequest {
    text: string;
    deep: boolean;
    attachments: Array<{ fileId: string; name: string; status: string }>;
}

export interface ThreadProps {
    conversationId: string | null;
    stream: ChatStream;
    draft?: DraftScope | null;
    /** Draft only: create the conversation and send the first message. */
    onStart?: (request: StartRequest) => Promise<void> | void;
    onOpenConversation?: (id: string) => void;
    onOpenFolder?: (folderId: string | null) => void;
    onDeleted?: (folderId: string | null) => void;
    /** The thread loaded (or moved): the folder it lives in. */
    onResolveFolder?: (folderId: string | null) => void;
    /** An executed action changed data the host page shows. */
    onDataChanged?: () => void;
    generalFolders: FolderCard[];
    leading?: ReactNode;
    trailing?: ReactNode;
    compact?: boolean;
    isMac?: boolean;
}

interface ExecuteResult {
    state: StoredAction["state"];
    message?: string;
    secret?: RevealedSecret | null;
    refresh?: boolean;
}

const AGENCY_STARTERS = ["Où en est l’agence en ce moment ?", "Quels clients méritent mon attention ?", "Combien de RDV ce mois-ci, par client ?", "Comment créer une nouvelle mission ?"];
const CLIENT_STARTERS = ["Fais-moi le point sur ce client", "Combien de RDV ce mois-ci et quels retours ?", "Quels commerciaux n’ont pas encore leurs accès ?", "Que dit la dernière note de suivi ?"];
const GENERAL_STARTERS = ["Résume ce qui a été dit dans ce dossier", "Qu’est-ce qui a changé cette semaine ?", "Prépare une synthèse à partager", "Quelles décisions restent à prendre ?"];

export function Thread({
    conversationId,
    stream,
    draft,
    onStart,
    onOpenConversation,
    onOpenFolder,
    onDeleted,
    onResolveFolder,
    onDataChanged,
    generalFolders,
    leading,
    trailing,
    compact,
    isMac,
}: ThreadProps) {
    const toast = useToast();
    const actions = useThreadActions();
    const { data: session } = useSession();
    const firstName = session?.user?.name?.split(" ")[0] ?? null;

    const { data: thread, error, isLoading, hadCache } = useThread(conversationId);
    const composerRef = useRef<ComposerHandle>(null);

    // Reopened from the cache: bring it up to date in the background.
    const sendingFor = stream.sendingFor;
    useEffect(() => {
        if (conversationId && hadCache && sendingFor !== conversationId) void actions.refreshThread(conversationId);
        // Only on open.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId]);

    const conversation = thread?.conversation ?? null;
    const messages = useMemo<ThreadMessage[]>(() => thread?.messages ?? [], [thread]);
    const canWrite = thread?.canWrite ?? true;
    const folderId = conversation ? conversation.folderId : (draft?.folderId ?? null);
    const folderName = conversation ? (conversation.folder?.name ?? "Vue agence") : (draft?.folderName ?? "Vue agence");
    const folderKind = conversation ? (conversation.folder?.kind ?? "AGENCY") : (draft?.folderKind ?? "AGENCY");

    const resolvedFolder = conversation ? (conversation.folderId ?? null) : undefined;
    useEffect(() => {
        if (resolvedFolder !== undefined) onResolveFolder?.(resolvedFolder);
    }, [resolvedFolder, onResolveFolder]);

    const sending = conversationId !== null && sendingFor === conversationId;
    const busyElsewhere = sendingFor !== null && !sending;
    const interactive = canWrite && !sending && !busyElsewhere;
    const failure = conversationId ? stream.failures[conversationId] : undefined;

    // ---- Attachments ------------------------------------------------------------

    const onRejected = useCallback((name: string, reason: string) => toast.error(`« ${name} » non joint`, reason), [toast]);
    const attachments = useAttachments(canWrite ? folderId : null, onRejected);
    const attachDisabledReason = !folderId
        ? "Les fichiers se joignent dans un dossier, pas en vue agence."
        : !canWrite
          ? "Conversation en lecture seule."
          : null;

    const { getRootProps, isDragActive } = useDropzone({
        onDrop: (files) => attachments.add(files),
        noClick: true,
        noKeyboard: true,
        multiple: true,
        disabled: attachDisabledReason !== null,
    });

    // ---- Sending ----------------------------------------------------------------

    const warnBusy = useCallback(() => toast.warning("Une réponse est déjà en cours", "Attendez la fin de la réponse ou arrêtez-la."), [toast]);

    const sendText = useCallback(
        async (text: string, deep: boolean, editMessageId?: string) => {
            if (!conversationId) return;
            let editId = editMessageId;
            if (editId && isLocalId(editId)) {
                const fresh = await actions.refreshThread(conversationId);
                const last = fresh ? lastOfRole(fresh.messages, "USER") : null;
                editId = last && !isLocalId(last.id) ? last.id : undefined;
                if (!editId) {
                    toast.error("Modification impossible", "La question n’est pas encore enregistrée. Réessayez dans un instant.");
                    return;
                }
            }
            const files = editId ? [] : attachments.ready.map((a) => ({ fileId: a.fileId as string, name: a.name, status: a.status }));
            if (!editId) attachments.clear();
            const outcome = await stream.send({ conversationId, text, deep, attachments: files, editMessageId: editId });
            if (!outcome.ok && outcome.busy) warnBusy();
        },
        [conversationId, actions, attachments, stream, toast, warnBusy],
    );

    const handleSubmit = useCallback(
        ({ text, deep, editMessageId }: ComposerSubmit) => {
            if (busyElsewhere) {
                warnBusy();
                return false;
            }
            if (!conversationId) {
                const files = attachments.ready.map((a) => ({ fileId: a.fileId as string, name: a.name, status: a.status }));
                attachments.clear();
                void onStart?.({ text, deep, attachments: files });
                return;
            }
            void sendText(text, deep, editMessageId);
        },
        [busyElsewhere, conversationId, attachments, onStart, sendText, warnBusy],
    );

    const onFollowUp = useCallback(
        (question: string) => {
            if (conversationId) void sendText(question, false);
        },
        [conversationId, sendText],
    );

    const onRegenerate = useCallback(
        async (messageId: string) => {
            if (!conversationId) return;
            const question = lastOfRole(messages, "USER");
            const outcome = await stream.send({ conversationId, text: question?.content ?? "", deep: false, regenerateMessageId: messageId });
            if (!outcome.ok && outcome.busy) warnBusy();
        },
        [conversationId, messages, stream, warnBusy],
    );

    const requestEditLast = useCallback(() => {
        if (!interactive) return null;
        const last = lastOfRole(messages, "USER");
        return last ? { id: last.id, content: last.content } : null;
    }, [interactive, messages]);

    // ---- Feedback & actions -------------------------------------------------------

    const onFeedback = useCallback(
        (messageId: string, rating: "up" | "down" | null) => {
            if (!conversationId) return;
            actions.sendFeedback(conversationId, messageId, rating).catch((e: unknown) => {
                toast.error("Avis non enregistré", e instanceof Error ? e.message : undefined);
            });
        },
        [conversationId, actions, toast],
    );

    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [secrets, setSecrets] = useState<Record<string, RevealedSecret>>({});

    const setActionState = useCallback(
        (messageId: string, state: StoredAction["state"], outcome?: string) => {
            if (!conversationId) return;
            actions.updateThread(conversationId, (t) => {
                const current = parseAction(t.messages.find((m) => m.id === messageId)?.action);
                return current ? patchMessage(t, messageId, { action: { ...current, state, outcome } }) : t;
            });
        },
        [conversationId, actions],
    );

    const onAction = useCallback(
        async (messageId: string, decision: "confirm" | "cancel") => {
            if (!conversationId) return;
            setBusyAction(messageId);
            try {
                const data = await apiSend<ExecuteResult>(ASSISTANT_API.execute, "POST", { conversationId, messageId, decision });
                setActionState(messageId, data.state, data.message);
                const secret = data.secret;
                if (secret) setSecrets((prev) => ({ ...prev, [messageId]: secret }));
                if (data.refresh) onDataChanged?.();
            } catch (e) {
                const detail = e instanceof Error ? e.message : "Échec de l’action";
                setActionState(messageId, "failed", detail);
                toast.error("L’action a échoué", detail);
            } finally {
                setBusyAction(null);
            }
        },
        [conversationId, setActionState, onDataChanged, toast],
    );

    const onSecretExpire = useCallback((messageId: string) => {
        setSecrets((prev) => {
            const next = { ...prev };
            delete next[messageId];
            return next;
        });
    }, []);

    // ---- Canvas & pins ---------------------------------------------------------------

    const [canvas, setCanvas] = useState<{ visual: StoredVisual; messageId: string | null } | null>(null);
    const [pins, setPins] = useState<Map<string, string>>(() => new Map());
    const [pinBusy, setPinBusy] = useState<string | null>(null);
    const pinnedVisualIds = useMemo(() => new Set(pins.keys()), [pins]);
    const canPin = folderId !== null && !folderId.startsWith("tmp-");

    const onOpenVisual = useCallback((visual: StoredVisual, messageId: string | null) => setCanvas({ visual, messageId }), []);

    const onTogglePin = useCallback(
        async (visual: StoredVisual, messageId: string | null) => {
            if (!folderId || pinBusy) return;
            setPinBusy(visual.id);
            try {
                const existing = pins.get(visual.id);
                if (existing) {
                    await actions.deletePin(folderId, existing);
                    setPins((prev) => {
                        const next = new Map(prev);
                        next.delete(visual.id);
                        return next;
                    });
                    toast.info("Retiré du tableau", folderName);
                } else {
                    const pin = await actions.createPin(folderId, {
                        visual,
                        title: visual.spec.title,
                        conversationId,
                        messageId: messageId && !isLocalId(messageId) ? messageId : null,
                    });
                    setPins((prev) => new Map(prev).set(visual.id, pin.id));
                    toast.success(`Épinglé au tableau de ${folderName}`);
                }
            } catch (e) {
                toast.error("Épinglage impossible", e instanceof Error ? e.message : undefined);
            } finally {
                setPinBusy(null);
            }
        },
        [folderId, pinBusy, pins, actions, toast, folderName, conversationId],
    );

    const liveHandlers: VisualHandlers = useMemo(() => ({ onOpen: (v) => onOpenVisual(v, null) }), [onOpenVisual]);

    // ---- Conversation actions ----------------------------------------------------------

    const patch = useCallback(
        (body: Parameters<typeof actions.patchConversation>[1], success?: string) => {
            if (!conversationId) return Promise.resolve();
            return actions
                .patchConversation(conversationId, body)
                .then(() => {
                    if (success) toast.success(success);
                })
                .catch((e: unknown) => {
                    toast.error("Modification non enregistrée", e instanceof Error ? e.message : undefined);
                });
        },
        [conversationId, actions, toast],
    );

    const [forking, setForking] = useState(false);
    const onFork = useCallback(async () => {
        if (!conversationId) return;
        setForking(true);
        try {
            const card = await actions.forkConversation(conversationId);
            toast.success("Nouvelle conversation créée", "Elle reprend le résumé de celle-ci.");
            onOpenConversation?.(card.id);
        } catch (e) {
            toast.error("Impossible de continuer", e instanceof Error ? e.message : undefined);
        } finally {
            setForking(false);
        }
    }, [conversationId, actions, toast, onOpenConversation]);

    const onDelete = useCallback(async () => {
        if (!conversationId) return;
        try {
            await actions.deleteConversation(conversationId);
            toast.success("Conversation supprimée");
            onDeleted?.(folderId);
        } catch (e) {
            toast.error("Suppression impossible", e instanceof Error ? e.message : undefined);
        }
    }, [conversationId, actions, toast, onDeleted, folderId]);

    // ---- Render ------------------------------------------------------------------------

    const lastUserId = useMemo(() => lastOfRole(messages, "USER")?.id ?? null, [messages]);

    const renderMessage = (m: ThreadMessage, index: number) =>
        m.role === "USER" ? (
            <UserMessage
                key={m.id}
                message={m}
                onEdit={m.id === lastUserId && interactive ? () => composerRef.current?.startEdit(m.id, m.content) : null}
            />
        ) : (
            <AssistantMessage
                key={m.id}
                message={m}
                isLast={index === messages.length - 1}
                interactive={interactive}
                secret={secrets[m.id] ?? null}
                actionBusy={busyAction === m.id}
                pinnedVisualIds={pinnedVisualIds}
                canPin={canPin}
                onFollowUp={onFollowUp}
                onRegenerate={onRegenerate}
                onFeedback={onFeedback}
                onAction={onAction}
                onSecretExpire={onSecretExpire}
                onOpenVisual={onOpenVisual}
                onTogglePin={onTogglePin}
            />
        );

    const starters = folderKind === "CLIENT" ? CLIENT_STARTERS : folderKind === "GENERAL" ? GENERAL_STARTERS : AGENCY_STARTERS;
    const emptyState = (
        <div className={cn("mx-auto w-full max-w-xl text-center", compact ? "mt-6" : "mt-[8vh] md:mt-[12vh]")}>
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-ink shadow-2xs motion-safe:animate-ds-pop">
                <AiMark className="size-6" aria-hidden />
            </span>
            <h2 className={cn("mt-4 font-display font-semibold tracking-tight text-ink motion-safe:animate-ds-enter", compact ? "text-lg" : "text-2xl")}>
                Bonjour{firstName ? ` ${firstName}` : ""}
            </h2>
            <p className="mt-1 text-[15px] text-ink-3 motion-safe:animate-ds-enter [animation-delay:30ms]">
                {folderKind === "AGENCY" ? "Comment puis-je vous aider aujourd’hui ?" : `Que voulez-vous savoir sur ${folderName} ?`}
            </p>
            {canWrite && (
                <div className={cn("mt-6 grid gap-2 text-left", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
                    {starters.map((s, i) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => handleSubmit({ text: s, deep: false })}
                            style={{ animationDelay: `${Math.min(i + 2, 8) * 30}ms` }}
                            className={cn(
                                "group/st relative rounded-panel border border-line bg-surface px-3.5 py-3 pr-9 text-[13.5px] text-ink-2 shadow-2xs motion-safe:animate-ds-enter",
                                "transition-[border-color,background-color,color,box-shadow] duration-200 ease-[var(--ease-snappy)] hover:border-line-strong hover:bg-surface-2 hover:text-ink hover:shadow-card",
                                FOCUS,
                                i > 1 && compact && "hidden",
                            )}
                        >
                            {s}
                            <ArrowRight className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-4 transition-transform duration-200 ease-[var(--ease-snappy)] group-hover/st:translate-x-0.5" aria-hidden />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

    if (conversationId && error && !thread) {
        return (
            <div className="flex h-full min-h-0 w-full flex-col bg-surface">
                <ThreadHeader
                    conversation={null}
                    draftFolder={null}
                    canWrite={false}
                    generalFolders={generalFolders}
                    leading={leading}
                    trailing={trailing}
                    compact={compact}
                    onRename={() => {}}
                    onTogglePin={() => {}}
                    onToggleVisibility={() => {}}
                    onMove={() => {}}
                    onDelete={async () => {}}
                    onFork={() => {}}
                />
                <div className="mx-auto mt-[10vh] w-full max-w-md px-4">
                    <EmptyBlock
                        icon={MessageSquareOff}
                        tone="slate"
                        title="Conversation introuvable"
                        hint="Elle a peut-être été supprimée, ou elle n’est pas partagée avec vous."
                    />
                    {onOpenFolder && (
                        <div className="mt-4 flex justify-center">
                            <button type="button" onClick={() => onOpenFolder(null)} className={SECONDARY_BUTTON}>
                                Retour à la vue agence
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div {...getRootProps({ className: "relative flex h-full min-h-0 w-full overflow-hidden outline-none" })}>
            <section className="flex min-w-0 flex-1 flex-col bg-surface" aria-label={conversation?.title || "Nouvelle conversation"}>
                <ThreadHeader
                    conversation={conversation}
                    draftFolder={draft ? { id: draft.folderId, name: draft.folderName, kind: draft.folderKind } : null}
                    canWrite={canWrite}
                    generalFolders={generalFolders}
                    leading={leading}
                    trailing={trailing}
                    compact={compact}
                    forking={forking}
                    onOpenFolder={onOpenFolder}
                    onRename={(title) => void patch({ title })}
                    onTogglePin={() => void patch({ pinned: !conversation?.pinnedAt }, conversation?.pinnedAt ? "Conversation désépinglée" : "Conversation épinglée")}
                    onToggleVisibility={() =>
                        void patch(
                            { visibility: conversation?.visibility === "SHARED" ? "PRIVATE" : "SHARED" },
                            conversation?.visibility === "SHARED" ? "Conversation rendue privée" : "Partagée avec les managers",
                        )
                    }
                    onMove={(target) =>
                        patch(
                            { folderId: target },
                            `Déplacée vers ${target ? (generalFolders.find((f) => f.id === target)?.name ?? "le dossier") : "la vue agence"}`,
                        )
                    }
                    onDelete={onDelete}
                    onFork={() => void onFork()}
                />

                <MessageList
                    conversationId={conversationId}
                    stream={stream}
                    messages={messages}
                    loading={conversationId !== null && isLoading && !thread}
                    olderCursor={thread?.olderCursor ?? null}
                    onLoadOlder={() => (conversationId && thread?.olderCursor ? actions.loadOlder(conversationId, thread.olderCursor) : Promise.resolve())}
                    renderMessage={renderMessage}
                    liveHandlers={liveHandlers}
                    empty={emptyState}
                    compact={compact}
                    footer={
                        failure ? (
                            <ErrorTurn
                                text={failure.options.regenerateMessageId ? "" : failure.options.text}
                                message={failure.message}
                                disabled={sendingFor !== null}
                                onRetry={() => {
                                    void stream.send(failure.options).then((outcome) => {
                                        if (!outcome.ok && outcome.busy) warnBusy();
                                    });
                                }}
                                onDismiss={() => stream.clearFailure(failure.conversationId)}
                            />
                        ) : null
                    }
                />

                {canWrite && (
                    <Composer
                        handleRef={composerRef}
                        sending={sending}
                        blockedReason={busyElsewhere ? "Une réponse est en cours d’écriture dans une autre conversation." : null}
                        onSubmit={handleSubmit}
                        onStop={stream.stop}
                        onRequestEditLast={requestEditLast}
                        attachments={attachments}
                        attachDisabledReason={attachDisabledReason}
                        placeholder={folderKind === "AGENCY" ? "Demandez à Captain AI…" : `Demandez à Captain AI sur ${folderName}…`}
                        compact={compact}
                        autoFocus={!compact}
                        isMac={isMac}
                    />
                )}
            </section>

            {canvas && (
                <Canvas
                    visual={canvas.visual}
                    pinned={pinnedVisualIds.has(canvas.visual.id)}
                    pinBusy={pinBusy === canvas.visual.id}
                    onTogglePin={canPin ? (v) => void onTogglePin(v, canvas.messageId) : undefined}
                    onClose={() => setCanvas(null)}
                    overlay={compact}
                />
            )}

            {isDragActive && (
                <div className="pointer-events-none absolute inset-2 z-[75] flex items-center justify-center rounded-card border-2 border-dashed border-primary-300 bg-surface/85 backdrop-blur-[2px] motion-safe:animate-ds-pop">
                    <div className="flex flex-col items-center gap-2 text-center">
                        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
                            <Upload className="size-6" aria-hidden />
                        </span>
                        <p className="text-sm font-semibold text-ink">Déposez vos fichiers pour les joindre</p>
                        <p className="text-xs text-ink-3">Ils seront ajoutés au dossier {folderName}.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
