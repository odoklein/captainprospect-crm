import { RUNTIME_CONFIG_GLOBAL, type PublicRuntimeConfig } from "@/lib/runtime-config/types";

/**
 * Sets window.__CP_RUNTIME_CONFIG__ before hydration. Rendered in <head> by the
 * root layout; the value is public (no secrets) and escaped against </script>.
 */
export function RuntimeConfigScript({ config }: { config: PublicRuntimeConfig }) {
    const json = JSON.stringify(config).replace(/</g, "\\u003c");
    return <script id="runtime-config" dangerouslySetInnerHTML={{ __html: `window.${RUNTIME_CONFIG_GLOBAL}=${json};` }} />;
}
