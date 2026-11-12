// ============================================
// RUNTIME CONFIG (server) — the public, per-instance values the browser needs,
// read from the container env at request time. The root layout injects them
// (components/runtime/RuntimeConfigScript); /api/public-config serves the same.
//
// Each value accepts a plain name (SOCKET_URL) or the legacy NEXT_PUBLIC_ name,
// both read at runtime (lib/runtime-config/env.ts).
// ============================================

import { brandConfig } from "@/brand/brand.config";
import { runtimeAppUrl, runtimeEnv } from "./env";
import {
    DEFAULT_OPENREPLAY_INGEST,
    DEFAULT_SOCKET_PATH,
    DEFAULT_SOCKET_URL,
    type PublicRuntimeConfig,
} from "./types";

function flag(...names: string[]): boolean {
    return runtimeEnv(...names) === "true";
}

export function getPublicRuntimeConfig(appUrl?: string): PublicRuntimeConfig {
    return {
        appUrl: (appUrl || runtimeAppUrl() || brandConfig.web.appUrl).replace(/\/+$/, ""),
        socket: {
            url: runtimeEnv("SOCKET_URL", "NEXT_PUBLIC_SOCKET_URL") ?? DEFAULT_SOCKET_URL,
            path: runtimeEnv("SOCKET_PATH", "NEXT_PUBLIC_SOCKET_PATH") ?? DEFAULT_SOCKET_PATH,
        },
        openreplay: {
            enabled: runtimeEnv("OPENREPLAY_ENABLED", "NEXT_PUBLIC_OPENREPLAY_ENABLED") !== "false",
            projectKey: runtimeEnv("OPENREPLAY_PROJECT_KEY", "NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY") ?? null,
            ingestPoint: runtimeEnv("OPENREPLAY_INGEST_POINT", "NEXT_PUBLIC_OPENREPLAY_INGEST_POINT") ?? DEFAULT_OPENREPLAY_INGEST,
        },
        features: {
            qonto: flag("QONTO_ENABLED", "NEXT_PUBLIC_QONTO_ENABLED"),
            pappers: flag("PAPPERS_ENABLED", "NEXT_PUBLIC_PAPPERS_ENABLED"),
        },
    };
}
