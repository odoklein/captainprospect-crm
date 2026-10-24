// ============================================
// SDR PROSPECT SUBMISSIONS — shared types
// An SDR on the phone is sent to a confrère at another firm, or the client
// forwards an inbound lead: the SDR adds that company + contact to the
// mission's base. Per mission a manager chooses OFF / VALIDATION / DIRECT
// (lib/prospect-submissions/settings.ts). Duplicates and blacklisted
// prospects are always refused, whatever the mode.
// ============================================

export type ProspectCreationMode = "OFF" | "VALIDATION" | "DIRECT";

export const PROSPECT_CREATION_MODES: ProspectCreationMode[] = ["OFF", "VALIDATION", "DIRECT"];

/** Why the SDR is adding this prospect. */
export type ProspectSource = "REFERRAL" | "CLIENT_INBOUND" | "OTHER";

export const PROSPECT_SOURCE_LABELS: Record<ProspectSource, string> = {
    REFERRAL: "Recommandé par l'interlocuteur",
    CLIENT_INBOUND: "Lead entrant transmis par le client",
    OTHER: "Autre",
};

export interface ProspectCompanyInput {
    name: string;
    phone?: string | null;
    website?: string | null;
    city?: string | null;
}

export interface ProspectContactInput {
    civility?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
    phone?: string | null;
    email?: string | null;
}

/** Who sent the SDR towards this prospect (the contact/company on screen). */
export interface ProspectReferrer {
    contactId?: string | null;
    companyId?: string | null;
    label: string;
}

/** A submission waiting for a manager (stored as one SystemConfig row). */
export interface PendingProspectSubmission {
    v: 1;
    id: string;
    missionId: string;
    listId: string;
    sdrId: string;
    sdrName: string;
    createdAt: string;
    source: ProspectSource;
    note: string | null;
    referrer: ProspectReferrer | null;
    company: ProspectCompanyInput;
    contact: ProspectContactInput | null;
    /** Set when the SDR adds a contact to a company already in the base. */
    existingCompanyId: string | null;
}

/** Provenance of a company/contact created through this flow. */
export interface ProspectOrigin {
    v: 1;
    addedById: string;
    addedByName: string;
    source: ProspectSource;
    note: string | null;
    referrer: ProspectReferrer | null;
    mode: "VALIDATION" | "DIRECT";
    approvedById: string | null;
    approvedByName: string | null;
    contactId: string | null;
    at: string;
}
