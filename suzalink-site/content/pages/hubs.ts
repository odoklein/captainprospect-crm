/**
 * Pages de rubrique : /guides, /secteurs et /a-propos.
 * Les listes se construisent toutes seules à partir de guides.ts et secteurs.ts.
 */
import { guides } from "./guides";
import { contacts, sectors } from "./secteurs";
import { targetCard } from "@/lib/targets";
import type { LandingPage } from "./types";

export const guidesHub: LandingPage = {
  path: "/guides",
  breadcrumb: "Guides",
  updated: "2026-11-12",
  meta: {
    title: "Guides de prospection B2B et prise de rendez-vous",
    description:
      "Nos guides de prospection B2B : externaliser, prix d'un RDV, script d'appel, RGPD, barrage secrétaire. Écrits par une équipe qui appelle tous les jours.",
  },
  hero: {
    eyebrow: "Ressources",
    title: "Ce que nous apprenons en appelant tous les jours",
    lead: "Des guides courts et chiffrés, écrits par l'équipe de Suzali Conseil à partir de ses propres missions. Pas de théorie recopiée : ce qui marche au téléphone, et ce qui ne marche pas.",
    primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
    secondary: { label: "Voir les secteurs", href: "/secteurs" },
  },
  blocks: [
    {
      kind: "links",
      id: "guides",
      eyebrow: "Guides",
      title: "Pour bien prospecter",
      items: guides.map((g) => ({ label: g.name, href: g.path, body: g.summary })),
    },
    {
      kind: "links",
      id: "aller-plus-loin",
      eyebrow: "Nos offres",
      title: "Quand vous voulez passer à l'action",
      items: [
        { label: "Prospection externalisée", href: "/prospection-externalisee", body: "Nos SDR prennent vos RDV, chaque appel est visible." },
        { label: "CRM pour agences", href: "/crm-agence-prospection", body: "Votre équipe appelle avec notre CRM, à votre marque." },
        { label: "Tarifs", href: "/tarifs", body: "Prix publics, hors taxes, sans « nous consulter »." },
      ],
    },
  ],
};

export const secteursHub: LandingPage = {
  path: "/secteurs",
  breadcrumb: "Secteurs",
  updated: "2026-11-15",
  meta: {
    title: "Prospection B2B par secteur : notre méthode terrain",
    description:
      "Cabinets dentaires, industrie, transport, éditeurs de logiciels : qui décroche, quand appeler, quoi dire. Nos chiffres de mission quand ils sont publiés.",
  },
  hero: {
    eyebrow: "Secteurs",
    title: "Chaque cible se prospecte différemment",
    lead: "Un cabinet dentaire ne décroche pas comme une direction financière. Chaque page dit qui répond, quand appeler et ce qui fait dire oui. Les chiffres n'y figurent que quand une mission est terminée.",
    primary: { label: "Tester sur mon secteur", href: "/demo?offre=sprint" },
    secondary: { label: "Par interlocuteur", href: "/interlocuteurs" },
    photo: "arches",
  },
  blocks: [
    {
      kind: "targets",
      id: "secteurs",
      eyebrow: "Par secteur",
      title: "Les secteurs que nous appelons",
      intro: "« Chiffres publiés » : la mission est terminée et documentée. « Mission en cours » : la méthode est en ligne, les chiffres viendront à la fin.",
      items: sectors.map(targetCard),
    },
    {
      kind: "targets",
      id: "interlocuteurs",
      eyebrow: "Par interlocuteur",
      title: "Les fonctions que nous appelons",
      items: contacts.map(targetCard),
    },
    {
      kind: "pains",
      id: "regles",
      eyebrow: "Notre règle",
      title: "Pourquoi si peu de chiffres",
      items: [
        { title: "Rien d'inventé", body: "Un chiffre vient d'une mission terminée, daté, client anonymisé. Sinon, il n'apparaît pas." },
        { title: "Votre secteur n'y est pas ?", body: "Le [sprint test](/tarifs#sprint) vous dit en deux semaines ce que votre cible donne au téléphone, et à quel coût." },
      ],
    },
  ],
};

export const interlocuteursHub: LandingPage = {
  path: "/interlocuteurs",
  breadcrumb: "Interlocuteurs",
  updated: "2026-11-15",
  meta: {
    title: "Prospecter par fonction : DAF, dirigeants de PME",
    description:
      "Comment joindre un DAF ou un dirigeant de PME par téléphone : créneaux, barrage, objections et ouverture d'appel. La méthode terrain de nos SDR.",
  },
  hero: {
    eyebrow: "Interlocuteurs",
    title: "Joindre la bonne personne, au bon moment",
    lead: "Un DAF, un dirigeant de PME et une assistante dentaire ne se joignent pas de la même façon. Pour chaque fonction : son calendrier, qui filtre, ce qu'elle objecte, et ce qui la fait accepter un échange.",
    primary: { label: "Tester sur ma cible", href: "/demo?offre=sprint" },
    secondary: { label: "Par secteur", href: "/secteurs" },
    photo: "pathEmpty",
  },
  blocks: [
    {
      kind: "targets",
      id: "interlocuteurs",
      eyebrow: "Par interlocuteur",
      title: "Les fonctions que nous appelons",
      items: contacts.map(targetCard),
    },
    {
      kind: "targets",
      id: "secteurs",
      eyebrow: "Par secteur",
      title: "Et les secteurs",
      items: sectors.map(targetCard),
    },
  ],
};

