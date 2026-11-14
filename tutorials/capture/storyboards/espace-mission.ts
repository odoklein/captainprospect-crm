import type { Storyboard } from "../storyboard";

// Verified in components/drawers/ClientDrawer.tsx (MISSION_SECTIONS: Brief, Lancement, Bases de
// prospects, Ciblage et scripts, Équipe) and components/missions/MissionWorkspace.tsx: pacing
// against the RDV objective, launch checklist, lists with their strategy and commercial,
// référent + assigned SDRs + campaigns. Opened from Clients (/manager/clients?mission=…).
const esc = async (p: import("playwright").Page) => {
    await p.keyboard.press("Escape");
    await p.waitForTimeout(500);
};

export const espaceMission: Storyboard = {
    id: "espace-mission",
    route: "/manager/clients?client=demo-client-nordline&mission=demo-mission-1&tab=general",
    match: ["/manager/clients?mission"],
    section: "Clients",
    title: "Espace mission",
    purpose: "Tout ce qui fait tourner une mission : son rythme face à l'objectif, son lancement, ses fichiers, ses scripts et son équipe.",
    steps: [
        {
            title: "Vérifiez le rythme",
            detail: "RDV obtenus face à l'objectif, et projection au rythme actuel jusqu'à la fin.",
            kind: "point",
            target: (p) => p.locator("section.cw-verdict").first(),
        },
        {
            title: "Contrôlez le lancement",
            detail: "Chaque prérequis est validé ou signalé : bases, stratégies, scripts, équipe.",
            kind: "click",
            target: (p) => p.getByRole("button", { name: "Lancement", exact: true }).or(p.getByRole("link", { name: "Lancement", exact: true })).first(),
            result: (p) => p.getByText(/Configuration de lancement/).locator("xpath=ancestor::div[2]"),
            wait: 1500,
        },
        {
            title: "Ouvrez les bases de prospects",
            detail: "Les listes de la mission, leur stratégie et le commercial à qui partent les RDV.",
            kind: "click",
            target: (p) => p.getByRole("button", { name: "Bases de prospects", exact: true }).or(p.getByRole("link", { name: "Bases de prospects", exact: true })).first(),
            result: (p) => p.getByRole("dialog").first(),
            wait: 1500,
        },
        {
            title: "Composez l'équipe",
            detail: "Choisissez le référent, assignez les SDR et suivez leurs actions et leurs RDV.",
            kind: "click",
            target: (p) => p.getByRole("button", { name: "Équipe", exact: true }).or(p.getByRole("link", { name: "Équipe", exact: true })).first(),
            result: (p) => p.getByRole("dialog").first(),
            wait: 1500,
            before: esc,
        },
    ],
    outcome: {
        title: "La mission est sous contrôle",
        detail: "Objectif, fichiers, scripts et équipe se règlent sans quitter la fiche du client.",
        target: (p) => p.getByRole("dialog").first(),
    },
};
