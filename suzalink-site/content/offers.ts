/**
 * OFFRES « SUZALINK PROSPECTION » (nos SDR prennent les RDV pour le client).
 * Les offres CRM sont dans content/pricing.ts.
 *
 * TODO équipe commerciale : prix et garanties PROPOSÉS, à valider avant la mise en ligne.
 * Ce sont des engagements commerciaux : ne les changez que sur décision écrite.
 */

import { plans } from "./pricing";

export type ProspectionOffer = {
  id: "sprint" | "mission" | "resultat";
  name: string;
  /** Pour qui, en une phrase. */
  audience: string;
  price: { amount: number; prefix?: string; unit: string };
  /** Ligne sous le prix (ex. « + 100 € HT par RDV honoré »). */
  extra?: string;
  highlight?: string;
  features: string[];
  cta: string;
};

export const prospectionOffers: ProspectionOffer[] = [
  {
    id: "sprint",
    name: "Sprint test",
    audience: "Pour savoir, en deux semaines, combien de RDV votre cible peut donner.",
    price: { amount: 990, unit: "HT, une fois" },
    extra: "Déduit du premier mois si vous continuez",
    highlight: "Pour commencer",
    features: [
      "2 semaines, 1 SDR dédié",
      "Fichier nettoyé avant le premier appel",
      "Script écrit avec vous",
      "Accès au portail : appels, enregistrements, RDV",
      "Bilan final avec le coût réel d'un RDV sur votre cible",
    ],
    cta: "Lancer un sprint test",
  },
  {
    id: "mission",
    name: "Mission mensuelle",
    audience: "Pour un flux régulier de RDV, avec un SDR qui connaît votre offre.",
    price: { amount: 1290, unit: "HT / mois" },
    extra: "+ 100 € HT par RDV honoré",
    features: [
      "1 SDR dédié, 22 jours par mois",
      "Rappels planifiés à des horaires différents",
      "Fiche de RDV rédigée par l'IA pour chaque RDV",
      "Rapport quotidien et bilan chaque semaine",
      "Sans engagement, préavis d'un mois",
    ],
    cta: "Parler de ma mission",
  },
  {
    id: "resultat",
    name: "100 % résultat",
    audience: "Vous ne payez que les RDV honorés, sur les cibles que nous connaissons déjà.",
    price: { amount: 180, prefix: "dès", unit: "HT par RDV honoré" },
    extra: "Selon la cible, de 180 à 300 € HT",
    features: [
      "Aucun forfait",
      "Réservé aux cibles déjà prouvées en mission",
      "RDV validé avec vous avant facturation",
      "Mêmes outils : portail, enregistrements, fiche IA",
    ],
    cta: "Vérifier si ma cible est éligible",
  },
];

/** Garanties affichées sur /prospection-externalisee et /tarifs. TODO : à valider. */
export const guarantees = [
  { title: "RDV remplacé", body: "Un RDV non honoré ou hors de votre cible est remplacé sous 14 jours, sans frais." },
  { title: "Rien de caché", body: "Chaque appel est enregistré et consultable dans votre portail, le jour même." },
  { title: "Sans engagement", body: "Après le sprint, vous arrêtez quand vous voulez, avec un mois de préavis." },
  { title: "Vos données", body: "Fichiers, contacts et enregistrements vous appartiennent. Vous les récupérez à tout moment." },
];

/** Ce qu'un visiteur peut choisir sur /demo (?offre=…) : offres CRM et offres de prospection. */
export const interests = [
  ...prospectionOffers.map((o) => ({ id: o.id, name: o.name })),
  ...plans.map((p) => ({ id: p.id, name: `CRM ${p.name}` })),
];

export const findInterest = (id?: string) => interests.find((i) => i.id === id);
