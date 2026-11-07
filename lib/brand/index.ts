// ============================================
// BRAND — the DEFAULT brand (brand/brand.config.ts), sync and client-safe.
//
// import { brand } from "@/lib/brand";
//   brand.name            "Captain Prospect"
//   brand.appUrl          env NEXT_PUBLIC_APP_URL → NEXTAUTH_URL → config
//   brand.palette.primary[600]  hex, same value the CSS token carries
//
// This instance's RUNTIME brand (manager "Identité" settings, provisioning
// API) lives in the BrandSettings table and must be read with:
//   server  → const b = await getBrand()   (lib/brand/server)
//   client  → const b = useBrand()          (lib/brand/client)
// The helpers below take that brand as an optional last argument. Anything
// left on the bare `brand` renders the config values, not the instance's.
//
// Edit brand/brand.config.ts for the defaults, not this file.
// ============================================

import { brandConfig } from "@/brand/brand.config";
import { brandIcsProdIdOf, brandSenderOf, brandTitleOf, brandUrlOf, resolveAppUrl, resolveBrand } from "./resolve";
import type { Brand } from "./types";

const defaults = resolveBrand(null);

/** The config brand. appUrl/appHost stay live getters (container env can change per deploy). */
export const brand: Brand = {
    ...defaults,
    get appUrl(): string {
        return resolveAppUrl(brandConfig.web.appUrl);
    },
    get appHost(): string {
        try {
            return new URL(resolveAppUrl(brandConfig.web.appUrl)).host;
        } catch {
            return resolveAppUrl(brandConfig.web.appUrl);
        }
    },
};

/** Absolute URL inside the app: brandUrl("/client/portal") → "https://app…/client/portal". */
export function brandUrl(path = "/", b: Brand = brand): string {
    return brandUrlOf(b, path);
}

/** `"Captain Prospect" <notifications@…>` — the From header of automatic emails. */
export function brandSender(address?: string, b: Brand = brand): string {
    return brandSenderOf(b, address ?? b.email.notificationsAddress);
}

/** `-//Captain Prospect CRM//RDV//FR` — iCalendar PRODID. */
export function brandIcsProdId(kind = "RDV", b: Brand = brand): string {
    return brandIcsProdIdOf(b, kind);
}

/** `<page> | Captain Prospect` — consistent document titles. */
export function brandTitle(page?: string, b: Brand = brand): string {
    return brandTitleOf(b, page);
}

export { brandConfig, resolveBrand };
export type { Ramp } from "./color";
export type { Brand, BrandPalette, BrandLogos, BrandAssetSlot, BrandSettingsValues, FontPresetId } from "./types";
