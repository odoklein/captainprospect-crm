/**
 * Page /prospection-externalisee : l'offre « nos SDR prennent vos RDV ».
 * Mot-clé principal : « prospection externalisée » (et « prospection commerciale externalisée »,
 * « externalisation prospection commerciale », « agence outbound » : Search Console suzaliconseil.com,
 * 28 jours au 13/10/2026).
 *
 * Chiffres : uniquement nos missions réelles, clients anonymisés, avec leur date.
 * - Mission dentaire, nov.–déc. 2025 : 5 174 appels, 147 RDV terrain + 36 boîtes de collecte,
 *   plus de 20 départements (Drive « LES RDV », onglet Statistiques).
 * - Fichier national dentaire nettoyé : 6 732 cabinets retenus (mission 2026).
 */
import type { LandingPage } from "./types";

export const prospectionPage: LandingPage = {
  path: "/prospection-externalisee",
  meta: {
    title: "Prospection externalisée : des RDV B2B qualifiés",
    description:
      "Externalisez votre prospection téléphonique B2B : un SDR dédié, chaque appel enregistré et visible. Un sprint test de 2 semaines pour juger sur pièces.",
  },
  breadcrumb: "Prospection externalisée",
  updated: "2026-11-12",
  hero: {
    eyebrow: "Prospection externalisée",
    title: "Des RDV qualifiés dans votre agenda, sans recruter",
    lead: "Nos SDR appellent vos cibles depuis notre propre CRM. Vous voyez chaque appel, chaque objection et chaque RDV le jour même. Et si un RDV n'est pas honoré, on le remplace.",
    primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
    secondary: { label: "Voir les tarifs", href: "/tarifs" },
    visual: {
      src: "/visuals/mission-semaine.webp",
      alt: "Illustration du portail client : appels de la semaine, taux de joignabilité, RDV pris et enregistrements à écouter.",
      width: 1536,
      height: 1024,
    },
  },
  blocks: [
    {
      kind: "answer",
      question: "Qu'est-ce que la prospection externalisée ?",
      answer:
        "La prospection externalisée consiste à confier à une équipe extérieure les appels qui mènent à vos rendez-vous commerciaux. Chez Suzalink, un SDR dédié appelle vos cibles depuis notre CRM, chaque appel est enregistré, et vous ne gardez que les RDV qualifiés : un RDV non honoré est remplacé.",
      facts: [
        "Sprint test de 2 semaines : **990 € HT**",
        "Chaque appel enregistré et consultable le jour même",
        "RDV non honoré remplacé sous 14 jours",
        "Sans engagement après le sprint",
      ],
    },
    {
      kind: "pains",
      id: "constat",
      eyebrow: "Le constat",
      title: "Prospecter, tout le monde sait. Tenir dans la durée, beaucoup moins.",
      intro: "Ce qu'on entend chez presque tous les dirigeants qui nous appellent.",
      items: [
        {
          title: "Recruter un SDR prend des mois",
          body: "Annonce, entretiens, formation, premiers appels hésitants. Le premier RDV arrive tard. Et si la personne part au bout de six mois, tout recommence. Nous comparons les deux options dans [notre guide pour externaliser sa prospection](/guides/externaliser-prospection-commerciale).",
        },
        {
          title: "Les agences montrent des chiffres, pas des appels",
          body: "Un tableau le vendredi, des « contacts argumentés » impossibles à vérifier. Vous ne savez pas ce qui a été dit à vos prospects en votre nom.",
        },
        {
          title: "Un appel sur deux ne décroche jamais",
          body: "Sur notre mission dentaire de fin 2025, la moitié des 5 174 appels n'a jamais abouti et 9 % des numéros étaient faux. Sans rappels planifiés ni fichier propre, une liste s'épuise très vite.",
        },
        {
          title: "Le standard filtre, le décideur ne rappelle pas",
          body: "Assistante, accueil, « il est en réunion ». Passer ce premier filtre demande des rappels à des heures différentes et une phrase d'accroche qui tient en dix secondes. Notre méthode est détaillée dans [passer le barrage secrétaire](/guides/barrage-secretaire).",
        },
      ],
    },
    {
      kind: "steps",
      id: "methode",
      eyebrow: "Comment se passe une mission",
      title: "Cinq étapes, toutes visibles dans votre portail",
      howto: true,
      items: [
        {
          when: "jours 1 à 3",
          title: "Cadrage",
          body: "On fixe ensemble la cible, le bon interlocuteur et ce qu'est un RDV qualifié pour vous. Le script s'écrit avec vous, pas à votre place.",
        },
        {
          when: "avant le 1er appel",
          title: "Fichier nettoyé",
          body: "Doublons, numéros faux, clients actuels : on retire tout ce qui fait perdre du temps. Sur un fichier national dentaire, il est resté 6 732 cabinets à appeler.",
        },
        {
          when: "chaque jour",
          title: "Appels et rappels",
          body: "Un SDR dédié appelle, note chaque objection et planifie les rappels à d'autres heures. Rien ne se perd entre deux journées.",
        },
        {
          when: "à chaque RDV",
          title: "Le RDV dans votre agenda",
          body: "Le RDV arrive dans votre calendrier avec sa fiche rédigée par l'IA : contexte, besoin, interlocuteur, ce qui a été promis.",
        },
        {
          when: "chaque semaine",
          title: "Le bilan",
          body: "Enregistrements, taux de joignabilité, objections les plus fréquentes et ce qu'on change la semaine suivante.",
        },
      ],
    },
    {
      kind: "showcase",
      id: "fiche-rdv",
      eyebrow: "Ce que vous recevez",
      title: "Chaque RDV arrive préparé",
      intro: "Dès qu'un RDV est pris, l'IA rédige la fiche à partir de l'appel. Le SDR la relit et la confirme avant qu'elle n'arrive chez vous.",
      points: [
        "Le besoin, dit avec les mots du prospect",
        "Le budget et l'horizon, quand ils ont été évoqués",
        "Le décideur et les autres personnes impliquées",
        "Les objections déjà levées, pour ne pas les rejouer",
      ],
      image: {
        src: "/visuals/fiche-rdv-ia.webp",
        alt: "Illustration d'une fiche de RDV rédigée par l'IA : date, interlocuteur, besoin, budget, décideur et objections levées.",
        width: 1122,
        height: 1402,
      },
      action: { label: "Voir le CRM qui la produit", href: "/crm-agence-prospection" },
    },
    {
      kind: "proof",
      id: "preuve",
      eyebrow: "Une vraie mission",
      title: "Cabinets dentaires, novembre et décembre 2025",
      intro: "Notre client devait faire accepter le passage d'un commercial terrain dans des cabinets dentaires partout en France.",
      stats: [
        { value: "5 174", label: "appels passés sur la campagne" },
        { value: "147", label: "RDV pris pour le commercial terrain" },
        { value: "36", label: "cabinets d'accord pour recevoir une boîte de collecte" },
        { value: "20+", label: "départements couverts, RDV groupés par tournée" },
      ],
      story:
        "Ce qui a marché : parler d'abord à l'assistante, qui décide souvent seule, et proposer une demande simple (« notre commercial peut-il passer déposer une boîte ? ») plutôt qu'un RDV de trente minutes. 36 cabinets ont dit oui à la boîte.",
      note: "Client anonymisé. Chiffres issus de notre suivi de mission. Détail dans notre page sur la prospection des cabinets dentaires.",
    },
    {
      kind: "compare",
      id: "comparatif",
      eyebrow: "Comparer",
      title: "Recruter, passer par une agence, ou Suzalink",
      columns: ["Recruter un SDR", "Agence classique", "Suzalink"],
      rows: [
        { label: "Avant le premier appel", cells: ["Recrutement puis formation", "Selon l'agence", "Sprint test de 2 semaines"] },
        { label: "Ce que vous voyez", cells: ["Ce que vos outils enregistrent", "Un rapport périodique", "Chaque appel enregistré, le jour même"] },
        { label: "Engagement", cells: ["Contrat de travail", "Souvent plusieurs mois", "Aucun après le sprint"] },
        { label: "RDV non honoré", cells: ["Perdu", "Selon le contrat", "Remplacé sous 14 jours"] },
        { label: "Si le SDR part", cells: ["On recommence le recrutement", "Géré par l'agence", "Un autre SDR reprend avec tout l'historique"] },
      ],
      note: "Comparaison générale, à adapter à chaque contrat. Les conditions des agences varient.",
    },
    {
      kind: "offers",
      id: "offres",
      eyebrow: "Offres",
      title: "Trois façons de commencer",
      intro: "Des prix publics, hors taxes. Commencez par le sprint : il vous dit ce que vaut votre cible avant de vous engager.",
    },
    {
      kind: "prose",
      id: "guide",
      eyebrow: "Bien choisir",
      title: "Externaliser sa prospection commerciale : ce qu'il faut savoir",
      parts: [
        {
          title: "Quand externaliser a du sens",
          paragraphs: [
            "Quand vous savez déjà vendre votre offre en rendez-vous, mais que personne n'a le temps d'en obtenir. Quand vous voulez tester un nouveau marché sans recruter. Ou quand votre équipe commerciale passe ses journées à appeler au lieu de signer.",
            "C'est moins utile si votre offre n'est pas encore claire : un SDR, interne ou externe, amplifie un message qui marche. Il ne le crée pas.",
          ],
        },
        {
          title: "Ce qu'est un RDV qualifié",
          paragraphs: [
            "Un RDV avec la bonne personne, dans la bonne entreprise, qui a accepté de parler de votre sujet à une date précise. On le définit avec vous dès le cadrage : taille d'entreprise, fonction, besoin, horizon. Un RDV qui ne coche pas ces cases ne vous est pas facturé. Pour les prix pratiqués, lisez [combien coûte un rendez-vous qualifié](/guides/prix-rdv-qualifie).",
          ],
        },
        {
          title: "Forfait ou paiement au RDV",
          paragraphs: [
            "Le forfait mensuel vous assure un SDR dédié et un volume d'appels régulier. Le paiement au RDV transfère le risque sur nous, donc nous ne l'acceptons que sur des cibles que nous connaissons. Le plus sain pour démarrer : un test court, qui donne le coût réel d'un RDV sur votre marché. Tous nos prix sont sur la [page tarifs](/tarifs).",
          ],
        },
        {
          title: "Les questions à poser à n'importe quel prestataire",
          paragraphs: [
            "Puis-je écouter les appels ? Qui appelle, et que se passe-t-il s'il part ? Que devient mon fichier en fin de contrat ? Que se passe-t-il quand un RDV n'est pas honoré ? Si les réponses sont floues, le reste le sera aussi.",
          ],
        },
      ],
    },
    {
      kind: "faq",
      id: "faq",
      eyebrow: "Questions fréquentes",
      title: "Avant de vous lancer",
      items: [
        {
          q: "Combien coûte la prospection externalisée chez Suzalink ?",
          a: "Le sprint test coûte 990 € HT pour deux semaines, déduits si vous continuez. La mission mensuelle coûte 1 290 € HT par mois plus 100 € HT par RDV honoré. Sur les cibles déjà prouvées, vous pouvez ne payer que les RDV honorés, de 180 à 300 € HT selon la cible.",
        },
        {
          q: "Combien de RDV puis-je attendre ?",
          a: "Cela dépend de votre cible, de votre offre et de la qualité du fichier. Nous ne promettons pas de chiffre avant d'avoir appelé : c'est exactement à ça que sert le sprint test. À la fin, vous connaissez le coût réel d'un RDV sur votre marché.",
        },
        {
          q: "Qui appelle mes prospects ?",
          a: "Un SDR de l'équipe Suzali Conseil, dédié à votre mission, formé à votre offre et à votre script. Il appelle en français, depuis notre CRM. Si un jour il change de mission, son remplaçant reprend avec tout l'historique.",
        },
        {
          q: "Puis-je écouter les appels ?",
          a: "Oui. Chaque appel est enregistré et consultable dans votre portail client le jour même, avec le résultat de l'appel et les notes du SDR.",
        },
        {
          q: "Que se passe-t-il si un RDV n'est pas honoré ?",
          a: "Un RDV non honoré, ou pris avec quelqu'un hors de la cible définie ensemble, est remplacé sous 14 jours sans frais.",
        },
        {
          q: "Est-ce conforme au RGPD ?",
          a: "Nous appelons des professionnels sur leurs coordonnées professionnelles, au sujet de leur activité. Chaque personne peut refuser d'être rappelée : son refus est enregistré dans le CRM et respecté sur toutes les missions.",
        },
      ],
    },
    {
      kind: "links",
      id: "a-lire",
      eyebrow: "À voir aussi",
      title: "Pour aller plus loin",
      items: [
        { label: "Tarifs", href: "/tarifs", body: "Toutes nos offres de prospection et de CRM, prix publics." },
        { label: "Prospection des cabinets dentaires", href: "/secteurs/cabinets-dentaires", body: "Ce que nous avons appris en appelant des milliers de cabinets." },
        { label: "Guide : externaliser sa prospection", href: "/guides/externaliser-prospection-commerciale", body: "Quand le faire, combien ça coûte, les pièges à éviter." },
        { label: "Prix d'un RDV qualifié", href: "/guides/prix-rdv-qualifie", body: "Forfait, paiement au RDV, coût interne : le calcul complet." },
        { label: "CRM pour agences", href: "/crm-agence-prospection", body: "Vous avez votre propre équipe ? Utilisez notre CRM à votre marque." },
        { label: "Passer le barrage secrétaire", href: "/guides/barrage-secretaire", body: "Les phrases et les horaires qui marchent, tirés de nos appels." },
      ],
    },
    {
      kind: "cta",
      id: "commencer",
      eyebrow: "Sprint test",
      title: "Deux semaines pour juger sur pièces",
      intro: "990 € HT, déduits si vous continuez. À la fin, vous avez des RDV, les enregistrements et un chiffre clair : ce que vous coûte un RDV sur votre cible.",
      primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
      secondary: { label: "Voir les tarifs", href: "/tarifs" },
    },
  ],
};
