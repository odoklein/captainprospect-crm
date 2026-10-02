/**
 * Kill switch for the AI company enrichment (panel in UnifiedActionDrawer + /api/enrichment/company-ai).
 * While false: the panel fires no request and shows a "bientôt disponible" pop-up on click,
 * and the route answers 503 to every method.
 * Flip to true to release the feature (single place, client and server both read it).
 */
export const COMPANY_AI_ENRICHMENT_ENABLED = false;

export const COMPANY_AI_COMING_SOON_MESSAGE =
    "Cette fonctionnalité sera disponible à partir de la semaine prochaine, en version stable.";
