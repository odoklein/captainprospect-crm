// ============================================
// COMPANY NAME MATCHING (Leexi <-> CRM)
// Normalized comparison with fuzzy tolerance
// ============================================

/**
 * Normalize a company name for comparison:
 * lowercase, strip accents, remove common suffixes (SAS, SARL, SA, SRL, Inc, Ltd, etc.),
 * trim whitespace, collapse multiple spaces.
 */
function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\b(sas|sasu|sarl|sa|srl|inc\.?|ltd\.?|llc|gmbh|ag|corp\.?|co\.?)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Shortest name allowed to match inside a longer one ("By K" must not match every title). */
const MIN_CONTAINED_LENGTH = 4;

/**
 * Check if two company names match after normalization:
 * same name, same name without spaces ("Calipso Formation" ↔ calipsoformation.org),
 * or the shorter one appearing as whole words inside the longer one.
 */
export function companiesMatch(crmName: string, leexiName: string): boolean {
  if (!crmName || !leexiName) return false;
  const a = normalize(crmName);
  const b = normalize(leexiName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.replace(/ /g, '') === b.replace(/ /g, '')) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.replace(/ /g, '').length < MIN_CONTAINED_LENGTH) return false;
  return ` ${long} `.includes(` ${short} `);
}

export interface MatchedRecap<T> {
  clientId: string;
  clientName: string;
  recaps: T[];
}

/** Does a call (its company guess and every match key) belong to this client? */
export function recapMatchesClient(clientName: string, recap: { companyName: string; matchKeys?: string[] }): boolean {
  const keys = recap.matchKeys?.length ? recap.matchKeys : [recap.companyName];
  return keys.some((k) => companiesMatch(clientName, k));
}

/**
 * Match an array of recaps to CRM clients.
 * Returns only clients that have at least one matched recap.
 */
export function matchRecapsToClients<T extends { companyName: string; matchKeys?: string[] }>(
  clients: { id: string; name: string }[],
  recaps: T[],
): MatchedRecap<T>[] {
  const results: MatchedRecap<T>[] = [];

  for (const client of clients) {
    const matched = recaps.filter((r) => recapMatchesClient(client.name, r));
    if (matched.length > 0) {
      results.push({
        clientId: client.id,
        clientName: client.name,
        recaps: matched,
      });
    }
  }

  return results;
}
