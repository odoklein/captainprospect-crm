"use client";

// ============================================
// SDR ASSISTANT — the panel (loaded on first open, see SdrAssistantLauncher).
//
// Docked above the floating dock on desktop (non-modal: the CRM stays usable,
// record links open beside it); a bottom sheet with a backdrop and a focus
// trap on phones (modal). Escape closes and gives focus back to the control
// that opened it.
//
// Measured reference: 380 × 560 CSS px, 44.5 px header, 12/8 px body padding,
// 47 px composer — see docs/sdr-assistant-panel.md.
// ============================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AlertTriangle, History as HistoryIcon, Maximize2, Minimize2, SquarePen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/shadcn/button";
import { useBrand } from "@/lib/brand/client";
import { Composer, History, Thread, Welcome } from "./parts";
import { dismissFailure, loadConversations, newConversation, retry, setView, toggleExpanded, useAssistant } from "./store";

const SMALL = "(max-width: 639px)";

function useIsSmall() {
    const [small, setSmall] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia(SMALL);
        const update = () => setSmall(mq.matches);
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, []);
    return small;
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function SdrAssistantPanel({ onClose }: { onClose: () => void }) {
    const brand = useBrand();
    const router = useRouter();
    const { data: session } = useSession();
    const small = useIsSmall();
    const panel = useRef<HTMLElement>(null);
    const textarea = useRef<HTMLTextAreaElement>(null);

    const mode = useAssistant((s) => s.mode);
    const listStatus = useAssistant((s) => s.listStatus);
    const listError = useAssistant((s) => s.listError);
    const unavailableReason = useAssistant((s) => s.unavailableReason);
    const activeId = useAssistant((s) => s.activeId);
    const view = useAssistant((s) => s.view);
    const expanded = useAssistant((s) => s.expanded);
    const streaming = useAssistant((s) => !!s.live);
    const orphanFailure = useAssistant((s) => (s.failure && !s.failure.conversationId ? s.failure : null));

    useEffect(() => {
        void loadConversations();
    }, []);

    // Focus goes to the composer when the panel opens (or the panel itself if it is disabled).
    useEffect(() => {
        const id = requestAnimationFrame(() => {
            if (textarea.current && !textarea.current.disabled) textarea.current.focus();
            else panel.current?.focus();
        });
        return () => cancelAnimationFrame(id);
    }, []);

    // Escape closes; on phones Tab stays inside the sheet.
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
            e.stopPropagation();
            onClose();
            return;
        }
        if (e.key !== "Tab" || !small || !panel.current) return;
        const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    const navigate = (href: string) => {
        router.push(href);
        if (small) onClose();
    };

    const firstName = session?.user?.name?.trim().split(/\s+/)[0] ?? null;
    const disabledReason =
        mode === "unavailable" ? unavailableReason ?? "Assistant indisponible." : listStatus === "error" ? listError ?? "Assistant injoignable." : null;

    const notice =
        mode === "unavailable" ? (
            <div className="mx-2 rounded-panel border border-warning-line bg-warning-soft px-3 py-2.5 text-[12.5px] leading-[1.5] text-warning-ink" role="note">
                {unavailableReason}
            </div>
        ) : listStatus === "error" ? (
            <div className="mx-2 flex items-start gap-2 rounded-panel border border-danger-line bg-danger-soft/60 px-3 py-2.5 text-[12.5px] text-danger-ink" role="alert">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <p className="min-w-0 flex-1">{listError}</p>
                <Button type="button" size="xs" variant="outline" onClick={() => void loadConversations(true)}>
                    Réessayer
                </Button>
            </div>
        ) : orphanFailure ? (
            <div className="mx-2 flex items-start gap-2 rounded-panel border border-danger-line bg-danger-soft/60 px-3 py-2.5 text-[12.5px] text-danger-ink" role="alert">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <p className="min-w-0 flex-1">{orphanFailure.message}</p>
                <div className="flex shrink-0 gap-1">
                    <Button type="button" size="xs" variant="ghost" onClick={dismissFailure}>
                        Ignorer
                    </Button>
                    <Button type="button" size="xs" variant="outline" onClick={retry}>
                        Réessayer
                    </Button>
                </div>
            </div>
        ) : null;

    return (
        <>
            {small && <div className="fixed inset-0 z-[91] bg-ink/30 motion-safe:animate-in motion-safe:fade-in-0" aria-hidden onClick={onClose} />}
            <section
                ref={panel}
                role="dialog"
                aria-modal={small ? true : undefined}
                aria-label={brand.assistantName}
                tabIndex={-1}
                onKeyDown={onKeyDown}
                className={cn(
                    "sdr-assistant-panel fixed z-[92] flex flex-col overflow-hidden border border-line bg-surface text-ink shadow-overlay focus:outline-none",
                    "motion-safe:animate-ds-enter",
                    // Phones: bottom sheet, edge to edge with an 8 px gutter.
                    "inset-x-2 bottom-[calc(0.5rem+var(--softphone-dock-h,0px))] h-[min(560px,calc(100dvh-1rem-var(--softphone-dock-h,0px)))] rounded-panel",
                    // Desktop: docked above the floating dock, measured 380 × 560 (or the larger reading size).
                    "sm:inset-x-auto sm:left-[calc(var(--cp-sidebar-w,0px)+1rem)] sm:bottom-[calc(5.5rem+var(--softphone-dock-h,0px))]",
                    "sm:max-h-[calc(100dvh-6.5rem-var(--softphone-dock-h,0px))]",
                    expanded ? "sm:h-[760px] sm:w-[min(520px,calc(100vw-var(--cp-sidebar-w,0px)-2rem))]" : "sm:h-[560px] sm:w-[380px]",
                )}
            >
                <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line-subtle px-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-1">
                        <h2 className="truncate text-[13px] font-semibold leading-[1.2] text-ink">
                            {view === "history" ? "Historique" : brand.assistantName}
                        </h2>
                        {mode === "demo" && (
                            <span
                                className="shrink-0 rounded-chip border border-warning-line bg-warning-soft px-1.5 py-px text-[10.5px] font-semibold text-warning-ink"
                                title="Démo de développement : modèle simulé (SDR_ASSISTANT_DEMO=1), données réelles du CRM."
                            >
                                Démo
                            </span>
                        )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Historique des conversations"
                            aria-pressed={view === "history"}
                            title="Historique"
                            onClick={() => {
                                if (view === "history") setView("chat");
                                else {
                                    setView("history");
                                    void loadConversations(true);
                                }
                            }}
                            className={cn(view === "history" && "bg-surface-3 text-ink")}
                        >
                            <HistoryIcon aria-hidden />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Nouvelle conversation"
                            title={streaming ? "Attendez la fin de la réponse" : "Nouvelle conversation"}
                            disabled={streaming || (activeId === null && view === "chat")}
                            onClick={() => {
                                newConversation();
                                requestAnimationFrame(() => textarea.current?.focus());
                            }}
                        >
                            <SquarePen aria-hidden />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="max-sm:hidden"
                            aria-label={expanded ? "Réduire le panneau" : "Agrandir le panneau"}
                            title={expanded ? "Réduire" : "Agrandir"}
                            onClick={toggleExpanded}
                        >
                            {expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
                        </Button>
                        <Button type="button" variant="ghost" size="icon-xs" aria-label="Fermer l'assistant" title="Fermer (Échap)" onClick={onClose} className="text-ink-4">
                            <X aria-hidden />
                        </Button>
                    </div>
                </header>

                {view === "history" ? (
                    <History />
                ) : activeId ? (
                    <Thread conversationId={activeId} onNavigate={navigate} />
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
                        <Welcome firstName={firstName} disabled={!!disabledReason || streaming} notice={notice} />
                    </div>
                )}

                {view === "chat" && <Composer textareaRef={textarea} disabledReason={disabledReason} />}
            </section>
        </>
    );
}
