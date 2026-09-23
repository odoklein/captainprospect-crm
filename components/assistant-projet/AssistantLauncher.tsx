"use client";

/**
 * The floating assistant button, mounted once in the manager layout.
 *
 * It opens the same panel as /manager/assistant with no project bound, so it
 * lands in "vue agence": agency questions answer immediately, and picking a
 * client in the panel switches to that project's own conversation.
 *
 * Replaces the previous AssistantLauncher, which was exported but never
 * rendered by any page.
 *
 * Stacking: z-76..78 keeps it above page content but under Drawer (z-80) and
 * Modal (z-120). Sitting above drawers, the bottom-right button covered their
 * composers — e.g. the ticket comment "Envoyer" button.
 */

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import AssistantProjetPanel from "./AssistantProjetPanel";

export default function AssistantLauncher() {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setIsOpen(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [isOpen]);

    return (
        <>
            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-[76] bg-slate-900/15"
                        onClick={() => setIsOpen(false)}
                        aria-hidden="true"
                    />
                    <div
                        className="fixed bottom-24 right-5 z-[77] w-[min(440px,calc(100vw-40px))] h-[min(660px,calc(100vh-140px))] shadow-2xl"
                        role="dialog"
                        aria-label="Assistant"
                    >
                        <AssistantProjetPanel />
                    </div>
                </>
            )}

            <button
                type="button"
                onClick={() => setIsOpen((v) => !v)}
                aria-label={isOpen ? "Fermer l'assistant" : "Ouvrir l'assistant"}
                aria-expanded={isOpen}
                title="Assistant"
                className="fixed bottom-6 right-5 z-[78] grid h-12 w-12 place-items-center rounded-2xl text-white shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C64B8B]"
                style={{
                    background: isOpen
                        ? "#A63A73"
                        : "linear-gradient(135deg, #C64B8B 0%, #D96FA5 100%)",
                    boxShadow: "0 10px 28px -8px rgba(198,75,139,.55), 0 2px 8px rgba(27,38,71,.12)",
                }}
            >
                {isOpen ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </button>
        </>
    );
}
