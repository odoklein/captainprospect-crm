/**
 * Forme commune des pages d'offre, de secteur et de tarifs (content/pages/*.ts).
 * Une page = un hero + une suite de blocs. Pour ajouter une page, copiez un fichier
 * existant, changez les textes, puis créez app/<url>/page.tsx (voir prospection-externalisee).
 */
import type { IconName } from "@/components/ui/Icon";

export type Link = { label: string; href: string };

type Head = { id?: string; eyebrow: string; title: string; intro?: string };

export type Block =
  | (Head & { kind: "pains"; items: Array<{ title: string; body: string }> })
  | (Head & { kind: "steps"; items: Array<{ title: string; body: string; when?: string }> })
  | (Head & { kind: "features"; items: Array<{ title: string; body: string; icon?: IconName }> })
  | (Head & { kind: "proof"; stats: Array<{ value: string; label: string }>; story?: string; note: string })
  | (Head & { kind: "compare"; columns: string[]; rows: Array<{ label: string; cells: string[] }>; note?: string })
  | (Head & { kind: "offers" })
  /** Les trois offres CRM de content/pricing.ts (même bloc que sur l'accueil). */
  | { kind: "crm-pricing"; id?: string }
  | (Head & { kind: "prose"; parts: Array<{ title: string; paragraphs: string[] }> })
  | (Head & { kind: "faq"; items: Array<{ q: string; a: string }> })
  | (Head & { kind: "links"; items: Array<Link & { body: string }> })
  | (Head & { kind: "cta"; primary: Link; secondary?: Link; intro: string });

export type LandingPage = {
  /** URL de la page, commence par « / ». */
  path: string;
  meta: { title: string; description: string };
  /** Nom court dans le fil d'Ariane. */
  breadcrumb: string;
  parent?: Link;
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
    primary: Link;
    secondary?: Link;
    bullets?: string[];
  };
  blocks: Block[];
};
