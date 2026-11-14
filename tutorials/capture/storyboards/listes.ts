import type { Storyboard } from "../storyboard";

// Verified in app/manager/lists/page.tsx: search « Rechercher une liste, une mission… », columns
// Joignables / Avancement (% traité + état) / Activité, row click → /manager/lists/[id].
export const listes: Storyboard = {
    id: "listes",
    route: "/manager/lists",
    match: ["/manager/lists", "/manager/lists/new", "/manager/lists/import"],
    section: "Prospection",
    title: "Listes",
    purpose: "Tous les fichiers de prospection de l'agence : leur taille, leur qualité et leur avancement, mission par mission.",
    steps: [
        {
            title: "Cherchez une liste",
            detail: "Tapez le nom d'une liste, d'un client ou d'une mission : le tableau se filtre aussitôt.",
            kind: "type",
            text: "Opaline",
            target: (p) => p.getByPlaceholder("Rechercher une liste, une mission…"),
            result: "table tbody tr",
            wait: 800,
        },
        {
            title: "Lisez l'avancement",
            detail: "La part des sociétés déjà traitées par les SDR, et l'état de la liste.",
            kind: "point",
            target: (p) => p.locator("table tbody tr").first().locator("td").nth(5),
        },
        {
            title: "Ouvrez la liste",
            detail: "Vous accédez à ses sociétés, ses contacts et sa santé de prospection.",
            kind: "click",
            target: (p) => p.locator("table tbody tr").first().locator("td a").first(),
            wait: "h2:has-text('Santé de prospection')",
        },
    ],
    outcome: {
        title: "La fiche de la liste est ouverte",
        detail: "Sociétés, contacts, joignabilité : tout ce qu'il faut pour juger si la liste mérite d'être travaillée.",
        target: (p) => p.locator("h1").first(),
    },
};
