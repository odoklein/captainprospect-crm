import type { Storyboard } from "../storyboard";

// Verified in components/tasks/TaskFeed.tsx: quick-add (« Titre de la nouvelle tâche »,
// « Échéance », « Client », « Ajouter »), rows grouped by due date, checkbox « Terminer « … » ».
const TITLE = "Préparer le bilan mensuel";

export const taches: Storyboard = {
    id: "taches",
    route: "/manager/tasks",
    match: ["/manager/tasks"],
    section: "Accueil",
    title: "Tâches",
    purpose: "Vos tâches et celles de l'équipe, classées par échéance : facturation, bilans, relances et rappels urgents.",
    steps: [
        {
            title: "Écrivez la tâche",
            detail: "Une phrase suffit. Ajoutez une échéance si elle doit tomber un jour précis.",
            kind: "type",
            text: TITLE,
            target: (p) => p.getByLabel("Titre de la nouvelle tâche"),
        },
        {
            title: "Rattachez-la à un client",
            detail: "Elle apparaîtra aussi dans le suivi de ce client.",
            kind: "select",
            text: "Verdane Énergie",
            target: (p) => p.getByLabel("Client", { exact: true }),
        },
        {
            title: "Ajoutez-la",
            detail: "Elle rejoint la liste, rangée par échéance (ici « Sans échéance »).",
            kind: "click",
            target: (p) => p.getByRole("button", { name: "Ajouter", exact: true }),
            result: (p) => p.locator("li").filter({ hasText: TITLE }).first(),
            scrollResult: true,
            wait: 1500,
        },
        {
            title: "Cochez-la une fois faite",
            detail: "Elle passe en « Fait ». Un nouveau clic la rouvre si besoin.",
            kind: "click",
            target: (p) => p.getByRole("checkbox", { name: `Terminer « ${TITLE} »` }),
            result: (p) => p.locator("li").filter({ hasText: TITLE }).first(),
            wait: 1200,
        },
    ],
    outcome: {
        title: "Rien ne se perd",
        detail: "Une tâche faite reste visible, barrée. L'onglet « Terminées » reprend les 14 derniers jours."
    },
};
