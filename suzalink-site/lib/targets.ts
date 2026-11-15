import type { Block, LandingPage } from "@/content/pages/types";
import { relatedTargets, type Sector } from "@/content/pages/secteurs";
import { guides } from "@/content/pages/guides";

/** Card data for a target page (secteur or interlocuteur). */
export const targetCard = (t: Sector) => ({ label: t.name, href: t.path, body: t.card, icon: t.icon, state: t.state });

/**
 * A target page plus its internal links, inserted just before the final call to action:
 * the other sectors and contact types, then the guides that go with them.
 */
export function withRelated(page: Sector): LandingPage {
  const related: Block = {
    kind: "targets",
    id: "autres-cibles",
    eyebrow: "Autres cibles",
    title: "Nous appelons aussi",
    items: relatedTargets(page.slug).map(targetCard),
  };
  const reading: Block = {
    kind: "links",
    id: "a-lire",
    eyebrow: "À lire",
    title: "Pour préparer vos appels",
    items: guides
      .filter((g) => ["script-appel-prospection", "barrage-secretaire", "prospection-telephonique-b2b-rgpd"].includes(g.slug))
      .map((g) => ({ label: g.name, href: g.path, body: g.summary })),
  };
  const blocks = [...page.blocks];
  const last = blocks.at(-1);
  const tail = last?.kind === "cta" ? [blocks.pop()!] : [];
  const hasReading = reading.kind === "links" && reading.items.length > 0;
  return { ...page, blocks: [...blocks, related, ...(hasReading ? [reading] : []), ...tail] };
}

