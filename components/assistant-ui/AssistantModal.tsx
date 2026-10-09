"use client";

import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";
import { AssistantThread } from "./Thread";
import type { ClientOption } from "./types";

interface AssistantModalProps {
    fixedClientId?: string;
    fixedMissionId?: string;
    onDataChanged?: () => void;
}

export function AssistantModal({
    fixedClientId,
    fixedMissionId,
    onDataChanged,
}: AssistantModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [clients, setClients] = useState<ClientOption[]>([]);
    const [clientId, setClientId] = useState(fixedClientId ?? "");
    const [missionId, setMissionId] = useState(fixedMissionId ?? "");

    // Load available clients for scope picker
    useEffect(() => {
        if (!isOpen) return;
        fetch("/api/manager/assistant/conversations")
            .then((res) => (res.ok ? res.json() : null))
            .then((payload) => {
                if (!payload) return;
                const data = payload.data ?? payload;
                if (data.clients) setClients(data.clients);
            })
            .catch(() => {});
    }, [isOpen]);

    // Handle escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsOpen(false);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen]);

    return (
        <>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-[76] bg-slate-900/20 backdrop-blur-xs transition-opacity animate-in fade-in-50"
                        onClick={() => setIsOpen(false)}
                        aria-hidden="true"
                    />

                    {/* Modal Window */}
                    <div
                        className="fixed bottom-24 right-5 z-[77] w-[min(480px,calc(100vw-32px))] h-[min(680px,calc(100vh-120px))] shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150"
                        role="dialog"
                        aria-label="Assistant IA Captain Prospect"
                    >
                        <AssistantThread
                            clientId={clientId}
                            missionId={missionId}
                            clients={clients}
                            onScopeChange={(c, m) => {
                                setClientId(c);
                                setMissionId(m);
                            }}
                            fixedClientId={fixedClientId}
                            fixedMissionId={fixedMissionId}
                            onDataChanged={onDataChanged}
                            compact={true}
                        />
                    </div>
                </>
            )}

            {/* Floating Trigger Button */}
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-label={isOpen ? "Fermer l'assistant IA" : "Ouvrir l'assistant IA"}
                aria-expanded={isOpen}
                title="Assistant IA (gpt-4o-mini)"
                className="fixed bottom-6 right-5 z-[78] group flex h-13 w-13 items-center justify-center rounded-2xl text-white shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2"
                style={{
                    backgroundColor: isOpen ? "#A63A73" : "#C64B8B",
                    boxShadow: "0 8px 24px -4px rgba(198, 75, 139, 0.45), 0 2px 6px -1px rgba(0, 0, 0, 0.1)",
                }}
            >
                {isOpen ? (
                    <X className="h-5 w-5 transition-transform duration-150" />
                ) : (
                    <div className="relative">
                        <AiMark className="h-5 w-5" />
                        <span className="absolute -top-1 -right-1 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                        </span>
                    </div>
                )}
            </button>
        </>
    );
}
