import type { VaultAuditAction, VaultCredentialType } from "@prisma/client";

/**
 * What the browser is allowed to know about a credential.
 *
 * `hasPassword` replaces the password itself: the ciphertext never leaves the
 * server, and the plaintext only ever travels as the single-field response of
 * the explicit reveal endpoint.
 */
export interface VaultCredentialDTO {
    id: string;
    type: VaultCredentialType;
    label: string;
    login: string;
    url: string | null;
    notes: string | null;
    hasPassword: boolean;

    client: { id: string; name: string };
    mission: { id: string; name: string } | null;
    interlocuteur: { id: string; name: string } | null;
    /** Set when this credential is a Captain Prospect portal account. */
    portalUser: { id: string; email: string; role: string } | null;

    createdBy: { id: string; name: string } | null;
    updatedBy: { id: string; name: string } | null;
    lastRevealedAt: string | null;
    lastRevealedBy: { id: string; name: string } | null;
    lastSentAt: string | null;
    lastSentTo: string | null;

    createdAt: string;
    updatedAt: string;
}

export interface VaultAuditEventDTO {
    id: string;
    action: VaultAuditAction;
    summary: string;
    actor: { id: string; name: string } | null;
    credentialId: string | null;
    clientId: string | null;
    createdAt: string;
}

export const VAULT_TYPE_LABELS: Record<VaultCredentialType, string> = {
    PORTAL: "Portail Captain Prospect",
    EMAIL: "Boîte email",
    CALENDAR: "Agenda",
    CRM_EXTERNAL: "CRM externe",
    LINKEDIN: "LinkedIn",
    PHONE_TOOL: "Téléphonie",
    OTHER: "Autre",
};