export const aPropos: LandingPage = {
  path: "/a-propos",
  breadcrumb: "À propos",
  updated: "2026-11-12",
  meta: {
    title: "À propos de Suzalink, une marque de Suzali Conseil",
    description:
      "Suzalink est la marque de prospection et de CRM de Suzali Conseil : une vingtaine de SDR, 5 à 10 missions en parallèle, et un CRM construit sur le terrain.",
  },
  hero: {
    eyebrow: "À propos",
    title: "Nous appelons tous les jours. Suzalink en est né.",
    lead: "Suzalink est un nouveau chapitre de [Suzali Conseil](https://suzaliconseil.com). Nous menons des missions de prospection pour nos clients, et nous avons construit le CRM dont nous avions besoin pour les faire bien.",
    primary: { label: "Demander une démo", href: "/demo" },
    secondary: { label: "Nos offres", href: "/tarifs" },
  },
  blocks: [
    {
      kind: "answer",
      question: "Qui est derrière Suzalink ?",
      answer:
        "Suzalink est une marque de Suzali Conseil, société de conseil commercial. L'équipe compte une vingtaine de SDR qui mènent 5 à 10 missions de prospection en parallèle. Suzalink réunit deux offres : la prospection externalisée, et le CRM que nous utilisons pour la faire, proposé aux agences et aux équipes SDR.",
      facts: ["≈ 20 SDR", "5 à 10 missions en parallèle", "Un CRM utilisé chaque jour par l'équipe"],
    },
    {
      kind: "prose",
      id: "histoire",
      eyebrow: "Notre histoire",
      title: "D'une agence à un produit",
      parts: [
        {
          title: "Suzali Conseil, la maison mère",
          paragraphs: [
            "Suzali Conseil accompagne des entreprises dans leur développement commercial. La prospection téléphonique B2B est devenue le cœur de son activité : cabinets dentaires, directions financières, industrie, transport.",
          ],
        },
        {
          title: "Pourquoi un CRM",
          paragraphs: [
            "Nos SDR passaient d'une mission à l'autre dans la journée, nos clients voulaient voir les appels, et aucun outil ne faisait les deux sans bricolage. Nous avons donc construit le nôtre : file d'appels, enregistrements, fiche de RDV rédigée par l'IA, portail client. C'est devenu [le CRM Suzalink](/crm-agence-prospection).",
          ],
        },
        {
          title: "Suzalink, le nouveau chapitre",
          paragraphs: [
            "Suzalink réunit ce que nous savons faire : prendre des RDV pour vous avec [la prospection externalisée](/prospection-externalisee), ou vous donner l'outil pour les prendre vous-même.",
          ],
        },
      ],
    },
    {
      kind: "features",
      id: "principes",
      eyebrow: "Nos principes",
      title: "Ce sur quoi nous ne transigeons pas",
      items: [
        { icon: "waveform", title: "Tout est enregistré", body: "Chaque appel est consultable par le client. Rien ne se passe en coulisses." },
        { icon: "check", title: "Rien d'inventé", body: "Nos chiffres viennent de nos missions, avec leur date. Pas de promesse avant le premier appel." },
        { icon: "lock", title: "Les données au client", body: "Fichiers, contacts et enregistrements appartiennent au client. Les données des agences clientes du CRM ne sont jamais utilisées par nos équipes." },
        { icon: "users", title: "Respect des personnes appelées", body: "On se présente, on dit pourquoi on appelle, et un refus est enregistré et respecté." },
        { icon: "chart", title: "Des prix publics", body: "Tous nos prix sont sur le site, hors taxes. Voir les [tarifs](/tarifs)." },
        { icon: "shield", title: "Une instance par client", body: "Chaque agence cliente du CRM a sa propre instance et sa propre base." },
      ],
    },
    {
      kind: "links",
      id: "liens",
      eyebrow: "Pour aller plus loin",
      title: "Découvrir Suzalink",
      items: [
        { label: "Prospection externalisée", href: "/prospection-externalisee", body: "Nos SDR prennent vos RDV." },
        { label: "CRM pour agences", href: "/crm-agence-prospection", body: "Le CRM à votre marque." },
        { label: "Nos guides", href: "/guides", body: "Ce que nous apprenons au téléphone." },
      ],
    },
  ],
};
