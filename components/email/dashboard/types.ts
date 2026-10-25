// Payload of GET /api/email/dashboard/overview (app/api/email/dashboard/overview/route.ts).

export type BlockName = "setup" | "triage" | "mailboxes" | "sequences" | "templates" | "activity" | "kpis";
export type Block<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ContactRef {
    id: string;
    name: string | null;
    email: string | null;
    companyId: string | null;
    companyName: string | null;
    listId: string | null;
}

export interface SetupData {
    mailboxes: number;
    templates: number;
    sequences: number;
    reachInbox: boolean;
}

export interface TriageData {
    unread: {
        total: number;
        items: {
            id: string;
            subject: string;
            snippet: string | null;
            fromName: string | null;
            fromAddress: string | null;
            receivedAt: string;
            contact: ContactRef | null;
            mission: { id: string; name: string } | null;
            mailbox: { id: string; email: string };
        }[];
    };
    problems: {
        bounced: number;
        failed: number;
        items: {
            id: string;
            status: "BOUNCED" | "FAILED" | string;
            subject: string;
            to: string | null;
            threadId: string;
            error: string | null;
            bounceType: string | null;
            at: string;
            contact: ContactRef | null;
            mailbox: { id: string; email: string };
        }[];
    };
    mailboxErrors: {
        id: string;
        email: string;
        provider: string;
        syncStatus: string;
        error: string | null;
        disabled: boolean;
        lastSyncAt: string | null;
    }[];
    sequenceIssues: { id: string; name: string; reason: "no_steps" | "no_contacts" | "mailbox" | "limit" | "overdue"; detail: string }[];
}

export interface MailboxHealthRow {
    id: string;
    email: string;
    displayName: string | null;
    provider: string;
    syncStatus: "PENDING" | "SYNCING" | "SYNCED" | "ERROR" | string;
    warmupStatus: string;
    isActive: boolean;
    lastSyncAt: string | null;
    error: string | null;
    sentToday: number;
    dailySendLimit: number;
    ownerName: string | null;
}

export interface SequencesData {
    counts: { active: number; paused: number; draft: number };
    enrolled: number;
    inProgress: number;
    replied: number;
    nextSendAt: string | null;
    rows: {
        id: string;
        name: string;
        status: "ACTIVE" | "PAUSED" | string;
        mission: { id: string; name: string } | null;
        mailboxEmail: string;
        steps: number;
        enrolled: number;
        inProgress: number;
        replied: number;
        nextSendAt: string | null;
        sent7d: number[];
    }[];
}

export interface TemplatesData {
    total: number;
    activeMissions: number;
    top: { id: string; name: string; category: string; sends: number; uses: number; missions: number; lastUsedAt: string | null }[];
    missionsWithout: { total: number; items: { id: string; name: string; clientName: string | null }[] };
}

export interface ActivityEvent {
    id: string;
    emailId: string;
    kind: "received" | "sent" | "bounced" | "failed" | "opened" | "queued";
    at: string;
    subject: string;
    threadId: string;
    counterpart: string | null;
    contact: ContactRef | null;
    mission: { id: string; name: string } | null;
    sentByName: string | null;
    mailboxEmail: string;
    sequence: { id: string; name: string; step: number } | null;
    openCount?: number;
}

export interface MetricTotals {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    failed: number;
    tracked: number;
    inbound: number;
}

export interface MetricRates {
    openRate: number | null;
    clickRate: number | null;
    replyRate: number | null;
    bounceRate: number | null;
}

export interface KpisData {
    period: { preset: string; from: string; to: string; days: number };
    totals: MetricTotals;
    rates: MetricRates;
    responseTime: { medianMinutes: number | null; samples: number };
    trackedEver: number;
    truncated: boolean;
}

export interface OverviewBlocks {
    setup: SetupData;
    triage: TriageData;
    mailboxes: MailboxHealthRow[];
    sequences: SequencesData;
    templates: TemplatesData;
    activity: ActivityEvent[];
    kpis: KpisData;
}
