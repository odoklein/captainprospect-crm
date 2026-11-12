/**
 * Pages /secteurs/<cible> : une page par cible de mission.
 * Règle : une page secteur ne sort QUE si elle contient des données réelles de nos missions.
 * Pour en ajouter une, ajoutez une entrée à `sectors` : la route, le sitemap et le menu suivent.
 *
 * Cabinets dentaires : mission nov.–déc. 2025 (Drive « LES RDV » : 147 RDV, 36 boîtes, 20+ départements ;
 * 5 174 appels, 50 % sans réponse, 9 % de numéros faux) et fichier national nettoyé en 2026 (6 732 cabinets).
 */
import type { LandingPage } from "./types";

export type Sector = LandingPage & { slug: string; /** Nom court pour les listes et le menu. */ name: string };

export const sectors: Sector[] = [
  {
    slug: "cabinets-dentaires",
    name: "Cabinets dentaires",
    path: "/secteurs/cabinets-dentaires",
    parent: { label: "Prospection externalisée", href: "/prospection-externalisee" },
    meta: {
      title: "Prospection des cabinets dentaires par téléphone",
      description:
        "Vous vendez aux cabinets dentaires ? Nos SDR obtiennent l'accord de l'assistante et remplissent vos tournées. 147 RDV terrain sur une mission de fin 2025.",
    },
    breadcrumb: "Cabinets dentaires",
    updated: "2026-11-12",
    hero: {
      eyebrow: "Secteur · Cabinets dentaires",
      title: "Joignez les cabinets dentaires, pas seulement leur répondeur",
      lead: "Dans un cabinet, la personne qui décroche est presque toujours l'assistante. C'est souvent elle qui dit oui. Nos SDR savent lui parler, au bon moment, avec une demande qu'elle peut accepter seule.",
      primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
      secondary: { label: "Voir la méthode", href: "#ce-qui-marche" },
      visual: {
        src: "/visuals/tournees-dentaires.webp",
        alt: "Illustration : carte de France des tournées, avec les départements où des RDV et des boîtes de collecte ont été obtenus.",
        width: 1254,
        height: 1254,
      },
    },
    blocks: [
      {
        kind: "answer",
        question: "Comment prospecter les cabinets dentaires par téléphone ?",
        answer:
          "Appelez hors des heures de soins, parlez d'abord à l'assistante, qui gère l'agenda et les fournisseurs, et proposez une demande simple qu'elle peut accepter seule, comme le passage d'un commercial. Rappelez à d'autres heures les cabinets non joints et groupez les RDV par département pour remplir des tournées.",
        facts: [
          "**147 RDV** terrain en deux mois, fin 2025",
          "**36 boîtes de collecte** acceptées",
          "Plus de **20 départements** couverts",
          "Fichier national nettoyé : **6 732 cabinets**",
        ],
      },
      {
        kind: "proof",
        id: "mission",
        eyebrow: "Notre mission de référence",
        title: "Deux mois d'appels vers les cabinets dentaires",
        intro: "Fin 2025, un client devait faire accepter le passage de son commercial terrain dans des cabinets de toute la France.",
        stats: [
          { value: "5 174", label: "appels passés" },
          { value: "147", label: "RDV pris pour le commercial terrain" },
          { value: "36", label: "cabinets d'accord pour une boîte de collecte" },
          { value: "20+", label: "départements, du Nord aux Alpes-Maritimes" },
        ],
        story:
          "La moitié des appels n'a jamais abouti et 9 % des numéros étaient faux. C'est pour ça que chaque cabinet non joint est rappelé à un autre moment de la journée, et que le fichier est nettoyé avant de commencer.",
        note: "Client anonymisé. Chiffres issus de notre suivi de mission, novembre et décembre 2025.",
      },
      {
        kind: "pains",
        id: "ce-qui-marche",
        eyebrow: "Ce que nous avons appris",
        title: "Quatre choses qui changent tout avec un cabinet",
        items: [
          {
            title: "Parler à l'assistante, pas la contourner",
            body: "Elle gère l'agenda, le courrier et les fournisseurs. Dans nos notes d'appel, c'est elle qui accepte le passage du commercial, le plus souvent sans consulter le praticien.",
          },
          {
            title: "Appeler hors des soins",
            body: "En début de matinée ou de début d'après-midi. Beaucoup de cabinets ferment le mercredi ou finissent plus tôt le vendredi : nos SDR notent les horaires de chaque cabinet dans le CRM.",
          },
          {
            title: "Demander peu, et concret",
            body: "« Notre commercial peut-il passer déposer une boîte ? » est plus facile à accepter qu'« un RDV de trente minutes ». Sur notre mission, 36 cabinets ont dit oui à la boîte.",
          },
          {
            title: "Grouper les RDV par tournée",
            body: "Un commercial terrain ne traverse pas la France pour un RDV. Nous appelons département par département pour remplir des tournées entières.",
          },
        ],
      },
      {
        kind: "features",
        id: "pour-qui",
        eyebrow: "Pour qui",
        title: "Vous vendez aux cabinets dentaires",
        items: [
          { icon: "users", title: "Laboratoires de prothèse", body: "Faire connaître le labo, obtenir un premier envoi ou une visite." },
          { icon: "server", title: "Fournisseurs et distributeurs", body: "Matériel, consommables, équipement : décrocher la visite du commercial." },
          { icon: "sparkle", title: "Récupération de métaux précieux", body: "Couronnes et alliages usagés : faire accepter une boîte de collecte." },
          { icon: "database", title: "Logiciels de cabinet", body: "Agenda, facturation, imagerie : obtenir une démo avec le praticien." },
          { icon: "chart", title: "Services aux praticiens", body: "Expertise comptable, assurance, financement : un RDV au bon moment." },
          { icon: "mail", title: "Formation continue", body: "Remplir une session ou un webinaire avec des praticiens ciblés." },
        ],
      },
      {
        kind: "faq",
        id: "faq",
        eyebrow: "Questions fréquentes",
        title: "Prospecter les cabinets dentaires",
        items: [
          {
            q: "À quelle heure appeler un cabinet dentaire ?",
            a: "En dehors des soins : en début de matinée ou en début d'après-midi. Évitez les mercredis et les fins de vendredi, souvent fermés ou écourtés. Le plus fiable reste de noter les horaires de chaque cabinet dès le premier appel.",
          },
          {
            q: "Faut-il parler au dentiste ou à l'assistante ?",
            a: "À l'assistante d'abord. Elle gère l'agenda et les fournisseurs, et sur notre mission de 2025 c'est elle qui a accepté la plupart des passages. Le praticien entre en jeu quand l'achat engage le cabinet.",
          },
          {
            q: "Où trouver un fichier de cabinets dentaires ?",
            a: "Les annuaires publics de praticiens sont un bon point de départ, mais ils contiennent des doublons et des numéros périmés. Nous nettoyons le fichier avant d'appeler : sur un fichier national, il nous est resté 6 732 cabinets à joindre.",
          },
          {
            q: "Combien coûte une campagne vers les cabinets dentaires ?",
            a: "Le sprint test coûte 990 € HT pour deux semaines. Comme nous connaissons cette cible, l'offre 100 % résultat est aussi possible : vous ne payez que les RDV honorés.",
          },
        ],
      },
      {
        kind: "cta",
        id: "commencer",
        eyebrow: "Sprint test",
        title: "Testez sur vos départements",
        intro: "Donnez-nous votre zone et votre offre. En deux semaines, vous savez combien de cabinets acceptent votre commercial, et à quel coût.",
        primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
        secondary: { label: "Voir les offres", href: "/tarifs" },
      },
    ],
  },
];

export const findSector = (slug: string) => sectors.find((s) => s.slug === slug);
