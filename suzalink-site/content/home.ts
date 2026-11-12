/**
 * Tous les textes de la page d'accueil, section par section (dans l'ordre de la page).
 *
 * Règles éditoriales :
 * - chaque section : un eyebrow, un titre de 8 mots maximum, 1 à 2 lignes de texte, une seule action ;
 * - chaque affirmation correspond à une fonctionnalité réelle du produit ;
 * - aucun chiffre, logo ou témoignage inventé : les emplacements « Placeholder » / « TODO » sont à remplacer ;
 *   les logos clients (réels) sont dans content/brands.ts.
 *
 * Les prix sont dans content/pricing.ts, les photos dans content/images.ts.
 */

export type Action = { label: string; href: string };

export const hero = {
  eyebrow: "CRM d'exécution outbound",
  /** Pill above the title: who Suzalink is for. */
  audience: "Agences de prospection et équipes SDR",
  titleLines: ["Votre prospection.", "Vos règles."],
  subtitle:
    "Le CRM d'exécution outbound qui réunit appels, emails, séquences et IA dans une instance dédiée.",
  primary: { label: "Demander une démo", href: "/demo" },
  secondary: { label: "Voir les tarifs", href: "/#tarifs" },
  mockupLabel:
    "Aperçu de l'espace SDR : file d'appels, fiche du contact en cours, résultats en un clic et bouton Appel suivant.",
};

export const logos = {
  eyebrow: "Références",
  title: "Ils prospectent avec Suzalink",
  subtitle: "Agences de prospection et centres d'appels B2B.",
  action: { label: "Lire les cas clients", href: "/#cas-clients" },
  // La liste des clients et leurs logos : content/brands.ts
};

export const features = {
  eyebrow: "Fonctionnalités",
  title: "Tout ce qu'il faut pour appeler plus.",
  /** Description of the whole grid for screen readers (the cards are UI illustrations). */
  label:
    "Aperçu des fonctionnalités : file d'appels, résultat en une touche, résumé et résultat proposés par l'IA, journal d'appels avec enregistrements, portail client avec les RDV de la semaine.",
  queue: { title: "File d'appels", body: "Le prochain prospect arrive tout seul." },
  keys: { title: "Résultat en 1 touche", body: "Qualifiez l'appel sans quitter le clavier." },
  ai: { title: "Résumé et résultat par l'IA", body: "Un résumé automatique et un résultat suggéré, à confirmer." },
  journal: { title: "Journal d'appels", body: "Suivez l'activité, écoutez les appels et mesurez la qualité des échanges." },
  portal: { title: "Portail client", body: "Vos clients voient leurs rendez-vous, à jour, sans vous écrire." },
};

export const aiSplit = {
  eyebrow: "IA intégrée",
  title: "L'IA au service de vos SDRs, pas l'inverse",
  subtitle:
    "L'IA prépare la fiche de RDV, résume la journée et signale les urgences. Vos SDRs gardent la main sur chaque appel.",
  action: { label: "Découvrir l'IA", href: "/#ia" },
};

export const engines = {
  eyebrow: "Plateforme",
  title: "Une plateforme, trois moteurs",
  subtitle:
    "L'exécution, l'intelligence et l'infrastructure d'une équipe outbound, réunies dans un seul outil.",
  action: { label: "Demander une démo", href: "/demo" },
  items: [
    {
      id: "execution",
      index: "01",
      eyebrow: "Exécution",
      title: "Appelez plus, cliquez moins.",
      body: "La file d'appels enchaîne les contacts. Le SDR qualifie, note et passe au suivant sans quitter l'écran.",
      features: [
        "File d'appels : résultat en 1 clic, puis appel suivant",
        "Téléphonie native Allo et OnOff, avec vos numéros",
        "Call Vault : enregistrements dans votre stockage S3 privé",
      ],
      /** Logos affichés sous la liste (identifiants de content/brands.ts). */
      integrations: { label: "Téléphonie intégrée", tools: ["allo", "onoff"] },
      tone: "navy",
      mockupLabel: "Aperçu : appel en cours avec résultats en un clic, et Call Vault listant les enregistrements.",
    },
    {
      id: "ia",
      index: "02",
      eyebrow: "Intelligence artificielle",
      title: "L'IA prépare, résume et alerte.",
      body: "Dès qu'un RDV est pris, l'IA rédige la fiche pour le closer. Chaque matin, elle résume les priorités.",
      features: [
        "Fiche de RDV automatique : BANT, budget, objections",
        "Digest du matin : les priorités de la journée",
        "Agent de veille : clients à risque, SDRs en retard sur leur rythme",
      ],
      tone: "night",
      mockupLabel: "Aperçu : fiche de RDV générée par l'IA, digest du matin et alertes de l'agent.",
    },
    {
      id: "instance",
      index: "03",
      eyebrow: "Instance dédiée",
      title: "Votre CRM, votre instance.",
      body: "Chaque client a sa propre instance et sa propre base. Vos données ne côtoient jamais celles d'un autre.",
      features: [
        "Single-tenant : une instance par client",
        "Base PostgreSQL isolée",
        "Marque blanche : domaine, logo et couleurs",
        "Rôles et permissions par profil",
      ],
      tone: "light",
      mockupLabel: "Aperçu : réglages de l'instance, marque blanche et tableau des rôles et permissions.",
    },
  ],
} as const;

