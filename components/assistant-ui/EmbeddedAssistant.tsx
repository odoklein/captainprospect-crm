"use client";

/**
 * Captain AI embedded in another page (Dashboard projet drawer, Accès):
 * a compact thread bound to one client. It ensures the client's folder,
 * reopens the viewer's latest conversation there (the mission's, when one is
 * fixed) or starts a draft, and links to the full workspace.
 *
 * Same props as the old AssistantProjetPanel, so host pages only swap the import.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, SquarePen } from "lucide-react";
import { ASSISTANT_API, type ConversationsResponse, type FolderCard } from "@/lib/assistant/api-contract";
import { apiGet, withQuery } from "@/lib/assistant/client/fetcher";
import { useThreadActions } from "@/lib/assistant/client/thread-hooks";
import { cn } from "@/lib/utils";
import { EmptyBlock, FOCUS, SECONDARY_BUTTON, Shimmer } from "@/components/accueil/AccueilUI";
import { useToast } from "@/components/ui/Toast";
import { Thread, type StartRequest } from "./workspace/thread/Thread";
import { useChatStream } from "./workspace/useChatStream";
import { useIsMac } from "./workspace/Composer";

export interface EmbeddedAssistantProps {
    /** The client the assistant is bound to. */
    fixedClientId?: string;
    /** Narrows to one mission: its latest conversation is reopened, new ones are tied to it. */
    fixedMissionId?: string;
    className?: string;
    /** Called after an executed action changed data, so the host page can refetch. */
    onDataChanged?: () => void;
}

export default function EmbeddedAssistant(props: EmbeddedAssistantProps) {
    return <EmbeddedInner key={`${props.fixedClientId ?? ""}:${props.fixedMissionId ?? ""}`} {...props} />;
}

export { EmbeddedAssistant };

type Boot = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; folder: FolderCard | null; conversationId: string | null };

function EmbeddedInner({ fixedClientId, fixedMissionId, className, onDataChanged }: EmbeddedAssistantProps) {
    const toast = useToast();
    const actions = useThreadActions();
    const stream = useChatStream();
    const isMac = useIsMac();
    const [boot, setBoot] = useState<Boot>({ status: "loading" });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            if (!fixedClientId) return { folder: null, conversationId: null };
            const folder = await actions.ensureClientFolder(fixedClientId);
            const page = await apiGet<ConversationsResponse>(withQuery(ASSISTANT_API.conversations, { folderId: folder.id, limit: 20 }));
            const mine = page.items.filter((c) => c.isOwner && c.kind === "CHAT");
            const latest = (fixedMissionId ? mine.find((c) => c.missionId === fixedMissionId) : mine[0]) ?? null;
            return { folder, conversationId: latest?.id ?? null };
        };
        run()
            .then((result) => {
                if (!cancelled) setBoot({ status: "ready", ...result });
            })
            .catch((e: unknown) => {
                if (!cancelled) setBoot({ status: "error", message: e instanceof Error ? e.message : "Captain AI est indisponible." });
            });
        return () => {
            cancelled = true;
        };
    }, [fixedClientId, fixedMissionId, actions, attempt]);

    const folder = boot.status === "ready" ? boot.folder : null;
    const conversationId = boot.status === "ready" ? boot.conversationId : null;

    const setConversation = useCallback((id: string | null) => {
        setBoot((prev) => (prev.status === "ready" ? { ...prev, conversationId: id } : prev));
    }, []);

    const onStart = useCallback(
        async (request: StartRequest) => {
            if (stream.sendingFor) return;
            try {
                const card = await actions.createConversation({
                    folderId: folder?.id ?? null,
                    clientId: folder ? null : (fixedClientId ?? null),
                    missionId: fixedMissionId ?? null,
                });
                // Send before mounting the thread, so its open-time refresh cannot race the question.
                void stream.send({ conversationId: card.id, text: request.text, deep: request.deep, attachments: request.attachments });
                setConversation(card.id);
            } catch (e) {
                toast.error("Conversation non créée", e instanceof Error ? e.message : undefined);
            }
        },
        [stream, actions, folder, fixedClientId, fixedMissionId, setConversation, toast],
    );

    const workspaceHref = withQuery("/manager/assistant", { folder: folder?.id ?? "agency", c: conversationId });

    const trailing = (
        <>
            {conversationId && (
                <button
                    type="button"
                    onClick={() => setConversation(null)}
                    aria-label="Nouvelle conversation"
                    title="Nouvelle conversation"
                    className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink", FOCUS)}
                >
                    <SquarePen className="size-4" aria-hidden />
                </button>
            )}
            <Link
                href={workspaceHref}
                className={cn("inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink", FOCUS)}
                title="Ouvrir dans Captain AI"
            >
                <span className="max-sm:sr-only">Ouvrir</span>
                <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
        </>
    );

    return (
        <div className={cn("relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card", className)}>
            {boot.status === "loading" ? (
                <div className="flex h-full flex-col" aria-busy="true">
                    <div className="flex h-11 items-center gap-2 border-b border-line-subtle px-3">
                        <Shimmer className="h-4 w-40 rounded-full" />
                    </div>
                    <div className="flex-1 space-y-3 p-4">
                        <Shimmer className="ml-auto h-9 w-1/2 rounded-[18px]" />
                        <Shimmer className="h-3.5 w-[85%] rounded-full" />
                        <Shimmer className="h-3.5 w-[70%] rounded-full" />
                    </div>
                    <div className="p-3">
                        <Shimmer className="h-[92px] w-full rounded-[22px]" />
                    </div>
                </div>
            ) : boot.status === "error" ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
                    <EmptyBlock icon={Building2} tone="slate" title="Captain AI n’a pas pu s’ouvrir" hint={boot.message} compact />
                    <button
                        type="button"
                        onClick={() => {
                            setBoot({ status: "loading" });
                            setAttempt((n) => n + 1);
                        }}
                        className={SECONDARY_BUTTON}
                    >
                        Réessayer
                    </button>
                </div>
            ) : (
                <Thread
                    key={conversationId ?? "draft"}
                    conversationId={conversationId}
                    stream={stream}
                    draft={{
                        folderId: folder?.id ?? null,
                        folderName: folder?.name ?? "Vue agence",
                        folderKind: folder ? "CLIENT" : "AGENCY",
                        clientId: fixedClientId ?? null,
                        missionId: fixedMissionId ?? null,
                    }}
                    onStart={onStart}
                    onOpenConversation={setConversation}
                    onDeleted={() => setConversation(null)}
                    onDataChanged={onDataChanged}
                    generalFolders={[]}
                    trailing={trailing}
                    compact
                    isMac={isMac}
                />
            )}
        </div>
    );
}
