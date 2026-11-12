"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function useDialogPortalTarget(open: boolean, workspaceOnly = false) {
    const hydrated = useSyncExternalStore(subscribe, clientReady, serverReady);
    if (!hydrated || !open) return null;
    // Keep workspace typography and palette, outside the scroll and container
    // boundaries that would otherwise clip an overlaid editor.
    return document.querySelector(".manager-client-studio") ?? (workspaceOnly ? null : document.body);
}
