export type MeetingResult = "MEETING_BOOKED" | "MEETING_CANCELLED";

export interface MeetingFeedbackData {
    id: string;
    outcome: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "NO_SHOW";
    recontactRequested: "YES" | "NO" | "MAYBE";
    clientNote?: string | null;
    createdAt: string;
}

export interface Meeting {
    id: string;
    createdAt: string;
    result?: MeetingResult;
    note?: string;
    callbackDate?: string | null;
    cancellationReason?: string;
    meetingType?: "VISIO" | "PHYSIQUE" | "TELEPHONIQUE" | null;
    meetingCategory?: "EXPLORATOIRE" | "BESOIN" | null;
    meetingAddress?: string | null;
    meetingJoinUrl?: string | null;
    meetingPhone?: string | null;
    confirmationStatus?: "PENDING" | "CONFIRMED" | "CANCELLED";
    meetingFeedback?: MeetingFeedbackData | null;
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        title: string | null;
        email: string | null;
        phone?: string | null;
        linkedin?: string | null;
        company: {
            id: string;
            name: string;
            country?: string | null;
            industry?: string | null;
            website?: string | null;
            size?: string | null;
            list?: {
                id: string;
                name: string;
            } | null;
        };
    };
    mission: {
        id: string;
        name: string;
        client: {
            id: string;
            name: string;
        };
    } | null;
    list?: {
        id: string;
        name: string;
    } | null;
}

export interface Mission {
    id: string;
    name: string;
    client: {
        name: string;
    };
}

export interface List {
    id: string;
    name: string;
    mission: {
        id: string;
        name: string;
    };
}

export type RdvStatus = "upcoming" | "past" | "cancelled";
export type DetailDrawerTab = "detail" | "note" | "history";
export type StatusFilter = RdvStatus | "all" | "confirmed" | "absent";
