/**
 * Réglages globaux du site : nom, URL, SEO, barre d'annonce, navigation, pied de page.
 * Les liens marqués TODO pointent vers des pages qui n'existent pas encore.
 */

export type NavLink = { label: string; href: string };

export const site = {
  name: "Captain Soft",
  /** URL publique, utilisée pour le SEO, le sitemap et l'image de partage. TODO : domaine définitif. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://captainsoft.fr",
  locale: "fr_FR",
  lang: "fr",

  seo: {
    title: "Captain Soft — Le CRM d'exécution outbound",
    titleTemplate: "%s · Captain Soft",
    description:
      "Le CRM d'exécution outbound qui réunit appels, emails, séquences et IA dans une instance dédiée. Téléphonie Allo et OnOff, fiche de RDV générée par l'IA, dès 59 € HT par mois.",
    ogImageAlt: "Captain Soft — Votre prospection. Vos règles.",
  },

  /** Lien « Se connecter ». TODO : URL de l'application. */
  loginUrl: "https://app.captainsoft.fr",
  /** Toutes les actions « Demander une démo » mènent ici. */
  demoHref: "/demo",
  demoLabel: "Demander une démo",
  loginLabel: "Se connecter",

  announcement: {
    badge: "Nouveau",
    text: "L'IA génère votre fiche de RDV en 10 secondes",
    href: "/#ia",
  },

  nav: [
    { label: "Produit", href: "/#produit" },
    { label: "Solutions", href: "/#roles" },
    { label: "Tarifs", href: "/#tarifs" },
    { label: "Ressources", href: "/#cas-clients" },
    { label: "Sécurité", href: "/#securite" },
  ] satisfies NavLink[],

  footer: {
    tagline: "Le CRM d'exécution outbound. Appels, emails, séquences et IA dans une instance dédiée.",
    columns: [
      {
        title: "Produit",
        links: [
          { label: "Exécution", href: "/#execution" },
          { label: "IA", href: "/#ia" },
          { label: "Instance dédiée", href: "/#instance" },
          { label: "Tarifs", href: "/#tarifs" },
        ],
      },
      {
        title: "Solutions",
        links: [
          { label: "SDR", href: "/#roles" },
          { label: "Managers", href: "/#roles" },
          { label: "Business Developers", href: "/#roles" },
          { label: "Portail client", href: "/#roles" },
        ],
      },
      {
        title: "Ressources",
        links: [
          { label: "Cas clients", href: "/#cas-clients" },
          { label: "Comparatif des coûts", href: "/#cout" },
          { label: "Demander une démo", href: "/demo" },
        ],
      },
      {
        title: "Entreprise",
        links: [
          { label: "Sécurité", href: "/#securite" },
          { label: "Contact", href: "/demo" },
        ],
      },
      {
        title: "Légal",
        // TODO : créer ces pages avant la mise en ligne.
        links: [
          { label: "Mentions légales", href: "#" },
          { label: "Confidentialité", href: "#" },
          { label: "CGV", href: "#" },
          { label: "Cookies", href: "#" },
        ],
      },
    ],
    // TODO : renseigner les vrais comptes.
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
    copyright: "Captain Soft. Tous droits réservés.",
  },
} as const;
