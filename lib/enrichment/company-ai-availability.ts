/**
 * Kill switch for the AI company enrichment (panel in UnifiedActionDrawer + /api/enrichment/company-ai).
 * While false: the panel fires no request and shows a "bientôt disponible" pop-up on click,
 * and the route answers 503 to every method.
 * Single place, client and server both read it. Released (true) on 2026-10-04.
 */
export const COMPANY_AI_ENRICHMENT_ENABLED = true;

export const COMPANY_AI_COMING_SOON_MESSAGE =
    "Cette fonctionnalité sera disponible à partir de la semaine prochaine, en version stable.";
