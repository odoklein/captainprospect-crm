/**
 * Réglages globaux du site : nom, URL, SEO, barre d'annonce, navigation, pied de page.
 * Les liens qui valent "#" ne sont pas affichés tant qu'ils n'ont pas de vraie adresse.
 */

export type NavLink = { label: string; href: string };

export const site = {
  name: "Suzalink",
  /** URL publique (suzalink.com), utilisée pour le SEO, le sitemap et l'image de partage. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://suzalink.com",
  locale: "fr_FR",
  lang: "fr",

  seo: {
    title: "Suzalink : RDV B2B qualifiés et CRM de prospection",
    titleTemplate: "%s · Suzalink",
    description:
      "Nos SDR prennent vos RDV B2B, ou votre équipe appelle avec notre CRM : téléphonie, appels enregistrés, IA et portail client. Une marque de Suzali Conseil.",
    ogImageAlt: "Suzalink : votre prospection, vos règles.",
  },

  /** Lien « Se connecter » : le CRM (app.suzalink.com). */
  loginUrl: "https://app.suzalink.com",
  /** Toutes les actions « Demander une démo » mènent ici. */
  demoHref: "/demo",
  demoLabel: "Demander une démo",
  loginLabel: "Se connecter",

  announcement: {
    badge: "Nouveau",
    text: "Sprint test : 2 semaines de prospection pour juger sur pièces",
    href: "/tarifs#sprint",
  },

  // Menu principal : content/menu.ts


  footer: {
    tagline: "Des RDV B2B pris par nos SDR, ou le CRM pour les prendre vous-même.",
    /** Maison mère : affichée sous le logo et dans les données structurées. */
    parent: { name: "Suzali Conseil", url: "https://suzaliconseil.com", label: "Une marque de Suzali Conseil" },
    columns: [
      {
        title: "Offres",
        links: [
          { label: "Prospection externalisée", href: "/prospection-externalisee" },
          { label: "Sprint test", href: "/tarifs#sprint" },
          { label: "CRM pour agences", href: "/crm-agence-prospection" },
          { label: "Tarifs", href: "/tarifs" },
        ],
      },
      {
        title: "Produit",
        links: [
          { label: "Exécution", href: "/#execution" },
          { label: "IA", href: "/#ia" },
          { label: "Instance dédiée", href: "/#instance" },
          { label: "Portail client", href: "/#roles" },
        ],
      },
      {
        title: "Guides",
        links: [
          { label: "Tous les guides", href: "/guides" },
          { label: "Externaliser sa prospection", href: "/guides/externaliser-prospection-commerciale" },
          { label: "Prix d'un RDV qualifié", href: "/guides/prix-rdv-qualifie" },
          { label: "Barrage secrétaire", href: "/guides/barrage-secretaire" },
          { label: "Script d'appel", href: "/guides/script-appel-prospection" },
          { label: "Prospection B2B et RGPD", href: "/guides/prospection-telephonique-b2b-rgpd" },
          { label: "Le métier de SDR", href: "/guides/sdr-business-developer" },
        ],
      },
      {
        title: "Secteurs",
        links: [
          { label: "Tous les secteurs", href: "/secteurs" },
          { label: "Cabinets dentaires", href: "/secteurs/cabinets-dentaires" },
          { label: "Industrie", href: "/secteurs/industrie" },
          { label: "Transport et logistique", href: "/secteurs/transport-logistique" },
          { label: "Éditeurs de logiciels", href: "/secteurs/editeurs-logiciels-saas" },
          { label: "Directions financières", href: "/interlocuteurs/directions-financieres" },
          { label: "Dirigeants de PME", href: "/interlocuteurs/dirigeants-pme" },
        ],
      },
      {
        title: "Entreprise",
        links: [
          { label: "À propos", href: "/a-propos" },
          { label: "Suzali Conseil", href: "https://suzaliconseil.com" },
          { label: "Sécurité", href: "/#securite" },
          { label: "Contact", href: "/demo" },
        ],
      },
      {
        title: "Légal",
        // Textes dans content/pages/legal.ts. TODO : CGV à rédiger ; tant qu'un lien vaut "#", il n'est pas affiché.
        links: [
          { label: "Mentions légales", href: "/mentions-legales" },
          { label: "Confidentialité", href: "/confidentialite" },
          { label: "Cookies", href: "/confidentialite#cookies" },
          { label: "CGV", href: "#" },
        ],
      },
    ],
    // TODO : renseigner les vrais comptes. Tant qu'un lien vaut "#", il n'est pas affiché.
    socials: [
      { label: "LinkedIn", href: "#", icon: "linkedin" },
      { label: "YouTube", href: "#", icon: "youtube" },
    ],
    languages: {
      label: "Langue",
      current: "FR",
      // La version anglaise n'existe pas encore : le bouton EN est désactivé.
      other: { code: "EN", note: "English version coming soon" },
    },
    copyright: "Suzalink, une marque de Suzali Conseil. Tous droits réservés.",
  },
} as const;
