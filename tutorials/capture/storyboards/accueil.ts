import type { Storyboard } from "../storyboard";

// Verified in app/manager/dashboard/page.tsx + components/accueil/ManagerDashboardView.tsx:
// period popover (DateRangeFilter presets, closes on preset), « Filtrer par mission » select feeding
// both /api/stats and /api/manager/home/period, RDV hero with delta « vs période préc. »,
// Qualifications families as <details>, « Leads à relancer » card.
export const accueil: Storyboard = {
    id: "accueil",
    route: "/manager/dashboard",
    match: ["/manager/dashboard"],
    section: "Accueil",
    title: "Accueil",
    purpose: "Votre point de départ chaque jour : RDV décrochés, activité de l'équipe et leads à relancer, sur la période et les missions de votre choix.",
    steps: [
        {
            title: "Ouvrez le choix de la période",
            detail: "Toutes les cartes de la page se recalculent sur la période choisie.",
            kind: "click",
            target: (p) => p.getByRole("button", { name: /30 derniers jours/ }),
            result: (p) => p.getByRole("dialog", { name: "Choisir une période" }),
        },
        {
            title: "Choisissez « 7 derniers jours »",
            detail: "Le nombre de RDV est comparé automatiquement à la période précédente.",
            kind: "click",
            target: (p) => p.getByRole("dialog", { name: "Choisir une période" }).getByRole("button", { name: "7 derniers jours" }),
            result: (p) => p.locator("section").filter({ has: p.getByRole("heading", { name: "RDV décrochés" }) }).first(),
            wait: 1500,
        },
        {
            title: "Filtrez sur une mission",
            detail: "Les chiffres ne portent plus que sur cette mission. Revenez à « Toutes les missions » à tout moment.",
            kind: "select",
            text: "Nordline — Directeurs supply chain",
            target: (p) => p.getByLabel("Filtrer par mission"),
            wait: 1500,
        },
        {
            title: "Dépliez une famille de résultats",
            detail: "Qualifications détaille les statuts d'appel derrière chaque famille.",
            kind: "click",
            target: (p) => p.locator("details > summary").first(),
            result: (p) => p.locator("details[open]").first(),
            before: async (p) => {
                await p.locator("details > summary").first().scrollIntoViewIfNeeded();
            },
        },
    ],
    outcome: {
        title: "L'activité de l'équipe, en un coup d'œil",
        detail: "Vous savez où en sont les RDV, ce qui ressort des appels et quels leads relancer en priorité.",
        target: (p) => p.locator("section").filter({ has: p.getByRole("heading", { name: /Leads à relancer/ }) }).first(),
    },
};
