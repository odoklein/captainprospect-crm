"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/ui";

/**
 * Protects unsaved edits: browser close/reload prompts natively, and any
 * in-app link click (hub tabs, sidebar, back link) asks for confirmation first.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
    const router = useRouter();
    const [pendingHref, setPendingHref] = useState<string | null>(null);

    useEffect(() => {
        if (!dirty) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        const onClick = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
            if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
            const url = new URL(anchor.href, window.location.href);
            if (url.origin !== window.location.origin) return;
            if (url.pathname === window.location.pathname && url.search === window.location.search) return;
            e.preventDefault();
            e.stopPropagation();
            setPendingHref(url.pathname + url.search + url.hash);
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        document.addEventListener("click", onClick, true);
        return () => {
            window.removeEventListener("beforeunload", onBeforeUnload);
            document.removeEventListener("click", onClick, true);
        };
    }, [dirty]);

    const confirmNode = (
        <ConfirmModal
            isOpen={!!pendingHref}
            onClose={() => setPendingHref(null)}
            onConfirm={() => {
                const href = pendingHref;
                setPendingHref(null);
                if (href) router.push(href);
            }}
            variant="warning"
            title="Quitter sans enregistrer ?"
            message="Vos modifications sur cette séquence seront perdues."
            confirmText="Quitter sans enregistrer"
            cancelText="Rester sur la page"
        />
    );

    return { confirmNode };
}
