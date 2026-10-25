// ============================================
// OAUTH RELAY (instance side, env only) — no Node import, so the email provider
// config can read it from any bundle. Signing lives in ./config.
//
//   OAUTH_RELAY_URL         https://auth.<platform-domain>   the relay's public base URL
//   INSTANCE_ID             agence-nord                       this instance's id in the relay's registry
//   INSTANCE_ADMIN_SECRET                                     already required by /api/instance/*
//
// All three set: mailbox OAuth goes through the relay (one callback URL
// registered in the Google / Microsoft apps for every agency). Otherwise the
// instance behaves as before: callback on its own domain, or GOOGLE_REDIRECT_URI /
// MICROSOFT_REDIRECT_URI when set explicitly, which always wins.
// ============================================

import { getInstanceIdentity } from "@/lib/instance/identity";
import { runtimeEnv } from "@/lib/runtime-config/env";

export type RelayConfig = { url: string; instanceId: string; adminSecret: string };

export function getRelayConfig(): RelayConfig | null {
    const url = runtimeEnv("OAUTH_RELAY_URL")?.replace(/\/+$/, "");
    const identity = getInstanceIdentity();
    if (!url || !identity) return null;
    return { url, ...identity };
}

/** The redirect_uri registered at the provider when the relay is on, else null. */
export function relayRedirectUri(provider: "gmail" | "outlook"): string | null {
    const cfg = getRelayConfig();
    return cfg ? `${cfg.url}/oauth/${provider}/callback` : null;
}
