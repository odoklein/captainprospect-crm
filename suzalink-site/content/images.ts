/**
 * Toutes les photos du site, au même endroit.
 *
 * VOS VISUELS : déposez chaque fichier dans /public/photos avec le nom indiqué
 * (extension libre : .jpg, .jpeg, .png, .webp ou .avif). Au prochain build, le site
 * l'utilise automatiquement à la place de la photo Unsplash de secours.
 * Les prompts de génération sont dans IMAGE_PROMPTS.md.
 *
 * `alt` décrit VOTRE visuel ; `fallback.alt` décrit la photo Unsplash de secours.
 * Si vous changez un visuel, mettez son `alt` à jour.
 */

export type SiteImage = { src: string; alt: string };

export type PhotoEntry = {
  /** Chemin dans /public, sans extension. */
  file: string;
  alt: string;
  /** Photo utilisée tant que le fichier n'existe pas. */
  fallback?: SiteImage;
  /** Position du cadrage (CSS object-position), si le sujet n'est pas centré. */
  position?: string;
};

const unsplash = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&q=80&w=2400`;

export const images = {
  /** 3. Hero : grand cadre derrière la maquette SDR (prompt n°1). */
  heroNature: {
    file: "/creative/connection",
    alt: "Collines volcaniques noyées dans la brume au lever du jour",
    fallback: {
      src: unsplash("photo-1470071459604-3b5ec3a7fe05"),
      alt: "Vallée verdoyante sous la brume, traversée par une route, au lever du soleil",
    },
  },
  /** 5. Bande partagée « L'IA au service de vos SDRs » : la carte de résumé d'appel. */
  sdrHeadset: {
    file: "/photos/resume-appel",
    alt: "Illustration : sur un mur vert sombre traversé d'une bande de lumière jaune, une carte « Résumé de l'appel » avec l'enregistrement, le résumé et l'action « Rendez-vous à planifier »",
    position: "96% center",
    fallback: {
      src: unsplash("photo-1521737604893-d14cc237f11d"),
      alt: "Équipe au travail autour d'une table en bois ; au premier plan, un commercial porte un casque",
    },
  },
  /** 9. Cas clients (prompts n°3, 4 et 5). */
  caseAgency: {
    file: "/photos/plateau-equipe",
    alt: "Illustration : un plateau lumineux où une SDR en casque appelle pendant que deux collègues relisent un écran",
    fallback: {
      src: unsplash("photo-1522071820081-009f0129c71c"),
      alt: "Équipe concentrée sur ses ordinateurs portables autour d'une table en bois, certains avec un casque",
    },
  },
  caseSmb: {
    file: "/photos/rdv-confirme",
    alt: "Illustration : une femme regarde une plaque de verre suspendue qui affiche « Rendez-vous confirmé », avec la date, l'heure et l'entreprise",
    fallback: {
      src: unsplash("photo-1552664730-d307ca884978"),
      alt: "Réunion d'équipe devant un mur couvert de notes adhésives",
    },
  },
  caseFreelance: {
    file: "/photos/bureau-notes",
    alt: "Illustration : une femme prend des notes à son bureau, devant deux écrans, près d'une fenêtre",
    position: "70% center",
    fallback: {
      src: unsplash("photo-1525182008055-f88b95ff7980"),
      alt: "Commercial au téléphone à son bureau, devant son écran",
    },
  },
  /** 13. CTA final : paysage plein cadre sous un voile sombre (prompt n°6). */
  ctaLandscape: {
    file: "/creative/horizon",
    alt: "Sommets enneigés au-dessus d'une mer de nuages, ciel bleu nuit et lueur rose à l'horizon",
    fallback: {
      src: unsplash("photo-1506905925346-21bda4d32df4"),
      alt: "Sommets enneigés au-dessus d'une mer de nuages au coucher du soleil",
    },
  },
  /** Visuels de marque (pages secteur, guides, rubriques). Images générées : jamais présentées comme des clients. */
  callSplit: {
    file: "/photos/appel-sdr-prospect",
    alt: "Illustration : à gauche une SDR en casque, à droite son interlocuteur au téléphone, reliés par la forme d'onde de l'appel",
  },
  cardsFlow: {
    file: "/photos/fiches-a-relancer",
    alt: "Illustration : deux mains font passer une fiche « Société C » sur un parcours appel, agenda, « À relancer »",
  },
  pathGoal: {
    file: "/photos/chemin-objectif",
    alt: "Illustration : une femme marche sur une passerelle vert d'eau sinueuse qui mène à un repère jaune",
  },
  pathEmpty: {
    file: "/photos/chemin-objectif-vide",
    alt: "",
  },
  arches: {
    file: "/photos/arches",
    alt: "Illustration : trois arches vert sombre dans un hall clair, des lignes au sol mènent à une salle de réunion",
  },
  binder: {
    file: "/photos/classeur-checklist",
    alt: "Illustration : une femme pose la main sur un vieux classeur débordant de papiers et ouvre un carnet de cases à cocher",
  },
  /** 12. Texture de la bande Sécurité (prompt n°7). Décorative : pas de photo de secours. */
  securityTexture: {
    file: "/creative/vault",
    alt: "",
  },
} satisfies Record<string, PhotoEntry>;

export type ImageKey = keyof typeof images;
