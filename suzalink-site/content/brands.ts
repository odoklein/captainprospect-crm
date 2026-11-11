/**
 * Marques affichées sur le site : clients (bande « Ils prospectent avec Suzalink »)
 * et outils cités (comparatif de coûts, téléphonie).
 *
 * Les logos sont téléchargés UNE FOIS depuis une API publique de logos, puis servis
 * depuis /public/logos (aucun appel tiers depuis le navigateur des visiteurs) :
 *
 *   npm run logos            # (re)télécharge les logos manquants
 *   npm run logos -- --force # tout retélécharger
 *
 * Pour ajouter un client : ajoutez une ligne dans `customers`, lancez `npm run logos`.
 * Pour utiliser votre propre fichier (SVG ou PNG), déposez-le dans /public/logos et
 * renseignez `logo` : il est alors prioritaire sur l'API.
 */

export type Brand = {
  name: string;
  /** Domaine utilisé par l'API de logos. */
  domain: string;
  /**
   * Fichier local (dans /public). Laissez vide pour utiliser le logo récupéré par l'API
   * (/logos/<domaine>.png). `null` = pas de logo, le nom seul est affiché.
   */
  logo?: string | null;
};

/** Clients réels, validés par Suzalink. */
export const customers: Brand[] = [
  // L'icône publique du site est une photo : on utilise le logo officiel (dépôt Captain Prospect).
  { name: "Captain Prospect", domain: "captainprospect.fr", logo: "/logos/captainprospect.fr.png" },
  { name: "Suzali Conseil", domain: "suzaliconseil.com" },
  { name: "Ping Lead Agency", domain: "ping-leadagency.fr" },
  // Pas d'icône publique pour l'instant : le nom seul est affiché. Déposez un fichier pour l'ajouter.
  { name: "Callcorico", domain: "callcorico.fr", logo: null },
];

/** Outils cités dans le comparatif et la téléphonie. */
export const tools = {
  hubspot: { name: "HubSpot", domain: "hubspot.com" },
  aircall: { name: "Aircall", domain: "aircall.io" },
  modjo: { name: "Modjo", domain: "modjo.ai" },
  lemlist: { name: "Lemlist", domain: "lemlist.com" },
  zapier: { name: "Zapier", domain: "zapier.com" },
  make: { name: "Make", domain: "make.com" },
  allo: { name: "Allo", domain: "withallo.com" },
  onoff: { name: "OnOff", domain: "onoff.app" },
} satisfies Record<string, Brand>;

export type ToolId = keyof typeof tools;

/** Chemin public du logo d'une marque, ou null si elle n'en a pas. */
export function brandLogo(brand: Brand): string | null {
  if (brand.logo === null) return null;
  return brand.logo ?? `/logos/${brand.domain}.png`;
}
