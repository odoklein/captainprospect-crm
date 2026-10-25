import { SUPPORTED_TEMPLATE_VARIABLES } from "@/lib/email/constants";

export interface VariableChip {
    name: string;
    label: string;
    group: "Contact" | "Entreprise" | "Expéditeur" | "Mission" | "Date";
}

/** The chips shown first — what 90 % of cold emails use. */
export const PRIMARY_VARIABLES: VariableChip[] = [
    { name: "firstName", label: "Prénom", group: "Contact" },
    { name: "lastName", label: "Nom", group: "Contact" },
    { name: "companyName", label: "Entreprise", group: "Entreprise" },
    { name: "title", label: "Poste", group: "Contact" },
    { name: "senderName", label: "Mon nom", group: "Expéditeur" },
];

const GROUP: Record<string, VariableChip["group"]> = {
    contact: "Contact",
    company: "Entreprise",
    date: "Date",
    sender: "Expéditeur",
};

const EXTRA: VariableChip[] = [
    { name: "senderFirstName", label: "Mon prénom", group: "Expéditeur" },
    { name: "senderEmail", label: "Mon email", group: "Expéditeur" },
    { name: "senderPhone", label: "Mon téléphone", group: "Expéditeur" },
    { name: "senderTitle", label: "Mon poste", group: "Expéditeur" },
    { name: "missionName", label: "Mission", group: "Mission" },
    { name: "clientName", label: "Client", group: "Mission" },
];

const SHORT_LABELS: Record<string, string> = {
    fullName: "Nom complet",
    email: "Email",
    phone: "Téléphone",
    linkedin: "LinkedIn",
    company: "Entreprise (alias)",
    industry: "Secteur",
    website: "Site web",
    country: "Pays",
    companySize: "Taille",
    currentDate: "Date du jour",
    currentDay: "Jour",
    currentMonth: "Mois",
    currentYear: "Année",
};

// (EXTRA is declared above ALL_VARIABLES on purpose: it is used in its filter.)

export const ALL_VARIABLES: VariableChip[] = [
    ...PRIMARY_VARIABLES,
    ...SUPPORTED_TEMPLATE_VARIABLES.filter(
        (v) => ![...PRIMARY_VARIABLES, ...EXTRA].some((p) => p.name === v.name) && v.name !== "company",
    ).map((v) => ({ name: v.name, label: SHORT_LABELS[v.name] ?? v.description, group: GROUP[v.category] ?? "Contact" })),
    ...EXTRA,
];
