import type { Storyboard } from "../storyboard";

// Verified in app/manager/clients/page.tsx + components/drawers/ClientDrawer.tsx: « À traiter »
// (blocked launch, mission without team, end near), searchable client table, client home with
// its missions (en cours / en pause), mission opens the mission workspace (?mission=…).
export const clients: Storyboard = {
    id: "clients",
    route: "/manager/clients",
    match: ["/manager/clients", "/manager/clients/*"],
    section: "Clients",
    title: "Clients",
    purpose: "Votre portefeuille : chaque client, ses missions et ce qui demande votre attention, au même endroit.",
    steps: [
        {
            title: "Commencez par « À traiter »",
            detail: "Lancement bloqué, mission sans équipe ou fin proche : les urgences remontent ici.",
            kind: "point",
            target: (p) => p.locator("section, div").filter({ has: p.getByRole("heading", { name: /^À traiter/ }) }).filter({ hasText: "Rien à traiter" }).last(),
        },
        {
            title: "Cherchez un client",
            detail: "Le tableau se filtre au fil de la frappe.",
            kind: "type",
            text: "Nord",
            target: (p) => p.getByPlaceholder("Rechercher un client…"),
            wait: 600,
        },
        {
            title: "Ouvrez sa fiche",
            detail: "Ses missions en cours et en pause, ses contacts, ses pages et son intégration.",
            kind: "click",
            target: (p) => p.getByText("Nordline Logistique", { exact: true }).last(),
            result: (p) => p.locator("section, div").filter({ has: p.getByRole("heading", { name: /^Missions/ }) }).filter({ hasText: "En cours" }).last(),
            wait: 1500,
        },
        {
            title: "Entrez dans une mission",
            detail: "Brief, lancement, bases de prospects, scripts et équipe de la mission.",
            kind: "click",
            target: (p) => p.getByText("Nordline — Directeurs supply chain", { exact: true }).last(),
            wait: 1800,
        },
    ],
    outcome: {
        title: "L'espace de la mission s'ouvre",
        detail: "Le guide « Espace mission » détaille chacune de ses sections.",
    },
};
