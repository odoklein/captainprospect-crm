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
  /** Line above the title: who Suzalink is for. */
  audience: "Pour les PME, les agences de prospection et les équipes SDR",
  titleLines: ["Votre prospection.", "Vos règles."],
  subtitle:
    "Nos SDR prennent vos RDV B2B, ou votre équipe appelle avec notre CRM. Dans les deux cas, chaque appel reste visible.",
  primary: { label: "Demander une démo", href: "/demo" },
  secondary: { label: "Faire prospecter par nos SDR", href: "/prospection-externalisee" },
  /**
   * Ligne de preuve sous les boutons : les chiffres de la mission documentée
   * (les mêmes que `cases.featured`, plus bas dans ce fichier).
   */
  proof: {
    label: "Mission cabinets dentaires, fin 2025",
    href: "/secteurs/cabinets-dentaires",
    cta: "Lire la mission",
  },
  /**
   * L'écran d'appel animé du hero : un appel sans réponse, puis un appel qui aboutit à un RDV.
   * C'est une DÉMONSTRATION (données d'exemple, affichées comme telles). L'échange reprend
   * l'exemple d'ouverture de la page /secteurs/cabinets-dentaires : gardez les deux alignés.
   */
  call: {
    label:
      "Démonstration de l'espace SDR, avec des données d'exemple : la file du jour, un appel qui sonne, l'échange avec l'accueil d'un cabinet, puis le résultat « RDV pris » et le créneau du mardi à 9 h 30 ajouté à l'agenda.",
    windowTitle: "File du jour",
    mission: "Mission cabinets dentaires",
    sample: "Données d'exemple",
    queue: [
      { name: "Cabinet dentaire · Nord", role: "Accueil", note: "1er appel" },
      { name: "Cabinet dentaire · Rhône", role: "Accueil", note: "2e tentative" },
      { name: "Cabinet dentaire · Gironde", role: "Assistante", note: "1er appel" },
      { name: "Cabinet dentaire · Var", role: "Accueil", note: "Rappel 11 h 40" },
      { name: "Cabinet dentaire · Loiret", role: "Assistante", note: "1er appel" },
      { name: "Cabinet dentaire · Hérault", role: "Accueil", note: "2e tentative" },
      { name: "Cabinet dentaire · Somme", role: "Accueil", note: "1er appel" },
    ],
    status: { ring: "Sonnerie", live: "En appel", missed: "Sans réponse", done: "Terminé" },
    transcriptTitle: "Échange",
    speakers: { sdr: "SDR", other: "Accueil" },
    lines: [
      { who: "sdr", text: "Notre commercial passe dans votre secteur la semaine prochaine. Il peut déposer une boîte de collecte à l'accueil ?" },
      { who: "other", text: "Ça dépend du jour, on est fermés le mercredi." },
      { who: "sdr", text: "Alors mardi matin, vers 9 h 30 ? Je vous envoie la confirmation par mail." },
    ],
    missedNote: "Personne ne décroche. Le rappel part à une autre heure.",
    outcomesTitle: "Résultat en 1 touche",
    outcomes: ["RDV pris", "Rappel", "Barrage", "Messagerie"],
    booked: { day: "Mar.", time: "9 h 30", title: "RDV pris" },
    callback: { day: "Jeu.", time: "11 h 40", title: "Rappel" },
    week: ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven."],
    next: "Appel suivant",
    pause: "Mettre la démonstration en pause",
    play: "Relancer la démonstration",
  },
};

/** Juste sous le hero : les deux façons de travailler avec Suzalink. */
export const doors = {
  eyebrow: "Deux façons de travailler avec nous",
  title: "Vous déléguez, ou vous appelez vous-même",
  items: [
    {
      eyebrow: "Suzalink Prospection",
      title: "Nos SDR prennent vos RDV",
      body: "Pour les dirigeants de PME et les directeurs commerciaux qui veulent des RDV qualifiés sans recruter. Chaque appel est enregistré et visible dans votre portail.",
      points: ["Sprint test de 2 semaines, 990 € HT", "RDV non honoré remplacé", "Sans engagement après le sprint"],
      action: { label: "Découvrir la prospection", href: "/prospection-externalisee" },
    },
    {
      eyebrow: "Suzalink CRM",
      title: "Votre équipe appelle avec notre CRM",
      body: "Pour les agences de prospection et les équipes SDR. File d'appels, téléphonie, IA et portail client, à votre marque.",
      points: ["Marque blanche et portail client", "Téléphonie Allo et OnOff intégrée", "Dès 59 € HT par mois"],
      action: { label: "Découvrir le CRM", href: "/crm-agence-prospection" },
    },
  ],
} as const;

