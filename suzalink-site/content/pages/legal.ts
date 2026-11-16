/**
 * Pages légales : /mentions-legales et /confidentialite (avec la section cookies).
 *
 * Source : les mentions légales de suzaliconseil.com (Suzalink est une marque de Suzali Conseil),
 * relevées le 16 novembre 2026. Les champs marqués TODO manquent sur le site de Suzali Conseil :
 * à compléter avant la mise en ligne, puis à faire relire (avocat ou conseil RGPD).
 * Liens et **gras** possibles dans les paragraphes, comme ailleurs (voir content/pages/types.ts).
 *
 * Il n'y a pas de CGV ici : c'est un contrat, à rédiger par l'équipe (ou son avocat).
 */

export type LegalSection = { id: string; title: string; paragraphs: string[] };
export type LegalPageData = {
  path: string;
  meta: { title: string; description: string };
  title: string;
  lead: string;
  updated: string;
  sections: LegalSection[];
};

/** Identité de l'éditeur, reprise des mentions légales de suzaliconseil.com. */
export const company = {
  name: "Suzali Conseil",
  form: "SASU (société par actions simplifiée unipersonnelle)",
  capital: "1 €",
  address: "10 rue de la Paix, 75002 Paris, France",
  rcs: "RCS de Paris 992 281 097",
  director: "M. Hichem Hammouche, Président",
  email: "contact@suzaliconseil.com",
  phone: "+33\u00a07\u00a057\u00a090\u00a024\u00a079",
  /**
   * TODO : nom, adresse et téléphone de l'hébergeur (obligatoires, loi pour la confiance dans
   * l'économie numérique). Le site de Suzali Conseil indique seulement un serveur privé (VPS)
   * administré via Dokploy, sans nommer le fournisseur.
   */
  host: "un serveur privé (VPS) administré par Suzali Conseil via Dokploy",
};

const c = company;

export const mentionsLegales: LegalPageData = {
  path: "/mentions-legales",
  meta: {
    title: "Mentions légales",
    description: "Mentions légales du site suzalink.com, édité par Suzali Conseil : éditeur, hébergement, contact et propriété intellectuelle.",
  },
  title: "Mentions légales",
  lead: "Suzalink est une marque de Suzali Conseil. Voici qui édite ce site et comment nous joindre.",
  updated: "2026-11-16",
  sections: [
    {
      id: "editeur",
      title: "Éditeur du site",
      paragraphs: [
        `Le site suzalink.com est édité par **${c.name}**, ${c.form} au capital de ${c.capital}, dont le siège est situé ${c.address}, immatriculée au ${c.rcs}.`,
        `Directeur de la publication : ${c.director}.`,
      ],
    },
    {
      id: "hebergement",
      title: "Hébergement",
      paragraphs: [`Le site est hébergé sur ${c.host}.`],
    },
    {
      id: "contact",
      title: "Contact",
      paragraphs: [`Par email : [${c.email}](mailto:${c.email}). Par téléphone : ${c.phone}.`],
    },
    {
      id: "propriete",
      title: "Propriété intellectuelle",
      paragraphs: [
        `La marque Suzalink, son logo, les textes, visuels et maquettes de ce site appartiennent à ${c.name}. Toute reproduction, même partielle, demande notre accord écrit.`,
        "Les logos et noms des clients et des outils cités appartiennent à leurs propriétaires respectifs et sont reproduits avec leur accord ou à titre d'information.",
      ],
    },
    {
      id: "donnees",
      title: "Données personnelles",
      paragraphs: [
        "Ce que nous collectons, pourquoi, combien de temps et comment exercer vos droits : voir notre [politique de confidentialité](/confidentialite). Ce site ne dépose aucun cookie de mesure d'audience ou de publicité.",
      ],
    },
    {
      id: "responsabilite",
      title: "Limitation de responsabilité",
      paragraphs: [
        `${c.name} veille à l'exactitude des informations publiées, sans pouvoir en garantir l'exhaustivité. Les prix sont indiqués hors taxes et peuvent évoluer : l'offre qui fait foi est celle de votre devis ou de votre contrat.`,
        "Les liens vers d'autres sites sont fournis pour votre information : nous ne sommes pas responsables de leur contenu.",
      ],
    },
  ],
};

