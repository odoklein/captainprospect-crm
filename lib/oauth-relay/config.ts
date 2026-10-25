// ============================================
// OAUTH RELAY (instance side, signing) — see ./redirect for the env contract.
// Server only (node:crypto).
// ============================================

import { getRelayConfig } from "./redirect";
import { wrapRelayState, type RelayProvider } from "./state";

export { getRelayConfig, relayRedirectUri, type RelayConfig } from "./redirect";

/** The state to send to the provider: wrapped for the relay when it is on, untouched otherwise. */
export function stateForProvider(provider: RelayProvider, innerState: string): string {
    const cfg = getRelayConfig();
    if (!cfg) return innerState;
    return wrapRelayState({ instanceId: cfg.instanceId, provider, inner: innerState, adminSecret: cfg.adminSecret });
}