export const logos = {
  eyebrow: "Références",
  title: "Ils prospectent avec Suzalink",
  subtitle: "Agences de prospection et centres d'appels B2B.",
  action: { label: "Lire les cas clients", href: "/#cas-clients" },
  // La liste des clients et leurs logos : content/brands.ts
};

/**
 * Juste après les deux offres : le fil d'un appel, en cinq moments.
 * Chaque moment = une fonctionnalité réelle du CRM, illustrée par son écran (données d'exemple).
 */
export const features = {
  title: "Ce que fait Suzalink pendant un appel",
  subtitle: "De la file au portail client, chaque étape laisse une trace que vous pouvez relire.",
  /** Description of the whole timeline for screen readers (the screens are illustrations). */
  label:
    "Le fil d'un appel en cinq moments : la file d'appels avant l'appel, le résultat en une touche pendant l'appel, le résumé proposé par l'IA juste après, le journal d'appels le soir, et le portail client le lendemain.",
  steps: [
    { id: "file", moment: "Avant l'appel", title: "File d'appels", body: "Le prochain prospect arrive tout seul. Les rappels reviennent à l'heure prévue." },
    { id: "touche", moment: "Pendant", title: "Résultat en 1 touche", body: "Qualifiez l'appel sans quitter le clavier, puis passez au suivant." },
    { id: "resume", moment: "Juste après", title: "Résumé et résultat par l'IA", body: "Un résumé automatique et un résultat suggéré. Le SDR confirme ou corrige." },
    { id: "journal", moment: "Le soir", title: "Journal d'appels", body: "Suivez l'activité, écoutez les appels et mesurez la qualité des échanges." },
    { id: "portail", moment: "Le lendemain", title: "Portail client", body: "Vos clients voient leurs rendez-vous, à jour, sans vous écrire." },
  ],
} as const;

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
  eyebrow: "Nos missions",
  title: "Une mission chiffrée, d'autres en cours",
  subtitle: "Nous publions les chiffres d'une mission quand elle est terminée, client anonymisé. Jamais avant.",
  action: { label: "Tous les secteurs", href: "/secteurs" },
  /** La mission documentée (Drive « LES RDV », nov.–déc. 2025). */
  featured: {
    image: "caseSmb",
    eyebrow: "Cabinets dentaires, fin 2025",
    title: "147 RDV terrain et 36 boîtes de collecte en deux mois",
    stats: [
      { value: "5 174", label: "appels" },
      { value: "147", label: "RDV terrain" },
      { value: "20+", label: "départements" },
    ],
    href: "/secteurs/cabinets-dentaires",
    cta: "Lire la mission",
  },
  runningTitle: "En cours, chiffres à venir",
  runningCta: { label: "Votre secteur en deux semaines", href: "/tarifs#sprint" },
} as const;

export const testimonial = {
  /** false tant qu'aucune citation réelle et validée par écrit n'existe : la section ne s'affiche pas. */
  published: false,
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
  title: "Voyez un appel, de la file au RDV",
  subtitle: "Une démo sur vos propres cas d'usage, avec vos SDRs et vos managers.",
  action: { label: "Demander une démo", href: "/demo" },
  /** Lien secondaire : l'autre porte d'entrée (la prospection faite par nos SDR). */
  secondary: { label: "Ou commencer par un sprint test", href: "/tarifs#sprint" },
  /** Titre de la liste « ce que montre la démo » (les points viennent de content/demo.ts). */
  agendaTitle: "Au programme de la démo",
};