export const confidentialite: LegalPageData = {
  path: "/confidentialite",
  meta: {
    title: "Confidentialité et cookies",
    description: "Comment Suzalink (Suzali Conseil) traite vos données personnelles : formulaire de démo, prospection B2B, durée de conservation, vos droits, cookies.",
  },
  title: "Confidentialité et cookies",
  lead: "Ce que nous collectons sur ce site, pourquoi, combien de temps, et comment exercer vos droits.",
  updated: "2026-11-16",
  sections: [
    {
      id: "responsable",
      title: "Qui est responsable de vos données",
      paragraphs: [
        `${c.name}, ${c.address}, ${c.rcs}. Pour toute question sur vos données : [${c.email}](mailto:${c.email}).`,
      ],
    },
    {
      id: "collecte",
      title: "Ce que nous collectons",
      paragraphs: [
        "**Formulaire de démo** : votre nom, votre email professionnel, le nom de votre entreprise, la taille de votre équipe commerciale et, le cas échéant, l'offre qui vous intéresse. Rien n'est collecté si vous n'envoyez pas le formulaire.",
        "**Journaux techniques** : comme tout serveur web, le nôtre enregistre l'adresse IP, la date et la page demandée, pour la sécurité et le bon fonctionnement du site.",
      ],
    },
    {
      id: "finalites",
      title: "Pourquoi, et sur quelle base",
      paragraphs: [
        "Répondre à votre demande de démo et vous recontacter à ce sujet : c'est une mesure précontractuelle prise à votre demande (article 6.1.b du RGPD).",
        "Assurer la sécurité du site : c'est notre intérêt légitime (article 6.1.f du RGPD).",
        "Nous ne vendons pas vos données et nous ne les utilisons pas pour de la publicité.",
      ],
    },
    {
      id: "destinataires",
      title: "Qui y a accès",
      paragraphs: [
        `L'équipe commerciale de ${c.name} et les outils internes qui reçoivent les demandes de démo. Nos prestataires techniques n'y accèdent que pour faire fonctionner le service.`,
      ],
    },
    {
      id: "duree",
      title: "Combien de temps",
      paragraphs: [
        // TODO équipe : durées à confirmer (ce sont les durées recommandées par la CNIL).
        "Demandes de démo : trois ans après notre dernier échange, puis suppression. Journaux techniques : un an au plus.",
      ],
    },
    {
      id: "prospection",
      title: "Si nos SDR vous appellent",
      paragraphs: [
        "Nos SDR appellent des professionnels pour le compte de nos clients, à partir de coordonnées professionnelles. Ces données servent uniquement à la mission du client concerné. Vous pouvez vous opposer à tout moment à être rappelé : dites-le au SDR, ou écrivez-nous. Plus de détails dans notre guide [prospection B2B et RGPD](/guides/prospection-telephonique-b2b-rgpd).",
      ],
    },
    {
      id: "droits",
      title: "Vos droits",
      paragraphs: [
        `Vous pouvez demander l'accès à vos données, leur rectification, leur effacement, leur portabilité, la limitation du traitement, ou vous y opposer : écrivez à [${c.email}](mailto:${c.email}). Nous répondons sous un mois.`,
        "Si notre réponse ne vous satisfait pas, vous pouvez saisir la CNIL ([cnil.fr](https://www.cnil.fr)).",
      ],
    },
    {
      id: "cookies",
      title: "Cookies",
      paragraphs: [
        "Ce site ne dépose **aucun cookie** et n'utilise aucun stockage dans votre navigateur : pas de mesure d'audience, pas de publicité, pas de réseau social. C'est pourquoi aucun bandeau de consentement ne s'affiche.",
        "Si cela change, cette page sera mise à jour et votre accord vous sera demandé avant tout dépôt de cookie non nécessaire.",
      ],
    },
  ],
};
