// ============================================
// NOTE-TAKERS — what a manager reads before connecting one: the tool's logo,
// one line on what it is, which offer includes the API, and where the key
// lives, click by click. Pure (browser and server). Logos are the vendors'
// own app icons, copied from their websites into public/integrations/notetakers.
// Facts checked against each vendor's help center on 2026-10-29.
// ============================================

import type { NotetakerId } from "./catalog";

export interface NotetakerGuide {
    logo: string;
    /** What the tool is, in a few words. */
    tagline: string;
    /** Which of the tool's offers include API access. */
    plan?: string;
    /** Where the key is created, click by click, in the tool's own menu names. */
    steps: string[];
    /** What the key can see, and the catch to know before creating it. */
    note?: string;
    /** The page in the tool's app where the key is created, when it has a stable URL. */
    keyUrl?: string;
    /** The vendor's help on getting a key. */
    docsUrl: string;
}

const LOGO_DIR = "/integrations/notetakers";

export const NOTETAKER_GUIDES: Record<NotetakerId, NotetakerGuide> = {
    leexi: {
        logo: `${LOGO_DIR}/leexi.png`,
        tagline: "Notes IA des réunions et appels commerciaux",
        plan: "Offre AI Meeting ou supérieure",
        steps: [
            "Dans Leexi, ouvrez Paramètres › Avancé › Clés API, puis « Ajouter ».",
            "Mode d'accès : choisissez « Accès à tout » et cochez la lecture des appels.",
            "Copiez tout de suite l'identifiant et le secret : le secret ne s'affiche qu'une fois.",
        ],
        note: "Par défaut, une clé Leexi est « Liée à un utilisateur » et ne voit que les appels de la personne qui l'a créée.",
        docsUrl: "https://docs.leexi.ai/fr/guides/general-settings/api-keys",
    },
    modjo: {
        logo: `${LOGO_DIR}/modjo.png`,
        tagline: "Analyse des appels commerciaux, hébergée en France",
        steps: [
            "Dans Modjo, ouvrez Paramètres › Intégrations, carte « Public API », puis « Connecter ».",
            "Créez une clé et copiez-la : Modjo ne la réaffiche pas.",
        ],
        note: "Seuls les rôles Administrateur et Manager de Modjo peuvent créer une clé.",
        keyUrl: "https://app.modjo.ai/settings/integrations/modjo_api_key",
        docsUrl: "https://help.modjo.ai/en/articles/9310645-modjo-api",
    },
    claap: {
        logo: `${LOGO_DIR}/claap.svg`,
        tagline: "Enregistrement des réunions et appels, notes IA",
        plan: "Offre Enterprise",
        steps: [
            "Dans Claap, cliquez sur le nom de l'espace (barre de gauche) › Settings › API & Webhooks.",
            "« Create API key », donnez-lui un nom, puis copiez-la : elle commence par cla_ et ne s'affiche qu'une fois.",
        ],
        note: "Clé réservée aux admins et propriétaires de l'espace. Elle voit les enregistrements de l'espace, sauf les privés.",
        docsUrl: "https://help.claap.io/en/articles/11833785-using-claap-s-api",
    },
    fireflies: {
        logo: `${LOGO_DIR}/fireflies.png`,
        tagline: "Assistant IA qui transcrit et résume les réunions",
        plan: "Toutes les offres, gratuite comprise",
        steps: [
            "Dans Fireflies, ouvrez Integrations, cherchez « Fireflies API », puis « Get API Key ».",
            "Sur Settings › Developer settings, copiez la clé.",
        ],
        note: "Créez la clé depuis un compte administrateur d'équipe : la clé d'un utilisateur simple ne voit que ses propres réunions.",
        keyUrl: "https://app.fireflies.ai/integrations/custom/fireflies",
        docsUrl: "https://guide.fireflies.ai/articles/3737786777-fireflies-api-overview-get-api-key",
    },
    fathom: {
        logo: `${LOGO_DIR}/fathom.png`,
        tagline: "Notes IA pour Zoom, Google Meet et Teams",
        plan: "Toutes les offres",
        steps: ["Dans Fathom, ouvrez User Settings › API Access.", "Générez une clé et copiez-la."],
        note: "Une clé Fathom est personnelle : elle voit les réunions de son auteur et celles partagées avec lui ou son équipe. Créez-la depuis le compte qui mène les appels de closing.",
        keyUrl: "https://fathom.video/customize#api-access-header",
        docsUrl: "https://developers.fathom.ai/quickstart",
    },
    grain: {
        logo: `${LOGO_DIR}/grain.png`,
        tagline: "Enregistreur de réunions pour équipes commerciales",
        plan: "Toutes les offres",
        steps: [
            "Dans Grain, ouvrez Account settings › Integrations › Personal API.",
            "« Generate personal API token », puis copiez-le : il commence par grain_pat_.",
        ],
        note: "Un token personnel voit les réunions accessibles à son auteur. Pour tout l'espace, un admin crée un token d'espace (offres Business et Enterprise) dans Workspace settings › Integrations › API.",
        keyUrl: "https://grain.com/app/settings/account/integrations/personal_api",
        docsUrl: "https://support.grain.com/en/articles/15507288-grain-api",
    },
    tldv: {
        logo: `${LOGO_DIR}/tldv.png`,
        tagline: "Enregistreur de réunions, données hébergées en UE",
        plan: "Offres Pro, Business et Enterprise",
        steps: ["Dans tl;dv, ouvrez Settings › Personal Settings › API Keys.", "Générez une clé et copiez-la."],
        note: "Seules les réunions organisées par un compte payant sont accessibles. L'accès à toute l'organisation demande l'offre Enterprise.",
        keyUrl: "https://tldv.io/app/settings/personal-settings/api-keys",
        docsUrl: "https://intercom.help/tldv/en/articles/11583137-api",
    },
};

export function notetakerLogo(id: string): string | null {
    return NOTETAKER_GUIDES[id as NotetakerId]?.logo ?? null;
}

/** The import in three steps, for the wizard and Paramètres. */
export const NOTETAKER_HOW_IT_WORKS = [
    "Ajoutez la clé API de votre outil dans Paramètres › Intégrations",
    "Dans « Nouveau client », choisissez l'appel de closing",
    "L'IA pré-remplit la fiche, la cible et le discours : vous vérifiez",
] as const;

/** id of the Leexi card in Paramètres › Intégrations (Leexi has its own form). */
export const LEEXI_SETTINGS_ANCHOR = "leexi-settings";

/** Paramètres › Intégrations, opened on one tool's key when `tool` is given. */
export function notetakerSettingsHref(tool?: string): string {
    return `/manager/settings?section=integrations${tool ? `&tool=${encodeURIComponent(tool)}` : ""}`;
}
