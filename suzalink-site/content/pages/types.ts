/**
 * Forme commune des pages d'offre, de secteur, de guide et de tarifs (content/pages/*.ts).
 * Une page = un hero + une suite de blocs. Pour ajouter une page, copiez un fichier
 * existant, changez les textes, puis créez app/<url>/page.tsx (voir prospection-externalisee).
 *
 * Liens dans les textes : écrivez [texte du lien](/url) et **gras** dans n'importe quel
 * paragraphe, réponse de FAQ ou carte. Le lien devient un vrai lien interne (maillage SEO).
 */
import type { IconName } from "@/components/ui/Icon";
import type { ImageKey } from "@/content/images";
import type { BrandIconName } from "@/components/ui/BrandIcon";

export type Link = { label: string; href: string };

type Head = { id?: string; eyebrow: string; title: string; intro?: string };

/** Une section de guide : titre en question, réponse directe de 40 à 60 mots, puis le détail. */
export type ArticleSection = {
  id: string;
  title: string;
  /** Réponse courte (40 à 60 mots) affichée en premier : c'est elle que Google et les IA citent. */
  answer?: string;
  paragraphs?: string[];
  list?: { ordered?: boolean; items: string[] };
  table?: { caption: string; columns: string[]; rows: string[][]; note?: string };
  /** Encadré « Sur le terrain » : une observation tirée de nos missions. */
  field?: string;
};

export type Block =
  | (Head & { kind: "pains"; items: Array<{ title: string; body: string }> })
  /** howto: true publie aussi les étapes en données structurées HowTo. */
  | (Head & { kind: "steps"; howto?: boolean; items: Array<{ title: string; body: string; when?: string; icon?: BrandIconName }> })
  | (Head & { kind: "features"; items: Array<{ title: string; body: string; icon?: IconName }> })
  | (Head & { kind: "proof"; stats: Array<{ value: string; label: string }>; story?: string; note: string })
  | (Head & { kind: "compare"; columns: string[]; rows: Array<{ label: string; cells: string[] }>; note?: string })
  | (Head & { kind: "offers" })
  /** Les trois offres CRM de content/pricing.ts (même bloc que sur l'accueil). */
  | { kind: "crm-pricing"; id?: string }
  /** Encadré « En bref » juste sous le hero : la réponse à la question de la page, en 40 à 60 mots. */
  | { kind: "answer"; id?: string; question: string; answer: string; facts?: string[] }
  /** Corps d'un guide, avec sommaire collant. */
  | { kind: "article"; id?: string; sections: ArticleSection[]; sources?: Array<{ label: string; href: string; note?: string }> }
  /** Visuel produit + texte côte à côte. Fichiers dans public/visuals/. */
  | (Head & {
      kind: "showcase";
      points?: string[];
      image: { src: string; alt: string; width: number; height: number };
      reverse?: boolean;
      action?: Link;
    })
  | (Head & { kind: "prose"; parts: Array<{ title: string; paragraphs: string[] }> })
  | (Head & { kind: "faq"; items: Array<{ q: string; a: string }> })
  | (Head & { kind: "links"; items: Array<Link & { body: string }> })
  | (Head & { kind: "cta"; primary: Link; secondary?: Link; intro: string })
  /** Pages secteur : qui décroche, qui décide, qui influence. */
  | (Head & { kind: "people"; items: Array<{ role: "Décroche" | "Décide" | "Influence" | "Valide"; who: string; body: string }> })
  /** Pages secteur : les bons créneaux et ceux à éviter. */
  | (Head & { kind: "timing"; good: Array<{ when: string; why: string }>; avoid: Array<{ when: string; why: string }>; note?: string })
  /** Objections entendues et ce que le SDR répond. Pas de données structurées : ce ne sont pas des questions de visiteurs. */
  | (Head & { kind: "objections"; items: Array<{ objection: string; reply: string }> })
  /** Exemple d'ouverture d'appel, présenté comme un exemple (jamais comme un appel réel). */
  | (Head & { kind: "opener"; lines: Array<{ who: "SDR" | "Interlocuteur"; text: string }>; points: string[]; note: string })
  /** Statut de la mission sur ce secteur quand aucun chiffre n'est encore publiable. */
  | (Head & { kind: "status"; since: string; facts: string[]; promise: string; action: Link })
  /** Cartes de pages cibles (secteurs, interlocuteurs), avec leur statut de mission. */
  | (Head & { kind: "targets"; items: Array<{ label: string; href: string; body: string; icon: IconName; state: "documented" | "running" }> })
  /** Photo de marque pleine largeur avec légende. */
  | { kind: "photo"; id?: string; image: ImageKey; caption?: string };

export type LandingPage = {
  /** URL de la page, commence par « / ». */
  path: string;
  meta: { title: string; description: string };
  /** Nom court dans le fil d'Ariane. */
  breadcrumb: string;
  parent?: Link;
  /** Date de dernière mise à jour (AAAA-MM-JJ), affichée sous le titre. */
  updated?: string;
  /** Guides : publié comme Article (auteur, dates, temps de lecture). */
  article?: { published: string; readingMinutes: number };
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
    primary: Link;
    secondary?: Link;
    bullets?: string[];
    /** Visuel à droite du titre (remplace la carte de puces). Fichier dans public/visuals/. */
    visual?: { src: string; alt: string; width: number; height: number };
    /** Photo de marque à droite du titre (content/images.ts), à la place du visuel. */
    photo?: ImageKey;
    /** Badge sous l'eyebrow, ex. « Mission documentée » ou « Mission en cours ». */
    badge?: { label: string; tone: "documented" | "running" };
  };
  blocks: Block[];
};
