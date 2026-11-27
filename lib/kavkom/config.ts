// ============================================
// KAVKOM — configuration (server-only).
//
// Keys (Paramètres → Téléphonie → Lignes et fournisseurs, or container env):
//   KAVKOM_API_TOKEN, KAVKOM_DOMAIN_UUID   click-to-call, hang-up, extensions, recordings
//   KAVKOM_WEBHOOK_SECRET                   gate of /api/webhooks/kavkom
//   KAVKOM_SIP_WSS_URL                      the in-CRM phone: Kavkom's WebRTC address (wss://…). Set → the CRM tab
//                                           registers as the SDR's extension; unset → calls ring the SDR's Kavkom app
//   KAVKOM_SIP_DOMAIN                       SIP domain, when it is not the extension's user_context
// Behaviour switches (container env, read at request time):
//   KAVKOM_AUTO_ANSWER=0        the SDR picks up their Kavkom app before the prospect is dialled
//                               (default: their app answers by itself, one click in the CRM is the call)
//   KAVKOM_DIAL_FORMAT=national national (06…, default) | e164 (+336…) | e164_plain (336…) | intl00 (00336…)
//   KAVKOM_ALLOWED_COUNTRIES    destinations (default: the softphone's, FR,BE,CH,LU,MC)
// A user calls through Kavkom once a manager gives them an extension (fiche utilisateur).
// ============================================

import type { CountryCode } from "libphonenumber-js";
import { integrationKey } from "@/lib/integrations/keys";
import { runtimeEnv } from "@/lib/runtime-config/env";
import { parseAllowedCountries, toE164 } from "@/lib/telephony/phone";
import { KavkomClient } from "./api";
import { parseDialFormat, type DialFormat } from "./webhook";

export interface KavkomConfig {
    token: string;
    domainUuid: string;
    autoAnswer: boolean;
    dialFormat: DialFormat;
    allowedCountries: CountryCode[];
    webhook: boolean;
    /** In-CRM phone (SIP over WebRTC): Kavkom's wss:// address, or null (Kavkom app mode). */
    webphone: { server: string; domain: string | null } | null;
}

/** Only a wss:// address is accepted: the browser refuses anything else from an https page. */
export function parseWssUrl(raw: string | null | undefined): string | null {
    const v = raw?.trim();
    if (!v) return null;
    try {
        const u = new URL(v);
        return u.protocol === "wss:" ? u.toString().replace(/\/$/, "") : null;
    } catch {
        return null;
    }
}

/** Null without the token and the domain: Kavkom click-to-call is off. */
export function getKavkomConfig(): KavkomConfig | null {
    const token = integrationKey("KAVKOM_API_TOKEN")?.trim();
    const domainUuid = integrationKey("KAVKOM_DOMAIN_UUID")?.trim();
    if (!token || !domainUuid) return null;
    const auto = runtimeEnv("KAVKOM_AUTO_ANSWER")?.toLowerCase();
    return {
        token,
        domainUuid,
        autoAnswer: !(auto === "0" || auto === "false" || auto === "off"),
        dialFormat: parseDialFormat(runtimeEnv("KAVKOM_DIAL_FORMAT")),
        allowedCountries: parseAllowedCountries(runtimeEnv("KAVKOM_ALLOWED_COUNTRIES", "TWILIO_ALLOWED_COUNTRIES")),
        webhook: Boolean(integrationKey("KAVKOM_WEBHOOK_SECRET")?.trim()),
        webphone: (() => {
            const server = parseWssUrl(integrationKey("KAVKOM_SIP_WSS_URL"));
            return server ? { server, domain: integrationKey("KAVKOM_SIP_DOMAIN")?.trim() || null } : null;
        })(),
    };
}

/** Calls can land in the CRM (webhook) or be placed from it (API). */
export const isKavkomConfigured = () => Boolean(getKavkomConfig() || integrationKey("KAVKOM_WEBHOOK_SECRET")?.trim());

export function kavkomClient(config: KavkomConfig | null = getKavkomConfig()): KavkomClient | null {
    return config ? new KavkomClient(config.token, config.domainUuid) : null;
}

/** The user's extension, normalised ("1001"), or null. */
export function normalizeExtension(raw: string | null | undefined): string | null {
    const v = raw?.trim();
    return v && /^\d{2,7}$/.test(v) ? v : null;
}

/** The number shown to the prospect: the user's own, else the extension's (null = Kavkom decides). */
export function kavkomCallerIdFor(user: { kavkomCallerId: string | null }): string | null {
    return toE164(user.kavkomCallerId);
}
