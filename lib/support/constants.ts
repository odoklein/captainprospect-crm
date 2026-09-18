import type { SupportIntent } from "./types";

export const DEFAULT_QUICK_REPLIES: string[] = [
    "Merci pour le suivi.",
    "Pouvez-vous me rappeler demain ?",
    "J'ai bien reçu le document, merci !",
    "Pouvez-vous m'envoyer un rapport détaillé ?",
    "Quand aura lieu la prochaine mise à jour ?",
];

export const PORTAL_PAGE_LABELS: Record<string, string> = {
    "/client/portal": "Tableau de bord",
    "/client/portal/meetings": "Mes RDV",
    "/client/portal/reporting": "Rapports",
    "/client/portal/activite": "Activité",
    "/client/contact": "Messages",
    "/client/portal/email": "Mon Email",
    "/client/portal/database": "Base de données",
    "/client/portal/files": "Fichiers",
    "/client/portal/sales-playbook": "Sales Playbook",
    "/client/portal/aide": "Aide",
    "/client/portal/settings": "Paramètres",
    "/commercial": "Espace Commercial",
    "/commercial/meetings": "Mes RDV",
};

export function resolvePageLabel(pathname: string | null): string {
    if (!pathname) return "Portail";
    const exact = PORTAL_PAGE_LABELS[pathname];
    if (exact) return exact;
    const prefix = Object.keys(PORTAL_PAGE_LABELS)
        .filter((k) => pathname.startsWith(k))
        .sort((a, b) => b.length - a.length)[0];
    return prefix ? PORTAL_PAGE_LABELS[prefix] : "Portail";
}

export const INTENT_CARD_CONFIG: Record<
    SupportIntent,
    { label: string; icon: string; desc: string; bg: string; border: string; color: string }
> = {
    RDV: {
        label: "Question RDV",
        icon: "📅",
        desc: "Report, annulation ou question sur un créneau",
        bg: "#ECE8FF",
        border: "rgba(99,102,241,0.25)",
        color: "#4F46E5",
    },
    RAPPORT: {
        label: "Rapport / Stats",
        icon: "📊",
        desc: "Question sur vos statistiques ou résultats",
        bg: "#E4EEF4",
        border: "rgba(21,91,122,0.18)",
        color: "#155B7A",
    },
    PROBLEME: {
        label: "Problème",
        icon: "🔧",
        desc: "Un dysfonctionnement ou bug constaté",
        bg: "#FBEAD1",
        border: "rgba(201,123,42,0.22)",
        color: "#8A4A00",
    },
    AUTRE: {
        label: "Autre besoin",
        icon: "💬",
        desc: "Toute autre demande ou précision",
        bg: "#EFEEE7",
        border: "rgba(43,58,43,0.14)",
        color: "#2B3A2B",
    },
};
