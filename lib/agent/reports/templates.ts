/**
 * Report templates: the sections a report must have, the visuals each one
 * carries and the writing instruction. Pure (no I/O), so the prompt can be
 * reviewed and tested on its own.
 */

export interface ReportSection {
    id: string;
    heading: string;
    /** What the section says, for the model. */
    guidance: string;
    /** The visual the section carries, drawn with show_visual. */
    visual?: { kind: "kpi_row" | "line" | "table"; spec: string };
}

export interface ReportTemplate {
    id: string;
    label: string;
    sections: ReportSection[];
}

export const WEEKLY_BILAN_TEMPLATE: ReportTemplate = {
    id: "weekly_bilan",
    label: "Bilan hebdomadaire client",
    sections: [
        {
            id: "synthese",
            heading: "Synthèse",
            guidance: "Trois phrases au plus : le volume, les rendez-vous, la tendance. Ce que le client doit retenir.",
        },
        {
            id: "chiffres",
            heading: "Chiffres de la semaine",
            guidance: "Le visuel, puis une phrase qui commente l'évolution des appels par rapport à la semaine précédente.",
            visual: {
                kind: "kpi_row",
                spec: "tuiles Appels (delta_pct = evolution_appels_pct), Conversations, Rendez-vous, Prospects contactés — valeurs de « chiffres »",
            },
        },
        {
            id: "tendance",
            heading: "Tendance sur 6 semaines",
            guidance: "Le visuel, puis une phrase sur la dynamique (hausse, stabilité, baisse) sans inventer de cause.",
            visual: { kind: "line", spec: "x = « semaine », séries appels, conversations et rdv de « tendance_6_semaines »" },
        },
        {
            id: "rendez_vous",
            heading: "Rendez-vous",
            guidance: "Le tableau des rendez-vous de la semaine ; s'il n'y en a aucun, une phrase le dit et pas de tableau.",
            visual: { kind: "table", spec: "colonnes Société, Interlocuteur, Date, Mission — lignes de « rendez_vous »" },
        },
        {
            id: "vigilance",
            heading: "Points de vigilance",
            guidance: "Deux à quatre puces tirées des points saillants et des notes d'appels (objections, ciblage, volume). Jamais de nom de personne.",
        },
        {
            id: "prochaines_etapes",
            heading: "Prochaines étapes",
            guidance: "Deux à quatre puces concrètes pour la semaine suivante.",
        },
    ],
};

export function weeklyBilanTitle(clientName: string, weekLabel: string): string {
    return `Bilan hebdomadaire — ${clientName} — ${weekLabel}`;
}

/** The writing instruction of step 2. `datasetInline` when the dataset could not be seeded as evidence. */
export function weeklyBilanInstruction(params: { clientName: string; weekLabel: string; seeded: boolean; toolAvailable: boolean; datasetInline?: unknown }): string {
    const t = WEEKLY_BILAN_TEMPLATE;
    const source = params.seeded
        ? "Les données sont dans la source déjà consultée (E1)" + (params.toolAvailable ? " ; get_report_dataset les renvoie à l'identique si besoin." : ".")
        : params.toolAvailable
            ? "Appelle d'abord get_report_dataset : c'est la seule source de chiffres."
            : "Les données sont dans le JSON ci-dessous : c'est la seule source de chiffres.";
    const sections = t.sections
        .map((s, i) => {
            const visual = s.visual ? `\n   Visuel : show_visual kind « ${s.visual.kind} » (${s.visual.spec}), puis le marqueur [[visuel N]] renvoyé, seul sur sa ligne.` : "";
            return `${i + 1}. « ## ${s.heading} » — ${s.guidance}${visual}`;
        })
        .join("\n");
    const lines = [
        `Rédige le bilan hebdomadaire de ${params.clientName} pour la ${params.weekLabel.toLowerCase()}. ${source}`,
        "",
        "Structure exacte, dans cet ordre, en markdown :",
        `# ${weeklyBilanTitle(params.clientName, params.weekLabel)}`,
        sections,
        "",
        "Règles :",
        "- chaque chiffre vient de la source, tel quel, suivi de [E1] ; aucun chiffre calculé de tête ;",
        "- quand « volume_faible » est vrai, pas de taux : dis que le volume est trop faible pour un taux fiable ;",
        "- ton professionnel, vouvoiement du client, phrases courtes, pas d'emoji ;",
        "- pas de question, pas de formule d'attente : le rapport est relu par un manager avant publication ;",
        "- n'appelle aucun outil d'action ; la publication est proposée au manager après ta rédaction.",
    ];
    if (!params.seeded && !params.toolAvailable && params.datasetInline !== undefined) {
        lines.push("", "Source (JSON) :", JSON.stringify(params.datasetInline, null, 1));
    }
    return lines.join("\n");
}

/** Section headings missing from a written report (the summary mentions them). */
export function missingSections(markdown: string, template: ReportTemplate = WEEKLY_BILAN_TEMPLATE): string[] {
    const headings = new Set(
        [...markdown.matchAll(/^#{2,3}\s+(.+?)\s*$/gm)].map((m) => m[1].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()),
    );
    return template.sections
        .filter((s) => !headings.has(s.heading.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()))
        .map((s) => s.heading);
}
