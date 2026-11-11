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
    file: "/photos/hero-nature",
    alt: "Collines volcaniques noyées dans la brume au lever du jour",
    fallback: {
      src: unsplash("photo-1470071459604-3b5ec3a7fe05"),
      alt: "Vallée verdoyante sous la brume, traversée par une route, au lever du soleil",
    },
  },
  /** 5. Bande partagée : SDR avec casque, tons chauds (prompt n°2). */
  sdrHeadset: {
    file: "/photos/sdr-headset",
    alt: "Commerciale souriante avec un casque-micro, à son bureau dans un appartement parisien baigné de lumière dorée",
    position: "62% center",
    fallback: {
      src: unsplash("photo-1521737604893-d14cc237f11d"),
      alt: "Équipe au travail autour d'une table en bois ; au premier plan, un commercial porte un casque",
    },
  },
  /** 9. Cas clients (prompts n°3, 4 et 5). */
  caseAgency: {
    file: "/photos/case-agency",
    alt: "Open space en briques et plantes : des SDR en casque passent leurs appels autour d'une grande table en bois",
    fallback: {
      src: unsplash("photo-1522071820081-009f0129c71c"),
      alt: "Équipe concentrée sur ses ordinateurs portables autour d'une table en bois, certains avec un casque",
    },
  },
  caseSmb: {
    file: "/photos/case-smb",
    alt: "Une manager montre un graphique sur l'ordinateur d'une commerciale assise à côté d'elle",
    fallback: {
      src: unsplash("photo-1552664730-d307ca884978"),
      alt: "Réunion d'équipe devant un mur couvert de notes adhésives",
    },
  },
  caseFreelance: {
    file: "/photos/case-freelance",
    alt: "Consultant en casque, en plein appel devant son ordinateur, dans un appartement haussmannien",
    position: "60% center",
    fallback: {
      src: unsplash("photo-1525182008055-f88b95ff7980"),
      alt: "Commercial au téléphone à son bureau, devant son écran",
    },
  },
  /** 13. CTA final : paysage plein cadre sous un voile sombre (prompt n°6). */
  ctaLandscape: {
    file: "/photos/cta-landscape",
    alt: "Sommets enneigés au-dessus d'une mer de nuages, ciel bleu nuit et lueur rose à l'horizon",
    fallback: {
      src: unsplash("photo-1506905925346-21bda4d32df4"),
      alt: "Sommets enneigés au-dessus d'une mer de nuages au coucher du soleil",
    },
  },
  /** 12. Texture de la bande Sécurité (prompt n°7). Décorative : pas de photo de secours. */
  securityTexture: {
    file: "/photos/security-texture",
    alt: "",
  },
} satisfies Record<string, PhotoEntry>;

export type ImageKey = keyof typeof images;