export const roles = {
  eyebrow: "Par rôle",
  title: "Pensé pour chaque rôle",
  subtitle: "Chaque profil ouvre l'écran dont il a besoin, rien de plus.",
  action: { label: "Demander une démo", href: "/demo" },
  tabs: [
    {
      id: "sdr",
      label: "SDR",
      title: "Une file, un clic, l'appel suivant.",
      body: "La file se charge seule. Le SDR qualifie en un clic et enchaîne, emails et séquences à portée de main.",
      mockupLabel: "Aperçu de l'écran SDR : file d'appels et résultats en un clic.",
    },
    {
      id: "manager",
      label: "Manager",
      title: "Le rythme de l'équipe, en direct.",
      body: "Appels, RDV et rythme de chaque SDR sur un seul tableau. L'agent signale qui prend du retard.",
      mockupLabel: "Aperçu du tableau de bord manager : indicateurs du jour et rythme par SDR.",
    },
    {
      id: "bd",
      label: "Business Developer",
      title: "Chaque RDV arrive préparé.",
      body: "La fiche de RDV résume le besoin, le budget et les objections avant même le premier échange.",
      mockupLabel: "Aperçu de la fiche de RDV générée par l'IA.",
    },
    {
      id: "client",
      label: "Client",
      title: "Vos clients suivent, sans coulisses.",
      body: "Un portail en marque blanche : RDV pris, enregistrements et rapports, rien d'autre.",
      mockupLabel: "Aperçu du portail client en marque blanche : RDV, enregistrements et rapport.",
    },
  ],
} as const;

export const stack = {
  eyebrow: "Coût total",
  title: "Le stack morcelé vous coûte 4×",
  subtitle:
    "CRM, téléphonie, analyse d'appels, séquences : un abonnement par outil et par commercial. Suzalink réunit tout.",
  action: { label: "Comparer les offres", href: "/#tarifs" },
  bigNumberCaption: "HT par utilisateur et par mois, appels, emails, séquences et IA compris.",
  tableCaption: "Coût d'un stack de prospection classique, par utilisateur et par mois",
  columns: { tool: "Outil", use: "Usage", price: "Prix / utilisateur / mois" },
  totalLabel: "Total du stack",
  oursLabel: "Suzalink",
  oursUse: "Tout-en-un",
};

export const cases = {
  eyebrow: "Cas clients",
  title: "Pourquoi les équipes nous font confiance",
  subtitle: "Trois façons de prospecter, une même plateforme. Les cas détaillés arrivent bientôt.",
  action: { label: "Voir tous les cas clients", href: "#" }, // TODO : page cas clients
  placeholderBadge: "Placeholder",
  readLabel: "Lire",
  // TODO : remplacer les « XX » par des résultats réels, validés par écrit avec chaque client.
  items: [
    { image: "caseAgency", eyebrow: "Agence de prospection", title: "XX SDRs pilotés sur une seule instance", href: "#" },
    { image: "caseSmb", eyebrow: "PME B2B", title: "+XX % de RDV qualifiés en XX jours", href: "#" },
    { image: "caseFreelance", eyebrow: "SDR indépendant", title: "XX appels par jour, sans changer d'outil", href: "#" },
  ],
} as const;

export const testimonial = {
  eyebrow: "Témoignage",
  placeholderBadge: "Placeholder",
  // TODO : remplacer par une citation réelle, validée par écrit avant publication.
  quote:
    "Emplacement réservé à un témoignage client. Remplacez ce texte par une citation réelle et validée.",
  name: "Prénom Nom",
  role: "Poste, Entreprise",
  logoLabel: "Logo client",
  action: { label: "Lire le cas client", href: "#" }, // TODO
};

export const pricing = {
  eyebrow: "Tarifs",
  title: "Un prix clair, tout compris",
  subtitle: "Appels, emails, séquences et IA dans chaque offre. Prix HT, par mois.",
  periodLegend: "Période de facturation",
  perMonth: "HT / mois",
  usersIncluded: (n: number) => (n === 1 ? "1 utilisateur" : `${n} utilisateurs inclus`),
  extraSeat: (price: string, limit?: string) =>
    `+ ${price} HT / mois par utilisateur supplémentaire${limit ? `, ${limit}` : ""}`,
  annualTotal: (total: string) => `Soit ${total} HT facturés par an`,
  monthlyNote: "Sans engagement",
  saveLabel: (pct: number) => `jusqu'à −${pct} %`,
  footnote: "Tous les prix sont HT. Options disponibles : stockage d'appels, fiches IA supplémentaires, marque blanche.",
};

export const security = {
  eyebrow: "Sécurité",
  title: "Sécurité et souveraineté par défaut",
  subtitle:
    "Une instance, une base et un stockage d'enregistrements par client. Rien n'est mutualisé avec d'autres entreprises.",
  action: { label: "Poser vos questions sécurité", href: "/demo" },
  badges: [
    { icon: "server", title: "Single-tenant", body: "Une instance applicative par client, jamais partagée." },
    { icon: "database", title: "Base isolée", body: "Une base PostgreSQL dédiée à vos données." },
    { icon: "lock", title: "Call Vault privé", body: "Vos enregistrements dans un stockage S3 privé." },
    { icon: "shield", title: "RGPD", body: "Une architecture pensée pour vos obligations RGPD." },
  ],
} as const;

export const finalCta = {
  eyebrow: "Démo",
  title: "Prêt à passer votre prospection en pilote automatique ?",
  subtitle: "Une démo sur vos propres cas d'usage, avec vos SDRs et vos managers.",
  action: { label: "Demander une démo", href: "/demo" },
};
