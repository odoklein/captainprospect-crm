/** Values the browser needs that differ per instance. Public by design: never put a secret here. */
export type PublicRuntimeConfig = {
    /** Public app URL, no trailing slash. */
    appUrl: string;
    socket: { url: string; path: string };
    openreplay: { enabled: boolean; projectKey: string | null; ingestPoint: string };
    features: { qonto: boolean; pappers: boolean };
};

/** Global the root layout sets before hydration (components/runtime/RuntimeConfigScript). */
export const RUNTIME_CONFIG_GLOBAL = "__CP_RUNTIME_CONFIG__";

export const DEFAULT_SOCKET_URL = "http://173.212.231.174:4000";
export const DEFAULT_SOCKET_PATH = "/socket.io";
export const DEFAULT_OPENREPLAY_INGEST = "https://openreplay.suzaliconseil.com/ingest"; // brand-check-ignore
