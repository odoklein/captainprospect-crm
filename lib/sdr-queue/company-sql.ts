// SQL fragments shared by the SDR queue routes and the qualification loader, so a
// company reads the same everywhere. `co` is the Company alias.

/** First customData value whose key matches `keyRegex` (imports use free keys: TAILLE, Effectif, CA…). */
export const customValueSql = (keyRegex: string) =>
    `CASE WHEN jsonb_typeof(co."customData"::jsonb) = 'object' THEN (SELECT NULLIF(e.value, '') FROM jsonb_each_text(co."customData"::jsonb) e WHERE e.key ~* '${keyRegex}' ORDER BY e.key LIMIT 1) END`;

export const COMPANY_PHONE_SQL = `COALESCE(NULLIF(co.phone, ''), NULLIF(co."customData"->'additionalPhones'->>0, ''))`;
export const COMPANY_SIZE_SQL = `COALESCE(NULLIF(co.size, ''), ${customValueSql("^(effectif|taille|tranche|headcount|employees|nb_?salari)")})`;
export const COMPANY_REVENUE_SQL = customValueSql("(chiffre|^ca([ _]|$)|revenu|turnover)");
