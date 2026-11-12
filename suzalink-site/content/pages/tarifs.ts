/**
 * Page /tarifs : toutes les offres, prospection et CRM.
 * Mot-clé principal : « prix prospection téléphonique ». Secondaires : « tarif rendez-vous qualifié »,
 * « prix CRM prospection ». Les montants viennent de content/offers.ts et content/pricing.ts.
 */
import type { LandingPage } from "./types";

export const tarifsPage: LandingPage = {
  path: "/tarifs",
  meta: {
    title: "Tarifs : prospection externalisée et CRM",
    description:
      "Prix publics, hors taxes : sprint test de prospection à 990 €, mission mensuelle, paiement au RDV honoré, et CRM de prospection dès 59 € par mois.",
  },
  breadcrumb: "Tarifs",
  hero: {
    eyebrow: "Tarifs",
    title: "Des prix publics, des RDV garantis",
    lead: "Vous voulez que nos SDR prennent vos RDV, ou équiper votre propre équipe. Dans les deux cas, le prix est écrit ici, hors taxes, sans « nous consulter ».",
    primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
    secondary: { label: "Tarifs du CRM", href: "#crm" },
    bullets: ["Sans engagement après le sprint", "RDV non honoré remplacé", "CRM : mensuel ou annuel, au choix"],
  },
  blocks: [
    {
      kind: "offers",
      id: "prospection",
      eyebrow: "Suzalink Prospection",
      title: "Nos SDR prennent vos RDV",
      intro: "Commencez par deux semaines de test. Vous continuez seulement si le coût d'un RDV vous convient.",
    },
    { kind: "crm-pricing", id: "crm" },
    {
      kind: "faq",
      id: "faq",
      eyebrow: "Questions fréquentes",
      title: "Sur les prix",
      items: [
        {
          q: "Combien coûte un RDV qualifié ?",
          a: "Avec l'offre 100 % résultat, de 180 à 300 € HT par RDV honoré selon la cible. Avec la mission mensuelle, 1 290 € HT par mois plus 100 € HT par RDV honoré : le coût réel dépend du nombre de RDV que votre cible donne, et le sprint test sert à le mesurer.",
        },
        {
          q: "Le sprint test est-il remboursé si je continue ?",
          a: "Il est déduit de votre premier mois de mission. Si vous arrêtez après le sprint, vous gardez les RDV, les enregistrements et le bilan.",
        },
        {
          q: "Qu'est-ce qu'un RDV honoré ?",
          a: "Un RDV qui a eu lieu, avec une personne qui correspond à la cible définie ensemble. Un RDV annulé sans être reporté, ou hors cible, n'est pas facturé et il est remplacé.",
        },
        {
          q: "Puis-je combiner la prospection et le CRM ?",
          a: "Oui. Certaines équipes nous confient une partie de la prospection et appellent elles-mêmes le reste avec le CRM. Tout est dans le même outil.",
        },
        {
          q: "Les prix sont-ils hors taxes ?",
          a: "Oui, tous les prix du site sont hors taxes. La TVA s'ajoute au taux en vigueur.",
        },
      ],
    },
    {
      kind: "cta",
      id: "commencer",
      eyebrow: "Commencer",
      title: "Le plus simple : deux semaines de test",
      intro: "990 € HT, déduits si vous continuez. À la fin, vous savez ce que vaut votre cible.",
      primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
      secondary: { label: "Demander une démo du CRM", href: "/demo" },
    },
  ],
};
