import type { Storyboard } from "../storyboard";

// Verified in app/manager/lists/[id]/page.tsx: KPI cards, « Santé de prospection » (coverage,
// end-of-prospection forecast), Sociétés / Contacts view toggle, row click → UnifiedActionDrawer.
export const ficheListe: Storyboard = {
    id: "fiche-liste",
    route: "/manager/lists",
    match: ["/manager/lists/*", "/manager/lists/*/edit"],
    section: "Prospection",
    title: "Fiche d'une liste",
    purpose: "Le détail d'un fichier de prospection : sa qualité, son avancement, et chaque société ou contact qu'il contient.",
    setup: async (p) => {
        await p.getByRole("link", { name: "Nordline — Fichier principal" }).first().click();
        await p.locator("h2:has-text('Santé de prospection')").waitFor();
    },
    steps: [
        {
            title: "Vérifiez la qualité du fichier",
            detail: "Contacts joignables, qualifiés, avec e-mail : de quoi savoir si la liste est exploitable.",
            kind: "point",
            target: (p) => p.getByText("Qualifiés / Actionnables", { exact: true }).locator("xpath=ancestor::div[contains(@class,'grid')][1]"),
        },
        {
            title: "Suivez la santé de prospection",
            detail: "Part des cibles déjà contactées et date de fin estimée, calculées sur les vrais appels.",
            kind: "point",
            target: (p) => p.getByText(/cibles prospectées/).first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]"),
        },
        {
            title: "Passez aux contacts",
            detail: "Basculez entre le répertoire des sociétés et l'annuaire des contacts.",
            kind: "click",
            target: (p) => p.getByRole("button", { name: /^Contacts \(/ }),
            result: (p) => p.locator("table").first(),
            before: async (p) => {
                await p.getByRole("button", { name: /^Contacts \(/ }).scrollIntoViewIfNeeded();
                await p.mouse.wheel(0, 260);
            },
        },
        {
            title: "Ouvrez une fiche",
            detail: "Coordonnées, historique des appels et prochaines actions, comme le voit le SDR.",
            kind: "click",
            target: (p) => p.locator("table tbody tr").first(),
            wait: 1800,
        },
    ],
    outcome: {
        title: "Toute l'histoire d'un prospect",
        detail: "Vous voyez ce qui a été fait sur ce contact et pouvez corriger ses informations.",
    },
};
