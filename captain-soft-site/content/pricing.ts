/**
 * TOUS LES PRIX DU SITE. Modifiez uniquement ce fichier pour changer un tarif.
 * Montants en euros HT, par mois. Source : OFFRES_ET_DIFFERENCIATION_MARCHE.md.
 */

import type { ToolId } from "./brands";

export type BillingPeriod = "monthly" | "annual";

export type Plan = {
  id: "independant" | "small-business" | "medium-business";
  name: string;
  audience: string;
  /** Prix mensuel HT selon la période de facturation choisie. */
  price: Record<BillingPeriod, number>;
  seatsIncluded: number;
  /** Prix d'un utilisateur supplémentaire, HT / mois. null = non proposé. */
  extraSeat: { price: number; limit?: string } | null;
  setupFee: { price: number; label: string };
  highlight?: string;
  features: string[];
  cta: string;
};

export const currency = "EUR";

export const billing = {
  monthly: { label: "Mensuel", note: "Sans engagement" },
  annual: { label: "Annuel", note: "Facturé chaque année" },
} as const;

export const plans: Plan[] = [
  {
    id: "independant",
    name: "Indépendant",
    audience: "SDR, closer ou consultant qui prospecte seul.",
    price: { monthly: 69, annual: 59 },
    seatsIncluded: 1,
    extraSeat: null,
    setupFee: { price: 150, label: "Mise en service optionnelle" },
    features: [
      "File d'appels et résultat en 1 clic",
      "1 ligne Allo ou OnOff",
      "Call Vault : 20 h d'enregistrements / mois",
      "150 fiches de RDV générées par l'IA / mois",
      "15 000 contacts, 5 Go de stockage",
      "Emails et modèles",
    ],
    cta: "Choisir Indépendant",
  },
  {
    id: "small-business",
    name: "Small Business",
    audience: "Équipes de 3 à 7 commerciaux avec un manager.",
    price: { monthly: 229, annual: 189 },
    seatsIncluded: 3,
    extraSeat: { price: 49, limit: "jusqu'à 7 utilisateurs" },
    setupFee: { price: 350, label: "Mise en service et formation" },
    highlight: "Recommandé pour les équipes",
    features: [
      "Tout Indépendant, plus :",
      "Tableau de bord manager en temps réel",
      "Jusqu'à 3 lignes Allo ou OnOff",
      "Call Vault : 80 h d'enregistrements / mois",
      "600 fiches de RDV générées par l'IA / mois",
      "60 000 contacts, 25 Go de stockage",
    ],
    cta: "Choisir Small Business",
  },
  {
    id: "medium-business",
    name: "Medium Business",
    audience: "Agences de prospection et équipes de 8 à 30 commerciaux.",
    price: { monthly: 499, annual: 419 },
    seatsIncluded: 8,
    extraSeat: { price: 39 },
    setupFee: { price: 750, label: "Déploiement accompagné" },
    features: [
      "Tout Small Business, plus :",
      "Marque blanche : domaine, logo, couleurs",
      "Portail client pour vos clients d'agence",
      "Lignes Allo ou OnOff illimitées",
      "Call Vault : 250 h d'enregistrements / mois",
      "2 500 fiches de RDV générées par l'IA / mois",
      "250 000 contacts, 100 Go de stockage",
    ],
    cta: "Choisir Medium Business",
  },
];

/** Prix d'appel affiché partout (« dès 59 € ») : le plus bas des prix annuels. */
export const startingPrice = Math.min(...plans.map((p) => p.price.annual));

/** Économie annuelle maximale, en %, calculée depuis les plans (affichée sur le sélecteur). */
export const maxAnnualSavingPercent = Math.floor(
  Math.max(...plans.map((p) => (1 - p.price.annual / p.price.monthly) * 100)),
);

/**
 * Section 8 — « Le stack morcelé ». Fourchettes de prix publics constatés,
 * HT, par utilisateur et par mois. TODO : revérifier chaque ligne avant publication
 * (la publicité comparative doit rester objective et vérifiable).
 */
export const stackComparison = {
  // `logos` : identifiants de content/brands.ts (logos affichés devant le nom).
  rows: [
    { tool: "HubSpot", logos: ["hubspot"], use: "CRM", min: 80, max: 150 },
    { tool: "Aircall", logos: ["aircall"], use: "Téléphonie", min: 40, max: 50 },
    { tool: "Modjo", logos: ["modjo"], use: "Analyse d'appels", min: 80, max: 120 },
    { tool: "Lemlist", logos: ["lemlist"], use: "Séquences email", min: 50, max: 80 },
    { tool: "Zapier ou Make", logos: ["zapier", "make"], use: "Connecteurs", min: 30, max: 60 },
  ] satisfies Array<{ tool: string; logos: ToolId[]; use: string; min: number; max: number }>,
  footnote:
    "Fourchettes indicatives de prix publics, HT, par utilisateur et par mois. Les tarifs des éditeurs peuvent évoluer.",
};

export const stackTotal = {
  min: stackComparison.rows.reduce((sum, r) => sum + r.min, 0),
  max: stackComparison.rows.reduce((sum, r) => sum + r.max, 0),
};

export const formatEuro = (amount: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
