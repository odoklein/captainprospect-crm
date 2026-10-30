// ============================================
// RUNTIME ENV — read an env var at request time, never at build time.
//
// Next inlines every `process.env.NEXT_PUBLIC_X` it can see at build into
// BOTH the client and the server bundles. One image serves many instances, so
// a literal `process.env.NEXT_PUBLIC_APP_URL` freezes the build machine's
// value everywhere. A computed key is not inlined: runtimeEnv("NEXT_PUBLIC_APP_URL")
// reads the container's value. On the client it returns undefined (use
// useRuntimeConfig / getRuntimeConfig instead).
// ============================================

export function runtimeEnv(...names: string[]): string | undefined {
    if (typeof process === "undefined" || !process.env) return undefined;
    const env = process.env as Record<string, string | undefined>;
    for (const name of names) {
        const v = env[name];
        if (v != null && v.trim() !== "") return v.trim();
    }
    return undefined;
}

/** Public app URL from the container env (APP_URL → NEXT_PUBLIC_APP_URL → NEXTAUTH_URL), no trailing slash. */
export function runtimeAppUrl(): string | undefined {
    return runtimeEnv("APP_URL", "NEXT_PUBLIC_APP_URL", "NEXTAUTH_URL")?.replace(/\/+$/, "");
}
