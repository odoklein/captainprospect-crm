/**
 * Menu principal (desktop : panneaux déroulants ; mobile : accordéons).
 * Chaque lien pointe vers une page qui existe : n'ajoutez un lien que si la page est en ligne.
 */
import type { IconName } from "@/components/ui/Icon";

export type MenuLink = { label: string; href: string; body?: string; icon?: IconName; /** Aperçu (cartes uniquement), fichier de public/visuals/. */ image?: string };
export type MenuFeature = { label: string; href: string; body: string; image: string; tag: string };

export type MenuItem =
  | { label: string; href: string }
  | {
      label: string;
      /** Colonnes de liens, chacune avec un titre. */
      columns: Array<{ title: string; links: MenuLink[]; layout?: "list" | "cards" }>;
      /** Carte mise en avant, à droite du panneau. */
      feature?: MenuFeature;
      /** Liens secondaires, en bas du panneau. */
      footer?: MenuLink[];
    };

export const menu: MenuItem[] = [
  {
    label: "Produit",
    columns: [
      {
        title: "Deux façons de travailler",
        layout: "cards",
        links: [
          { label: "Suzalink Prospection", href: "/prospection-externalisee", body: "Nos SDR prennent vos RDV. Chaque appel est enregistré et visible.", icon: "phone", image: "/visuals/mission-semaine.webp" },
          { label: "Suzalink CRM", href: "/crm-agence-prospection", body: "Votre équipe appelle avec notre CRM, à votre marque.", icon: "grid", image: "/visuals/marque-blanche.webp" },
        ],
      },
    ],
    feature: {
      tag: "Dans le CRM",
      label: "La fiche de RDV rédigée par l'IA",
      href: "/prospection-externalisee#fiche-rdv",
      body: "Besoin, budget, décideur, objections : prête avant le premier échange.",
      image: "/visuals/fiche-rdv-ia.webp",
    },
    footer: [
      { label: "Sécurité et instance dédiée", href: "/#securite", icon: "shield" },
      { label: "Téléphonie Allo et OnOff", href: "/#execution", icon: "waveform" },
      { label: "Intelligence artificielle", href: "/#ia", icon: "sparkle" },
    ],
  },
  {
    label: "Solutions",
    columns: [
      {
        title: "Par besoin",
        links: [
          { label: "Des RDV sans recruter", href: "/prospection-externalisee", icon: "calendar" },
          { label: "Tester un nouveau marché", href: "/tarifs#sprint", icon: "target" },
          { label: "Équiper mon agence", href: "/crm-agence-prospection", icon: "building" },
          { label: "Piloter mes SDR", href: "/#roles", icon: "chart" },
        ],
      },
      {
        title: "Par secteur",
        links: [
          { label: "Cabinets dentaires", href: "/secteurs/cabinets-dentaires", icon: "tooth" },
          { label: "Tous les secteurs", href: "/secteurs", icon: "map" },
          { label: "Tester mon secteur en 2 semaines", href: "/tarifs#sprint", icon: "target" },
        ],
      },
      {
        title: "Par organisation",
        layout: "cards",
        links: [
          { label: "PME", href: "/prospection-externalisee", body: "Des RDV qualifiés sans embaucher, avec un test de deux semaines.", icon: "briefcase" },
          { label: "Agences de prospection", href: "/crm-agence-prospection", body: "Un CRM à votre marque, avec portail client.", icon: "building" },
          { label: "Équipes SDR", href: "/#roles", body: "File d'appels, résultat en un clic, IA intégrée.", icon: "users" },
        ],
      },
    ],
  },
  {
    label: "Ressources",
    columns: [
      {
        title: "Guides",
        links: [
          { label: "Externaliser sa prospection", href: "/guides/externaliser-prospection-commerciale", icon: "book" },
          { label: "Prix d'un RDV qualifié", href: "/guides/prix-rdv-qualifie", icon: "chart" },
          { label: "Passer le barrage secrétaire", href: "/guides/barrage-secretaire", icon: "phone" },
          { label: "Tous les guides", href: "/guides", icon: "grid" },
        ],
      },
      {
        title: "Entreprise",
        links: [
          { label: "À propos", href: "/a-propos", icon: "users" },
          { label: "Suzali Conseil", href: "https://suzaliconseil.com", icon: "building" },
          { label: "Contact", href: "/demo", icon: "mail" },
        ],
      },
    ],
    feature: {
      tag: "Cas client",
      label: "147 RDV terrain en deux mois",
      href: "/secteurs/cabinets-dentaires",
      body: "Notre mission vers les cabinets dentaires, chiffres à l'appui.",
      image: "/visuals/tournees-dentaires.webp",
    },
  },
  { label: "Tarifs", href: "/tarifs" },
];
