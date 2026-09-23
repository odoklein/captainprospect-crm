"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { SUP_LIGHT } from "./supportStyles";
import { resolvePageLabel } from "@/lib/support/constants";
import { useSupportConversation } from "./hooks/useSupportConversation";
import { useSupportComposer } from "./hooks/useSupportComposer";
import { useSupportScroll } from "./hooks/useSupportScroll";
import { useSupportPresence } from "./hooks/useSupportPresence";
import { SupportHeader } from "./SupportHeader";
import { SupportMessageList } from "./SupportMessageList";
import { SupportComposer } from "./SupportComposer";
import { SupportResolvedBanner } from "./SupportResolvedBanner";
import type { SupportConversationDetailDTO, SupportIntent } from "@/lib/support/types";

const T = SUP_LIGHT;

export interface ClientSupportPanelProps {
    conversation: SupportConversationDetailDTO;
    onClose: () => void;
    onConversationUpdate: (next: SupportConversationDetailDTO) => void;
    onManagerTypingChange?: (typing: boolean) => void;
    onBackToList?: () => void;
    onNewRequest?: () => void;
}

export function ClientSupportPanel({
    conversation: initialConversation,
    onClose,
    onConversationUpdate,
    onBackToList,
    onNewRequest,
}: ClientSupportPanelProps) {
    const pathname = usePathname();
    const pageLabel = useMemo(() => resolvePageLabel(pathname), [pathname]);

    // 1. Conversation state & optimistic updates hook
    const {
        conversation,
        emailNotif,
        isReopening,
        appendOptimisticMessage,
        reconcileMessage,
        rollbackMessage,
        reopen,
        toggleEmailNotif,
    } = useSupportConversation({
        initialConversation,
        onUpdate: onConversationUpdate,
    });

    // 2. Presence hook
    const presence = useSupportPresence();

    // 3. Composer hook
    const composer = useSupportComposer({
        conversationId: conversation.id,
        pathname,
        pageLabel,
        onAppendOptimistic: appendOptimisticMessage,
        onReconcile: reconcileMessage,
        onRollback: rollbackMessage,
    });

    // 4. Scroll hook
    const scroll = useSupportScroll(conversation.messages.length);

    // Intent selector shown on first client visit
    const [showIntentSelector, setShowIntentSelector] = useState(
        conversation.messageCount === 0 ||
            conversation.messages.every((m) => m.role !== "CLIENT"),
    );

    const isResolved = conversation.status === "RESOLVED";

    const handleSelectIntentFromList = (intent: SupportIntent) => {
        composer.setSelectedIntent(intent);
        setShowIntentSelector(false);
        composer.textareaRef.current?.focus();
    };

    return (
        <div
            className="cp-support-root cp-support-panel-responsive"
            role="dialog"
            aria-modal="true"
            aria-label="Assistance et Support"
            style={{
                position: "fixed",
                bottom: 96,
                right: 24,
                zIndex: 99,
                width: 420,
                maxWidth: "calc(100vw - 32px)",
                height: 640,
                maxHeight: "calc(100vh - 128px)",
                borderRadius: T.radiusXL,
                overflow: "hidden",
                background: T.paper,
                border: `1px solid ${T.line}`,
                boxShadow: T.shadowPanel,
                display: "flex",
                flexDirection: "column",
                animation: "cpSupPanelIn 0.35s cubic-bezier(.34,1.4,.64,1) both",
            }}
        >
            <SupportHeader
                subject={conversation.subject}
                isResolved={isResolved}
                statusText={presence.statusText}
                onClose={onClose}
                onBackToList={onBackToList}
                onNewRequest={onNewRequest}
            />

            <SupportMessageList
                messages={conversation.messages}
                isResolved={isResolved}
                pageLabel={pageLabel}
                showContextBanner={!composer.contextBannerDismissed}
                onDismissContextBanner={composer.dismissContextBanner}
                onAddContextTag={composer.handleAddContextTag}
                showIntentSelector={showIntentSelector}
                onSelectIntent={handleSelectIntentFromList}
                scrollRef={scroll.scrollRef}
                messagesEndRef={scroll.messagesEndRef}
                onScroll={scroll.handleScroll}
                unreadIncomingCount={scroll.unreadIncomingCount}
                scrollToBottom={scroll.scrollToBottom}
                isTyping={presence.isTyping}
                typingAgentName={presence.typingAgentName}
            />

            {isResolved ? (
                <SupportResolvedBanner
                    onReopen={reopen}
                    isReopening={isReopening}
                    onNewRequest={onNewRequest}
                />
            ) : (
                <SupportComposer
                    inputValue={composer.inputValue}
                    onInputChange={composer.setInputValue}
                    selectedIntent={composer.selectedIntent}
                    onRemoveIntent={() => composer.setSelectedIntent(null)}
                    attachedRdvRefs={composer.attachedRdvRefs}
                    onAddRdvRef={composer.handleAddRdvRef}
                    onRemoveRdvRef={composer.handleRemoveRdvRef}
                    quickRepliesOpen={composer.quickRepliesOpen}
                    onToggleQuickReplies={() => composer.setQuickRepliesOpen((v) => !v)}
                    onCloseQuickReplies={() => composer.setQuickRepliesOpen(false)}
                    onSelectQuickReply={composer.handleSelectQuickReply}
                    attachments={composer.attachments}
                    canSend={composer.canSend}
                    isSending={composer.isSending}
                    onSend={composer.sendMessage}
                    onKeyDown={composer.handleKeyDown}
                    emailNotif={emailNotif}
                    onToggleEmailNotif={toggleEmailNotif}
                    textareaRef={composer.textareaRef}
                />
            )}
        </div>
    );
}
