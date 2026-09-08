export interface Meeting {
  id: string;
  result: string;
  confirmationStatus?: "PENDING" | "CONFIRMED" | "CANCELLED";
  confirmationUpdatedAt?: string | null;
  confirmedAt?: string | null;
  confirmedById?: string | null;
  rdvFiche?: {
    contexte?: string;
    besoinsProblemes?: string;
    solutionsEnPlace?: string;
    objectionsFreins?: string;
    notesImportantes?: string;
    [k: string]: unknown;
  } | null;
  rdvFicheUpdatedAt?: string | null;
  callbackDate: string | null;
  channel: "CALL" | "EMAIL" | "LINKEDIN" | null;
  meetingType: string | null;
  meetingCategory: string | null;
  meetingAddress: string | null;
  meetingJoinUrl: string | null;
  meetingPhone: string | null;
  note: string | null;
  managerNote?: string | null;
  cancellationReason: string | null;
  createdAt: string;
  duration: number | null;
  callSummary?: string | null;
  callTranscription?: string | null;
  callRecordingUrl?: string | null;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedin: string | null;
    customData: unknown;
  } | null;
  company: {
    id: string;
    name: string;
    industry: string | null;
    country: string | null;
    size: string | null;
    website: string | null;
    phone?: string | null;
  } | null;
  campaign: { id: string; name: string };
  mission: { id: string; name: string };
  client: { id: string; name: string; industry: string | null } | null;
  sdr: { id: string; name: string; email: string };
  interlocuteur: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
  } | null;
  feedback: {
    outcome: string;
    recontact: string;
    note: string | null;
  } | null;
}

export interface Aggregates {
  totalCount: number;
  pendingCount?: number;
  upcomingCount: number;
  pastCount: number;
  cancelledCount: number;
  avgPerSdr: number;
  conversionRate: number;
  meetingsThisWeek: number;
  meetingsThisMonth: number;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export interface FilterOption {
  id: string;
  name: string;
  count?: number;
}

export type ViewMode = "list" | "calendar";
export type StatusFilter = "all" | "upcoming" | "past" | "cancelled";
export type DatePreset = "today" | "7days" | "30days" | "3months" | "custom";
export type MeetingTypeFilter = "VISIO" | "PHYSIQUE" | "TELEPHONIQUE";
export type MeetingCategoryFilter = "EXPLORATOIRE" | "BESOIN";
export type OutcomeFilter = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "NO_SHOW" | "NONE";
export type ConfirmationFilter = "all" | "PENDING" | "CONFIRMED" | "CANCELLED";
export type PanelTab = "detail" | "fiche" | "feedback" | "audio" | "history";
export type SortField = "createdAt" | "callbackDate" | "duration" | "contactName" | "companyName" | "sdrName";
export type SortDir = "asc" | "desc";
export type ChannelFilter = "CALL" | "EMAIL" | "LINKEDIN";

export interface QuickPreset {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export const QUICK_PRESETS: QuickPreset[] = [
  { id: "to_confirm", label: "À confirmer", icon: "⏳", description: "RDV à venir en attente de confirmation" },
  { id: "past_no_feedback", label: "Sans feedback", icon: "💬", description: "RDV passés sans retour renseigné" },
  { id: "no_audio", label: "Sans audio", icon: "🎙️", description: "RDV sans enregistrement Allo lié" },
  { id: "this_week", label: "Cette semaine", icon: "📅", description: "RDV créés cette semaine" },
  { id: "positive", label: "Positifs", icon: "✅", description: "RDV avec feedback positif" },
];

export interface MeetingFilters {
  search: string;
  statusFilter: StatusFilter;
  confirmationFilter: ConfirmationFilter;
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
  selectedClients: Set<string>;
  selectedMissions: Set<string>;
  selectedSdrs: Set<string>;
  selectedMeetingTypes: Set<MeetingTypeFilter>;
  selectedMeetingCategories: Set<MeetingCategoryFilter>;
  selectedOutcomes: Set<OutcomeFilter>;
  selectedChannels: Set<ChannelFilter>;
  hasAudio: boolean | null;
  hasFeedback: boolean | null;
  sortBy: SortField;
  sortDir: SortDir;
}

export interface LinkContactResult {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: { id: string; name: string } | null;
}
