import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Mail, Megaphone, Server, type LucideIcon } from "lucide-react";
import type { Tone } from "@/components/ui/recipes";

export type MailboxProvider = "GMAIL" | "OUTLOOK" | "CUSTOM" | "REACHINBOX";

export interface MailboxRow {
    id: string;
    provider: MailboxProvider;
    email: string;
    displayName: string | null;
    type: string;
    syncStatus: "PENDING" | "SYNCING" | "SYNCED" | "ERROR" | string;
    warmupStatus: string;
    healthScore: number;
    dailySendLimit: number;
    sentToday: number;
    lastSyncAt: string | null;
    lastError: string | null;
    isActive: boolean;
    createdAt: string;
    ownerId?: string;
    owner?: { id: string; name: string } | null;
    isOwn?: boolean;
    _count: { threads: number; emails: number };
}

export interface MailboxDetail extends MailboxRow {
    signature: string | null;
    signatureHtml: string | null;
    warmupDailyLimit: number;
    trackingDomain: string | null;
    consecutiveFailures: number;
    lastFailureAt: string | null;
    disabledAt: string | null;
    disabledReason: string | null;
    lastSendReset: string;
    sentTodayEffective: number;
    updatedAt: string;
    _count: { threads: number; emails: number; sequences?: number };
}

export interface UsageMission {
    id: string;
    name: string;
    status: string;
    defaultMailboxId: string | null;
    client: { id: string; name: string } | null;
}

export interface MailboxUsage {
    missions: UsageMission[];
    clients: { id: string; name: string }[];
    missionOptions: UsageMission[];
}

export const PROVIDER_META: Record<MailboxProvider, { label: string; icon: LucideIcon }> = {
    GMAIL: { label: "Gmail", icon: Mail },
    OUTLOOK: { label: "Outlook", icon: Mail },
    CUSTOM: { label: "IMAP / SMTP", icon: Server },
    REACHINBOX: { label: "ReachInbox", icon: Megaphone },
};

export function relative(date: string | null | undefined): string | null {
    if (!date) return null;
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr });
}

export interface HealthState {
    tone: Tone;
    label: string;
    pulse?: boolean;
    /** Error message to show under the status. */
    error?: string | null;
}

/** One line that says whether the mailbox works right now. */
export function mailboxHealth(m: MailboxRow, sentToday: number): HealthState {
    if (!m.isActive) return { tone: "neutral", label: "Désactivée" };
    if (m.syncStatus === "ERROR") {
        const when = relative(m.lastSyncAt);
        return {
            tone: "danger",
            label: m.provider === "REACHINBOX" ? "Erreur de lecture ReachInbox" : "Erreur de synchronisation",
            error: m.lastError || (when ? `Dernière synchro réussie ${when}` : null),
        };
    }
    if (m.syncStatus === "SYNCING") return { tone: "info", label: "Synchronisation en cours…", pulse: true };
    if (m.dailySendLimit > 0 && sentToday >= m.dailySendLimit) {
        return { tone: "warning", label: "Limite d'envoi du jour atteinte" };
    }
    if (m.syncStatus === "SYNCED") {
        const when = relative(m.lastSyncAt);
        return { tone: "success", label: when ? `Synchronisée ${when}` : "Synchronisée" };
    }
    return { tone: "neutral", label: "Jamais synchronisée" };
}

export const OAUTH_ERRORS: Record<string, string> = {
    access_denied: "Connexion annulée : l'accès n'a pas été autorisé.",
    missing_params: "Le fournisseur n'a pas renvoyé toutes les informations. Réessayez.",
    invalid_state: "Lien de connexion invalide. Relancez la connexion.",
    state_mismatch: "La connexion a été lancée depuis un autre compte. Relancez-la.",
    state_expired: "La demande a expiré. Relancez la connexion.",
    no_email: "Impossible de lire l'adresse email du compte.",
    callback_failed: "La connexion a échoué côté serveur. Réessayez.",
};
