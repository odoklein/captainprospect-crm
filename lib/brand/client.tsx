"use client";

// ============================================
// BRAND (client) — the runtime brand inside client components.
//
//   const b = useBrand();         b.name, b.palette, b.logos.full…
//   const { url } = useBrandHelpers();  url("/client/portal")
//
// The root layout resolves the brand on the server (getBrand) and wraps the
// tree in <BrandProvider>. Outside a provider, useBrand() returns the config
// brand, so a component rendered in isolation still works.
// ============================================

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { brand as defaultBrand } from "./index";
import { brandIcsProdIdOf, brandSenderOf, brandTitleOf, brandUrlOf } from "./resolve";
import type { Brand } from "./types";

const BrandContext = createContext<Brand>(defaultBrand);

export function BrandProvider({ brand, children }: { brand: Brand; children: ReactNode }) {
    return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
    return useContext(BrandContext);
}

/** brandUrl / brandSender / brandIcsProdId / brandTitle bound to the runtime brand. */
export function useBrandHelpers() {
    const b = useBrand();
    return useMemo(
        () => ({
            brand: b,
            url: (path = "/") => brandUrlOf(b, path),
            sender: (address?: string) => brandSenderOf(b, address ?? b.email.notificationsAddress),
            icsProdId: (kind = "RDV") => brandIcsProdIdOf(b, kind),
            title: (page?: string) => brandTitleOf(b, page),
        }),
        [b],
    );
}
