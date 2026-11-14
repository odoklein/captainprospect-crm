import type { Storyboard } from "../storyboard";

// Verified in app/manager/rdv: CommandBar validation chips, OutcomeOverview « Masquer » (persisted in localStorage), MeetingList .rdv-row → DetailPanel,
// « Confirmer le RDV » sets confirmationStatus CONFIRMED (lib/meetings/clientEmailGate.ts: only
// confirmed RDV trigger the client's automatic emails); the API auto-confirms after 24 h.
export const rdv: Storyboard = {
    id: "sas-rdv",
    route: "/manager/rdv",
    match: ["/manager/rdv"],
    section: "Rendez-vous",
    title: "SAS RDV",
    purpose: "Chaque RDV pris par un SDR passe ici avant d'être annoncé au client. Vous le vérifiez, puis vous le confirmez ou le rejetez.",
    steps: [
        {
            title: "Filtrez les RDV en attente",
            detail: "Le compteur indique combien de rendez-vous attendent votre validation.",
            kind: "click",
            target: (p) => p.getByRole("button", { name: /En attente/ }),
        },
        {
            title: "Repliez le bilan",
            detail: "La liste des RDV apparaît dessous. Ce choix est mémorisé pour vos prochaines visites.",
            kind: "click",
            target: (p) => p.getByRole("button", { name: "Masquer" }),
            result: ".rdv-table-content",
        },
        {
            title: "Ouvrez un rendez-vous",
            detail: "Vérifiez le contact, la société, la date et le type de RDV avant de décider.",
            kind: "click",
            target: ".rdv-row.pending",
            result: ".rdv-panel.open .rdv-banner[data-tone='pending']",
            wait: ".rdv-panel.open",
        },
        {
            title: "Confirmez le RDV",
            detail: "Sans action de votre part, il est confirmé automatiquement au bout de 24 h.",
            kind: "click",
            target: (p) => p.getByRole("button", { name: "Confirmer le RDV" }),
            result: ".rdv-panel.open .rdv-banner[data-tone='confirmed']",
            wait: ".rdv-panel.open .rdv-banner[data-tone='confirmed']",
        },
    ],
    outcome: {
        title: "Le RDV est validé",
        detail: "Il quitte la file d'attente, et le client peut désormais recevoir ses emails automatiques pour ce RDV.",
        target: ".rdv-panel.open .rdv-banner[data-tone='confirmed']",
    },
};
