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
  updated: "2026-11-12",
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
      kind: "answer",
      question: "Combien coûte la prospection externalisée chez Suzalink ?",
      answer:
        "Le sprint test coûte 990 € HT pour deux semaines, déduits si vous continuez. La mission mensuelle coûte 1 290 € HT par mois plus 100 € HT par RDV honoré. Sur les cibles déjà prouvées, vous pouvez ne payer que les RDV honorés, de 180 à 300 € HT. Le CRM seul commence à 59 € HT par mois.",
      facts: ["Prix publics, hors taxes", "RDV non honoré remplacé", "Sans engagement après le sprint", "Le calcul détaillé : [prix d'un RDV qualifié](/guides/prix-rdv-qualifie)"],
    },
    {
      kind: "offers",
      id: "prospection",
      eyebrow: "Suzalink Prospection",
      title: "Nos SDR prennent vos RDV",
      intro: "Commencez par deux semaines de test. Vous continuez seulement si le coût d'un RDV vous convient.",
    },
    {
      kind: "showcase",
      id: "bilan",
      eyebrow: "À la fin du sprint",
      title: "Vous connaissez le prix réel d'un RDV",
      intro: "Le bilan du sprint met tout sur la table : appels, contacts joints, intéressés, RDV, et le coût d'un RDV sur votre cible. Vous décidez ensuite, chiffres en main.",
      points: [
        "Le coût réel d'un RDV, calculé sur vos appels",
        "Tous les enregistrements, téléchargeables",
        "Les objections les plus fréquentes et ce qu'on change",
      ],
      image: {
        src: "/visuals/bilan-sprint.webp",
        alt: "Illustration d'un bilan de sprint : 820 appels, 310 contacts joints, 41 intéressés, 7 RDV, soit 142 € HT par RDV pour un sprint à 990 € HT.",
        width: 1448,
        height: 1086,
      },
      reverse: true,
      action: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
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
