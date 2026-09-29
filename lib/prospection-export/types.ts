/**
 * Shapes shared by the prospection export (manager → client deliverable).
 *
 * The export gives a client back the database they sent — same columns, same
 * order — with Captain Prospect's work appended to every line: treated or not,
 * current status, number of call attempts, comments, full history.
 */

export type ExportChannel = "CALL" | "EMAIL" | "LINKEDIN";

/** How the manager wants rows filtered on treatment. */
export type TreatmentFilter = "all" | "treated" | "untreated";

export interface ProspectionExportFilters {
    /** null = every active (non-archived) list of the mission. */
    listIds: string[] | null;
    /** Current status (result of the row's latest counted action). Empty = any. */
    statuses: string[];
    treatment: TreatmentFilter;
    /** The three filters below restrict which actions are counted. Empty = all. */
    sdrIds: string[];
    channels: ExportChannel[];
    from: Date | null;
    to: Date | null;
}

export const EMPTY_FILTERS: ProspectionExportFilters = {
    listIds: null,
    statuses: [],
    treatment: "all",
    sdrIds: [],
    channels: [],
    from: null,
    to: null,
};

/** One entry of List.importConfig.mappings, in the column order of the client's file. */
export interface ImportMapping {
    csvColumn: string;
    /** "company.name", "contact.email", "company.<customKey>", or "" when ignored. */
    targetField: string;
}

export interface ExportContact {
    id: string;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedin: string | null;
    additionalPhones: unknown;
    additionalEmails: unknown;
    customData: unknown;
    excludedAt: Date | null;
    exclusionId: string | null;
}

export interface ExportCompany {
    id: string;
    listId: string;
    name: string;
    industry: string | null;
    country: string | null;
    website: string | null;
    size: string | null;
    phone: string | null;
    customData: unknown;
    excludedAt: Date | null;
    exclusionId: string | null;
    contacts: ExportContact[];
}

export interface ExportAction {
    id: string;
    contactId: string | null;
    /** Company the action belongs to: its own companyId, or its contact's company. */
    ownerCompanyId: string | null;
    channel: ExportChannel;
    result: string;
    note: string | null;
    callSummary: string | null;
    callbackDate: Date | null;
    duration: number | null;
    meetingType: string | null;
    createdAt: Date;
    sdrId: string;
    sdrName: string;
}

export interface ExportList {
    id: string;
    name: string;
    source: string | null;
    isActive: boolean;
    isArchived: boolean;
    createdAt: Date;
    importedAt: Date | null;
    mappings: ImportMapping[] | null;
}

/** A line of the client's file: a contact, or a company that has no contact. */
export interface RowSource {
    company: ExportCompany;
    contact: ExportContact | null;
}

export interface RowTreatment {
    treated: boolean;
    actionCount: number;
    callCount: number;
    emailCount: number;
    linkedinCount: number;
    totalCallSeconds: number;
    firstActionAt: Date | null;
    lastActionAt: Date | null;
    lastResult: string | null;
    lastResultLabel: string;
    lastChannel: ExportChannel | null;
    lastSdrName: string | null;
    lastNote: string | null;
    lastCallSummary: string | null;
    nextCallbackAt: Date | null;
    /** When the (still valid) meeting was booked; null when there is none. */
    meetingBookedAt: Date | null;
    /** Scheduled meeting date, when the SDR entered one. */
    meetingAt: Date | null;
    meetingType: string | null;
    /** Newest first, one line per action. */
    historyLines: string[];
}

export interface ExportRow extends RowSource {
    /** Counted actions (after SDR / channel / period filters), oldest first. */
    actions: ExportAction[];
    treatment: RowTreatment;
}

/** Status vocabulary resolved for the mission (labels + which ones schedule a callback). */
export interface StatusVocabulary {
    labelFor: (code: string) => string;
    isCallback: (code: string) => boolean;
    /** Codes in the mission's display order. */
    orderedCodes: string[];
}

export const UNTREATED_LABEL = "Non traité";
