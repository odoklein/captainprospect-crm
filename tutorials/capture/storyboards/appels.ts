import type { Storyboard } from "../storyboard";

// Verified in app/manager/prospection/page.tsx: mission cards filtered by client / SDR,
// « Ouvrir le tableau de bord » opens the mission's call control centre (KPIs, result chips
// filtering the table, export).
export const appels: Storyboard = {
    id: "appels",
    route: "/manager/prospection",
    match: ["/manager/prospection"],
    section: "Prospection",
    title: "Appels",
    purpose: "L'activité d'appel des SDR, mission par mission : volumes, résultats et chaque prospect contacté.",
    steps: [
        {
            title: "Filtrez par client",
            detail: "Seules ses missions restent affichées.",
            kind: "select",
            text: "Opaline Santé",
            target: (p) => p.locator("select").filter({ has: p.locator("option", { hasText: "Tous les clients" }) }).first(),
            wait: 800,
        },
        {
            title: "Ouvrez le tableau de bord",
            detail: "Le centre de contrôle de la mission : actions, RDV, intérêts et rappels.",
            kind: "click",
            target: (p) => p.getByText("Ouvrir le tableau de bord").first(),
            result: (p) => p.getByText(/actions totales/i).first().locator("xpath=ancestor::div[contains(@class,'grid')][1]"),
            wait: 2000,
        },
        {
            title: "Isolez un résultat",
            detail: "Un clic sur « Rappel demandé » ne garde que les prospects à rappeler.",
            kind: "click",
            target: (p) => p.getByRole("button", { name: /Rappel demandé/ }).first(),
            result: (p) => p.getByText(/lignes sur/).first(),
            wait: 1200,
            before: async (p) => {
                await p.getByRole("button", { name: /Rappel demandé/ }).first().scrollIntoViewIfNeeded();
                await p.mouse.wheel(0, 200);
            },
        },
    ],
    outcome: {
        title: "Chaque appel, à portée de clic",
        detail: "Vous savez qui a été appelé, avec quel résultat, et qui doit être relancé.",
    },
};
