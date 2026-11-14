"use client";

// ============================================
// SDR ASSISTANT — entry point in the SDR layout.
//
// Registers « Assistant » in the floating dock (the SDR area's home for
// floating tools, next to « Une idée / Besoin ») and mounts the panel only
// while it is open. The panel's code — markdown renderer, store, parts — is a
// separate chunk fetched on the first open, so the CRM's first render pays
// for this file only. The conversation lives in the store module and
// survives closing and reopening.
// ============================================

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";
import { useDockItem } from "@/components/layout/FloatingDock";
import { useBrand } from "@/lib/brand/client";

const SdrAssistantPanel = dynamic(() => import("./SdrAssistantPanel"), {
    ssr: false,
    loading: () => (
        <div
            role="status"
            aria-label="Chargement de l'assistant"
            className="fixed inset-x-2 bottom-[calc(0.5rem+var(--softphone-dock-h,0px))] z-[92] h-[min(560px,calc(100dvh-1rem))] rounded-panel border border-line bg-surface shadow-overlay sm:inset-x-auto sm:bottom-[calc(5.5rem+var(--softphone-dock-h,0px))] sm:left-[calc(var(--cp-sidebar-w,0px)+1rem)] sm:h-[560px] sm:w-[380px]"
        />
    ),
});

export function SdrAssistantLauncher() {
    const brand = useBrand();
    const [open, setOpen] = useState(false);
    const opener = useRef<HTMLElement | null>(null);

    const close = useCallback(() => {
        setOpen(false);
        // Back to the control that opened it. The dock re-renders around the
        // unmount, so look the button up again and retry once if focus fell to <body>.
        const el = opener.current;
        const restore = () => {
            const target =
                el && el.isConnected && el.offsetParent !== null
                    ? el
                    : Array.from(document.querySelectorAll<HTMLElement>("button[aria-label]")).find(
                          (b) => b.getAttribute("aria-label") === brand.assistantName && b.offsetParent !== null,
                      );
            target?.focus();
            return !!target && document.activeElement === target;
        };
        requestAnimationFrame(() => {
            if (!restore()) window.setTimeout(restore, 120);
        });
    }, [brand.assistantName]);

    useDockItem("sdr-assistant", {
        label: brand.assistantName,
        icon: Sparkles,
        active: open,
        order: 80,
        onClick: () => {
            if (open) {
                close();
                return;
            }
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            setOpen(true);
        },
    });

    return open ? <SdrAssistantPanel onClose={close} /> : null;
}
