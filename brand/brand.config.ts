// ============================================
// BRAND CONFIG — the one file to edit when this CRM is cloned for another agency.
//
// Everything visible that says "who we are" comes from here: names in the UI,
// <title>, emails, PDFs, exports, AI prompts, the colour system and the logos.
// Colours: give two seeds; lib/brand/color.ts derives every 50…950 shade, the
// tinted greys and the readable text colour on top. See brand/README.md.
//
// Keep this file free of imports from the app: server code, workers and emails
// all read it.
// ============================================

export const brandConfig = {
    identity: {
        /** The brand people see: sidebar, login, emails, PDFs. */
        name: "Captain Prospect",
        /** Product name for <title>, browser tabs, calendar PRODID, notifications. */
        productName: "Captain Prospect CRM",
        /** One-line positioning, used under the logo and in meta descriptions. */
        tagline: "Plateforme d'exécution commerciale",
        /** What the agency does, as AI prompts should describe it. */
        description: "agence de prospection commerciale B2B",
        /** Legal entity behind the brand (invoices, legal footers). */
        companyName: "Suzali Conseil",
        /** Short label for the agency's own enriched lists (list source SUZALI). */
        companyShortName: "Suzali",
    },

    web: {
        /** Public URL of the app — fallback when NEXT_PUBLIC_APP_URL / NEXTAUTH_URL are unset. */
        appUrl: "https://app.captainprospect.fr",
        /** Marketing site. */
        website: "https://captainprospect.fr",
    },

    email: {
        /** Display name on automatic emails ("Captain Prospect" <…>). */
        senderName: "Captain Prospect",
        /** Default sender for notifications when no SMTP sender is configured. */
        notificationsAddress: "notifications@captainprospect.fr",
        /** Where blocked or lost users are told to write. */
        supportAddress: "support@suzalink.com",
        /** Email domains offered first in address pickers. */
        domains: ["captainprospect.fr", "suzaliconseil.com"],
    },

    locale: {
        lang: "fr",
        locale: "fr-FR",
        currency: "EUR",
        timeZone: "Europe/Paris",
    },

    colors: {
        /**
         * Structure colour: sidebar, hero cards, primary buttons. Pick the
         * darkest colour of the logo; it lands on the shade that matches its
         * lightness (navy #263460 → primary-900).
         */
        primary: "#263460",
        /** Highlight colour: active nav, selection, focus ring, AI features. */
        accent: "#C64B8B",
        /** How much of the primary hue tints the greys: 0 = pure grey, 1 = slate-like. */
        neutralTint: 1,
    },

    /** Files in /public. Replace the images, keep the names. */
    logos: {
        /** Full logo on a light background. */
        full: "/brand/logo.png",
        /** Full logo on the primary colour (sidebar, hero, dark emails). */
        fullInverse: "/brand/logo-inverse.png",
        /** Square symbol on light backgrounds. */
        mark: "/brand/mark.png",
        /** Square symbol on the primary colour. */
        markInverse: "/brand/mark-inverse.png",
        /** Browser tab icon and apple-touch icon. */
        favicon: "/brand/favicon.png",
        /** Intrinsic size of `full` (keeps next/image from shifting layout). */
        fullWidth: 2460,
        fullHeight: 758,
    },
} as const;

export type BrandConfig = typeof brandConfig;
