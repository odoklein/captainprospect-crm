// ============================================
// RUNTIME CONFIG (client) — per-instance public values in the browser.
//
//   getRuntimeConfig()   any client module (socket, tracker)
//   useRuntimeConfig()   client components
//
// The root layout sets window.__CP_RUNTIME_CONFIG__ in <head>, before any
// client script runs, so the value is there on first read and never changes.
// Without it (tests, a page outside the root layout) the defaults apply.
// ============================================

import {
    DEFAULT_OPENREPLAY_INGEST,
    DEFAULT_SOCKET_PATH,
    DEFAULT_SOCKET_URL,
    RUNTIME_CONFIG_GLOBAL,
    type PublicRuntimeConfig,
} from "./types";
import { brandConfig } from "@/brand/brand.config";

const FALLBACK: PublicRuntimeConfig = {
    appUrl: brandConfig.web.appUrl,
    socket: { url: DEFAULT_SOCKET_URL, path: DEFAULT_SOCKET_PATH },
    openreplay: { enabled: true, projectKey: null, ingestPoint: DEFAULT_OPENREPLAY_INGEST },
    features: { qonto: false, pappers: false },
};

export function getRuntimeConfig(): PublicRuntimeConfig {
    if (typeof window === "undefined") return FALLBACK;
    const injected = (window as unknown as Record<string, unknown>)[RUNTIME_CONFIG_GLOBAL] as
        | PublicRuntimeConfig
        | undefined;
    return injected ?? FALLBACK;
}

/** Same value as getRuntimeConfig(); a hook so components read it at render time. */
export function useRuntimeConfig(): PublicRuntimeConfig {
    return getRuntimeConfig();
}
