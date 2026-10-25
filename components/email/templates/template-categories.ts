// ============================================
// EMAIL TEMPLATE CATEGORIES (client + server safe)
// The DB holds a mix of legacy values ("sales", "general", "follow-up") and the
// mission workspace's upper-case ones (OUTREACH, FOLLOW_UP…). Everything is read
// through normalizeTemplateCategory() and written as a canonical value, the same
// set MissionWorkspace and the call-screen drawer already understand.
// ============================================

export type TemplateCategory = "OUTREACH" | "FOLLOW_UP" | "NURTURE" | "CLOSING" | "OTHER";

export const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string; hint: string }[] = [
    { value: "OUTREACH", label: "Prospection", hint: "Premier contact, présentation" },
    { value: "FOLLOW_UP", label: "Relance", hint: "Après un appel ou un premier email" },
    { value: "NURTURE", label: "Suivi", hint: "Garder le lien, contenu utile" },
    { value: "CLOSING", label: "Conclusion", hint: "Confirmation, prise de rendez-vous" },
    { value: "OTHER", label: "Général", hint: "Tout le reste" },
];

const ALIASES: Record<string, TemplateCategory> = {
    outreach: "OUTREACH",
    sales: "OUTREACH",
    intro: "OUTREACH",
    introduction: "OUTREACH",
    prospection: "OUTREACH",
    commercial: "OUTREACH",
    follow_up: "FOLLOW_UP",
    "follow-up": "FOLLOW_UP",
    followup: "FOLLOW_UP",
    relance: "FOLLOW_UP",
    nurture: "NURTURE",
    nurturing: "NURTURE",
    suivi: "NURTURE",
    closing: "CLOSING",
    conclusion: "CLOSING",
};

export function normalizeTemplateCategory(raw: string | null | undefined): TemplateCategory {
    if (!raw) return "OTHER";
    return ALIASES[raw.trim().toLowerCase()] ?? "OTHER";
}

export function templateCategoryLabel(raw: string | null | undefined): string {
    const value = normalizeTemplateCategory(raw);
    return TEMPLATE_CATEGORIES.find((c) => c.value === value)?.label ?? "Général";
}
