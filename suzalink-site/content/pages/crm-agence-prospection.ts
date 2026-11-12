/**
 * Page /crm-agence-prospection : le CRM Suzalink pour les agences de prospection (marque blanche).
 * Mot-clé principal : « CRM agence de prospection ». Secondaires : « CRM marque blanche »,
 * « logiciel de prospection téléphonique », « portail client agence ».
 * Fonctions citées : uniquement celles du produit (voir content/home.ts et l'app).
 */
import type { LandingPage } from "./types";

export const crmAgencePage: LandingPage = {
  path: "/crm-agence-prospection",
  meta: {
    title: "CRM pour agence de prospection, en marque blanche",
    description:
      "Le CRM des agences de prospection : téléphonie, enregistrements, IA et portail client à votre marque. Domaine, logo, couleurs. Dès 419 € HT par mois.",
  },
  breadcrumb: "CRM pour agences",
  hero: {
    eyebrow: "CRM pour agences de prospection",
    title: "Le CRM de votre agence, à votre marque",
    lead: "Vos SDR appellent, vos clients suivent leurs RDV dans un portail à vos couleurs. Nous l'utilisons chaque jour pour nos propres missions : chaque fonction est née d'un problème de terrain.",
    primary: { label: "Voir le CRM à vos couleurs", href: "/demo?offre=medium-business" },
    secondary: { label: "Voir les tarifs", href: "/tarifs#crm" },
    bullets: [
      "Votre domaine, votre logo, vos couleurs",
      "Portail client inclus",
      "Téléphonie Allo et OnOff, appels enregistrés",
      "Une instance et une base par agence",
    ],
  },
  blocks: [
    {
      kind: "pains",
      id: "constat",
      eyebrow: "Le quotidien d'une agence",
      title: "Vendre des RDV, c'est aussi les prouver",
      items: [
        {
          title: "Un outil par besoin",
          body: "Un CRM, une téléphonie, un outil d'enregistrement, des séquences, un tableur pour le client. Chaque abonnement se paie par commercial, et rien ne se parle.",
        },
        {
          title: "Des clients qui veulent voir",
          body: "« Combien d'appels cette semaine ? Qu'est-ce qu'ils ont répondu ? » Sans portail, chaque question devient un export et un email.",
        },
        {
          title: "Des SDR sur plusieurs missions",
          body: "Le matin pour un client, l'après-midi pour un autre. Si l'outil ne suit pas, on mélange les scripts, les fichiers et les rappels.",
        },
        {
          title: "Le rapport du vendredi",
          body: "Des heures à compiler des chiffres à la main, pour un document que le client lit en deux minutes.",
        },
      ],
    },
    {
      kind: "features",
      id: "fonctions",
      eyebrow: "Ce que fait le CRM",
      title: "Tout ce qu'une agence utilise, dans un seul outil",
      items: [
        { icon: "users", title: "Portail client", body: "Chaque client voit ses RDV, ses enregistrements et ses rapports. Rien d'autre, et sans vous écrire." },
        { icon: "sparkle", title: "Marque blanche", body: "Votre domaine, votre logo, vos couleurs. Vos clients ne voient que votre agence." },
        { icon: "phone", title: "Téléphonie intégrée", body: "Allo et OnOff avec vos numéros. Le SDR appelle depuis la file, sans changer d'écran." },
        { icon: "waveform", title: "Call Vault", body: "Chaque appel enregistré dans votre stockage privé. Écoute et partage en un clic." },
        { icon: "mail", title: "Fiche de RDV par l'IA", body: "Dès qu'un RDV est pris, l'IA rédige la fiche : besoin, budget, objections. Le SDR relit et confirme." },
        { icon: "chart", title: "Pilotage en direct", body: "Appels, RDV et rythme de chaque SDR, mission par mission. L'agent signale qui prend du retard." },
        { icon: "arrowUpRight", title: "Plusieurs missions par SDR", body: "Un SDR passe d'une mission à l'autre sans planning imposé. Scripts, listes et rappels suivent la mission." },
        { icon: "check", title: "RDV sans agenda client", body: "Votre client n'a pas de calendrier connecté ? Le SDR pose quand même le RDV, et le client le retrouve dans son portail." },
        { icon: "lock", title: "Instance dédiée", body: "Une instance et une base de données par agence. Vos données ne côtoient jamais celles d'une autre." },
      ],
    },
    {
      kind: "proof",
      id: "terrain",
      eyebrow: "Construit sur le terrain",
      title: "Nous sommes notre premier client",
      intro: "Suzali Conseil fait tourner ses propres missions de prospection sur Suzalink, tous les jours.",
      stats: [
        { value: "≈ 20", label: "SDR qui l'utilisent au quotidien" },
        { value: "5 à 10", label: "missions menées en parallèle" },
        { value: "5 174", label: "appels sur une seule campagne dentaire, fin 2025" },
        { value: "1", label: "instance et une base par agence cliente" },
      ],
      story:
        "Chaque fonction du CRM vient d'un problème rencontré en mission : les SDR qui changent de client dans la journée, les clients sans agenda partagé, les numéros faux qu'il faut écarter avant d'appeler.",
      note: "Chiffres internes Suzali Conseil, novembre 2026.",
    },
    {
      kind: "steps",
      id: "mise-en-service",
      eyebrow: "Mise en service",
      title: "De la signature au premier appel",
      items: [
        { title: "Votre instance", body: "On crée votre instance à votre domaine, avec votre logo et vos couleurs." },
        { title: "Vos missions", body: "On importe vos clients, vos listes et vos scripts." },
        { title: "Vos lignes", body: "On branche Allo ou OnOff avec vos numéros." },
        { title: "Vos SDR", body: "Une session de prise en main, sur vos vraies missions." },
        { title: "Vos clients", body: "Vous ouvrez le portail à vos clients, quand vous êtes prêts." },
      ],
    },
    {
      kind: "faq",
      id: "faq",
      eyebrow: "Questions fréquentes",
      title: "Ce que les agences nous demandent",
      items: [
        {
          q: "Combien coûte le CRM pour une agence ?",
          a: "L'offre Medium Business coûte 419 € HT par mois en annuel (499 € HT en mensuel) pour 8 utilisateurs, avec la marque blanche et le portail client. Chaque utilisateur supplémentaire coûte 39 € HT par mois. Le déploiement accompagné coûte 750 € HT, une fois.",
        },
        {
          q: "Mes clients verront-ils le nom Suzalink ?",
          a: "Non. Avec la marque blanche, le CRM et le portail client utilisent votre domaine, votre logo et vos couleurs.",
        },
        {
          q: "Suzalink fait aussi de la prospection. Mes données sont-elles en sécurité ?",
          a: "Oui. Chaque agence a sa propre instance et sa propre base de données. L'équipe Suzalink Prospection n'a aucun accès à vos données et ne les utilise jamais. C'est un engagement écrit dans votre contrat.",
        },
        {
          q: "Quelle téléphonie puis-je utiliser ?",
          a: "Allo et OnOff sont intégrés nativement, avec vos propres numéros. Les appels sont enregistrés dans Call Vault.",
        },
        {
          q: "Puis-je importer mes données actuelles ?",
          a: "Oui. Nous importons vos clients, contacts, listes et historiques lors du déploiement.",
        },
      ],
    },
    {
      kind: "links",
      id: "a-lire",
      eyebrow: "À voir aussi",
      title: "Pour aller plus loin",
      items: [
        { label: "Tarifs du CRM", href: "/tarifs#crm", body: "Indépendant, Small Business, Medium Business : tout est public." },
        { label: "Le produit en détail", href: "/#produit", body: "File d'appels, IA, journal d'appels et portail client." },
        { label: "Sécurité", href: "/#securite", body: "Instance dédiée, base isolée, rôles et permissions." },
      ],
    },
    {
      kind: "cta",
      id: "demo",
      eyebrow: "Démo",
      title: "Voyez le CRM à vos couleurs",
      intro: "Envoyez-nous votre logo : la démo se fait sur une instance à votre marque, avec une mission qui ressemble aux vôtres.",
      primary: { label: "Demander une démo", href: "/demo?offre=medium-business" },
      secondary: { label: "Voir les tarifs", href: "/tarifs#crm" },
    },
  ],
};
