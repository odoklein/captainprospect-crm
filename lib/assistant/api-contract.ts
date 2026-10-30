/**
 * Wire contract between the Captain AI routes and the browser (Captain AI v4).
 *
 * Types only, importable from client components. Every route under
 * /api/manager/assistant/* and /api/manager/agent/* answers with the repo's
 * `successResponse(data)` envelope, i.e. `{ success: true, data: <T> }`, and
 * errors with `{ success: false, error: string }` (French). Dates travel as ISO
 * strings. Ids are cuids. A route never returns something the viewer may not
 * read; a denied id answers 404, never 403, so ids cannot be probed.
 *
 * When the v4 tables are missing on an instance, list routes return empty
 * lists with `degraded: true` instead of failing.
 */

// ============================================
// Paths
// ============================================

export const ASSISTANT_API = {
    folders: "/api/manager/assistant/folders",
    folder: (id: string) => `/api/manager/assistant/folders/${id}`,
    ensureClientFolder: "/api/manager/assistant/folders/ensure",
    folderFiles: (id: string) => `/api/manager/assistant/folders/${id}/files`,
    folderFile: (folderId: string, fileId: string) => `/api/manager/assistant/folders/${folderId}/files/${fileId}`,
    folderFileReindex: (folderId: string, fileId: string) => `/api/manager/assistant/folders/${folderId}/files/${fileId}/reindex`,
    folderIndexProject: (id: string) => `/api/manager/assistant/folders/${id}/files/index-project`,
    folderPins: (id: string) => `/api/manager/assistant/folders/${id}/pins`,
    pin: (folderId: string, pinId: string) => `/api/manager/assistant/folders/${folderId}/pins/${pinId}`,
    pinRefresh: (folderId: string, pinId: string) => `/api/manager/assistant/folders/${folderId}/pins/${pinId}/refresh`,
    memories: "/api/manager/assistant/memories",
    memory: (id: string) => `/api/manager/assistant/memories/${id}`,
    memoryRestore: (id: string) => `/api/manager/assistant/memories/${id}/restore`,
    conversations: "/api/manager/assistant/conversations",
    conversation: (id: string) => `/api/manager/assistant/conversations/${id}`,
    conversationFork: (id: string) => `/api/manager/assistant/conversations/${id}/fork`,
    messageFeedback: (conversationId: string, messageId: string) =>
        `/api/manager/assistant/conversations/${conversationId}/messages/${messageId}/feedback`,
    search: "/api/manager/assistant/search",
    chat: "/api/manager/assistant/chat",
    execute: "/api/manager/assistant/execute",
    usage: "/api/ai/usage",
} as const;

export const AGENT_API = {
    overview: "/api/manager/agent/overview",
    playbooks: "/api/manager/agent/playbooks",
    jobs: "/api/manager/agent/jobs",
    job: (id: string) => `/api/manager/agent/jobs/${id}`,
    jobRun: (id: string) => `/api/manager/agent/jobs/${id}/run`,
    runs: "/api/manager/agent/runs",
    run: (id: string) => `/api/manager/agent/runs/${id}`,
    runCancel: (id: string) => `/api/manager/agent/runs/${id}/cancel`,
    missions: "/api/manager/agent/missions",
    findings: "/api/manager/agent/findings",
    finding: (id: string) => `/api/manager/agent/findings/${id}`,
    proposalDecide: (id: string) => `/api/manager/agent/proposals/${id}/decide`,
    proposalsDecideBatch: "/api/manager/agent/proposals/decide-batch",
} as const;

// ============================================
// Shared
// ============================================

export type IsoDate = string;

export interface ApiOk<T> {
    success: true;
    data: T;
}
export interface ApiErr {
    success: false;
    error: string;
}
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export interface Page<T> {
    items: T[];
    /** Opaque; pass back as `cursor` for the next page. Null = last page. */
    nextCursor: string | null;
    degraded?: boolean;
}

// ============================================
// Folders
// ============================================

export type FolderKind = "CLIENT" | "GENERAL";

export interface FolderCounts {
    conversations: number;
    memories: number;
    files: number;
    pins: number;
}

export interface FolderCard {
    id: string;
    kind: FolderKind;
    name: string;
    /** A --ds token name or hex; null = derive from the name. */
    color: string | null;
    /** lucide-react icon name; null = default (Building2 for CLIENT, Folder for GENERAL). */
    icon: string | null;
    clientId: string | null;
    counts: FolderCounts;
    lastActivityAt: IsoDate | null;
    /** An agent finding or proposal is open for this folder. */
    hasAgentActivity: boolean;
}

/** A client that has no folder row yet: the UI shows it and calls ensureClientFolder on open. */
export interface VirtualClientFolder {
    clientId: string;
    name: string;
    missions: Array<{ id: string; name: string; status: string }>;
    folder: FolderCard | null;
}

export interface FolderListResponse {
    general: FolderCard[];
    clients: VirtualClientFolder[];
    pinnedConversations: ConversationCard[];
    degraded?: boolean;
}

export interface FolderDetail extends FolderCard {
    instructions: string | null;
    /** Rough token count of the instructions, against `instructionsMaxTokens`. */
    instructionsTokens: number;
    instructionsMaxTokens: number;
    starterQuestions: string[];
    missions: Array<{ id: string; name: string; status: string }>;
    createdAt: IsoDate;
    archivedAt: IsoDate | null;
}

export interface CreateFolderBody {
    name: string;
    color?: string | null;
    icon?: string | null;
    instructions?: string | null;
}

export interface EnsureClientFolderBody {
    clientId: string;
}

export interface PatchFolderBody {
    name?: string;
    color?: string | null;
    icon?: string | null;
    /** Refused (400) above instructionsMaxTokens. */
    instructions?: string | null;
    starterQuestions?: string[];
    archived?: boolean;
}

// ============================================
// Conversations and messages
// ============================================

export type ConversationKind = "CHAT" | "AGENT";
export type Visibility = "PRIVATE" | "SHARED";

export interface ConversationCard {
    id: string;
    title: string;
    kind: ConversationKind;
    visibility: Visibility;
    pinnedAt: IsoDate | null;
    folderId: string | null;
    clientId: string | null;
    missionId: string | null;
    missionName: string | null;
    messageCount: number;
    lastMessageAt: IsoDate | null;
    createdAt: IsoDate;
    isOwner: boolean;
    ownerName: string | null;
    /** First ~140 chars of the last assistant answer, follow-up block removed. */
    preview: string | null;
}

/**
 * GET conversations: `?folderId=<id>` | `?scope=agency` (no folder, no client)
 * | `?pinned=1`, plus `q`, `cursor`, `limit` (default 30, max 100).
 */
export type ConversationsResponse = Page<ConversationCard>;

export interface CreateConversationBody {
    folderId?: string | null;
    /** Without folderId: the CLIENT folder is ensured and used. */
    clientId?: string | null;
    missionId?: string | null;
    /** Fork / continue: seeds the summary of the new thread. */
    seedSummary?: string | null;
    title?: string | null;
}

export interface MessageFeedback {
    rating: "up" | "down";
    comment?: string | null;
    at: IsoDate;
    by: string;
}

export interface ThreadMessage {
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    createdAt: IsoDate;
    /** Persisted turn trace (entries, usage, citations, verification, visuals…), as written by the chat route. */
    trace: unknown | null;
    /** Pending/settled confirmation card, as stored by the chat route. */
    action: unknown | null;
    attachments: Array<{ fileId: string; name: string; status: string }> | null;
    feedback: MessageFeedback | null;
}

/** GET conversations/[id]?before=<messageId>&limit=60 — newest page first, returned oldest→newest. */
export interface ThreadResponse {
    conversation: ConversationCard & { summary: string | null; folder: FolderCard | null };
    messages: ThreadMessage[];
    /** Pass as `before` to load older messages. Null = beginning of the thread. */
    olderCursor: string | null;
    canWrite: boolean;
}

export interface PatchConversationBody {
    title?: string;
    /** Move rules: only between GENERAL folders and agency view; a CLIENT folder only holds its client's threads. */
    folderId?: string | null;
    visibility?: Visibility;
    pinned?: boolean;
}

export interface FeedbackBody {
    rating: "up" | "down" | null;
    comment?: string | null;
}

export interface SearchResponse {
    conversations: Array<{ id: string; title: string; folderId: string | null; snippet: string; lastMessageAt: IsoDate | null }>;
    folders: Array<{ id: string; name: string; kind: FolderKind; clientId: string | null }>;
    files: Array<{ fileId: string; folderId: string; name: string; snippet: string | null }>;
}

/** Extra fields the chat route accepts on top of { conversationId, message, depth, stream }. */
export interface ChatBodyExtras {
    attachmentFileIds?: string[];
    /** Replace the last assistant answer. */
    regenerateMessageId?: string;
    /** Replace the last user message (and its answer) with `message`. */
    editMessageId?: string;
}

// ============================================
// Memory
// ============================================

export type MemoryScope = "AGENCY" | "FOLDER" | "USER";
export type MemoryKind = "FACT" | "PREFERENCE" | "DECISION" | "CONTACT" | "GOAL";

export interface MemoryItem {
    id: string;
    scope: MemoryScope;
    kind: MemoryKind;
    content: string;
    pinned: boolean;
    folderId: string | null;
    missionId: string | null;
    source: { conversationId?: string | null; messageId?: string | null; by: "model" | "user" } | null;
    useCount: number;
    lastUsedAt: IsoDate | null;
    createdAt: IsoDate;
    updatedAt: IsoDate;
    deletedAt: IsoDate | null;
}

/** GET memories?folderId=&scope=&q=&includeDeleted=1 → the three layers visible from that folder. */
export interface MemoriesResponse {
    agency: MemoryItem[];
    folder: MemoryItem[];
    user: MemoryItem[];
    degraded?: boolean;
}

export interface CreateMemoryBody {
    scope: MemoryScope;
    folderId?: string | null;
    kind: MemoryKind;
    content: string;
    pinned?: boolean;
}

export interface PatchMemoryBody {
    content?: string;
    kind?: MemoryKind;
    pinned?: boolean;
}

// ============================================
// Files
// ============================================

export type FileTextStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED" | "NEEDS_OCR" | "UNSUPPORTED";

export interface FolderFile {
    fileId: string;
    name: string;
    mimeType: string;
    size: number;
    status: FileTextStatus;
    pages: number | null;
    chunkCount: number;
    tokens: number;
    error: string | null;
    uploadedByName: string | null;
    createdAt: IsoDate;
    extractedAt: IsoDate | null;
    /** Signed or authenticated download URL. */
    url: string | null;
}

export interface FolderFilesResponse {
    files: FolderFile[];
    /** Client files not indexed yet that index-project would pick up (CLIENT folders only). */
    indexableProjectFiles: number;
    degraded?: boolean;
}

/** POST folders/[id]/files — multipart field `file` (one or more). */
export interface UploadFilesResponse {
    files: FolderFile[];
    rejected: Array<{ name: string; reason: string }>;
}

export const FILE_ACCEPT = {
    "application/pdf": [".pdf"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    "text/csv": [".csv"],
    "text/markdown": [".md"],
    "text/plain": [".txt"],
} as const;

export const FILE_MAX_BYTES = 25 * 1024 * 1024;

// ============================================
// Pins (the folder "Tableau")
// ============================================

export interface PinItem {
    id: string;
    folderId: string;
    title: string;
    /** StoredVisual from lib/assistant/visuals/spec.ts. */
    visual: unknown;
    question: string | null;
    conversationId: string | null;
    messageId: string | null;
    position: number;
    refreshedAt: IsoDate | null;
    refreshError: string | null;
    createdAt: IsoDate;
}

export interface CreatePinBody {
    /** StoredVisual. */
    visual: unknown;
    title?: string;
    conversationId?: string | null;
    messageId?: string | null;
}

export interface PatchPinBody {
    title?: string;
    position?: number;
}

// ============================================
// Agent
// ============================================

export type AgentJobKind = "WATCH" | "REPORT" | "MISSION" | "DIGEST";
export type AgentRunStatus = "QUEUED" | "RUNNING" | "WAITING_APPROVAL" | "DONE" | "FAILED" | "CANCELLED" | "DEFERRED";
export type AgentStepStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
export type AgentProposalState = "PENDING" | "EXECUTING" | "APPROVED" | "REJECTED" | "EXECUTED" | "EXPIRED" | "FAILED";
export type AgentSeverity = "INFO" | "WARN" | "CRITICAL";
export type AgentFindingState = "OPEN" | "ACKED" | "SNOOZED" | "RESOLVED";

export interface AgentPlaybookItem {
    id: string;
    kind: AgentJobKind;
    label: string;
    description: string;
    scope: "agency" | "client" | "any";
    defaultSchedule: string | null;
    /** JSON Schema of the job config (from the playbook's zod schema), for the settings form. */
    configSchema: Record<string, unknown>;
}

export interface AgentJobItem {
    id: string;
    kind: AgentJobKind;
    playbook: string;
    playbookLabel: string;
    name: string;
    enabled: boolean;
    folderId: string | null;
    clientId: string | null;
    clientName: string | null;
    schedule: string | null;
    /** French rendering of the schedule, e.g. « Chaque lundi à 8:00 ». */
    scheduleLabel: string | null;
    timezone: string;
    config: Record<string, unknown>;
    lastRunAt: IsoDate | null;
    nextRunAt: IsoDate | null;
    lastStatus: AgentRunStatus | null;
    failures: number;
}

export interface CreateAgentJobBody {
    playbook: string;
    name?: string;
    folderId?: string | null;
    clientId?: string | null;
    missionId?: string | null;
    schedule?: string | null;
    enabled?: boolean;
    config?: Record<string, unknown>;
}

export type PatchAgentJobBody = Partial<Pick<CreateAgentJobBody, "name" | "schedule" | "enabled" | "config">>;

export interface AgentStepItem {
    id: string;
    index: number;
    phase: string;
    title: string;
    status: AgentStepStatus;
    tool: string | null;
    resultDigest: string | null;
    costEur: number;
    model: string | null;
    durationMs: number | null;
    error: string | null;
    startedAt: IsoDate | null;
    finishedAt: IsoDate | null;
}

export interface AgentRunCard {
    id: string;
    jobId: string | null;
    jobName: string | null;
    kind: AgentJobKind;
    playbook: string;
    trigger: "SCHEDULE" | "MANUAL" | "EVENT";
    status: AgentRunStatus;
    goal: string | null;
    summary: string | null;
    folderId: string | null;
    clientId: string | null;
    clientName: string | null;
    conversationId: string | null;
    findingsCount: number;
    proposalsCount: number;
    pendingProposals: number;
    costEur: number;
    mode: string;
    error: string | null;
    actorName: string | null;
    createdAt: IsoDate;
    startedAt: IsoDate | null;
    finishedAt: IsoDate | null;
}

export interface AgentRunDetail extends AgentRunCard {
    plan: { steps: Array<{ title: string; intent?: string; status?: string }> } | null;
    budget: { maxToolCalls?: number; maxCostEur?: number; deadlineMs?: number; maxSafeWrites?: number; maxPhases?: number };
    steps: AgentStepItem[];
    proposals: AgentProposalItem[];
    findings: AgentFindingItem[];
    /** The REPORT artifact, when the run produced one. */
    report: { artifactId: string; title: string; body: string; visuals: unknown[] } | null;
    heartbeatAt: IsoDate | null;
}

export interface AgentFindingItem {
    id: string;
    rule: string;
    severity: AgentSeverity;
    kind: string;
    title: string;
    body: string;
    metrics: Record<string, unknown> | null;
    folderId: string | null;
    clientId: string | null;
    clientName: string | null;
    subjectUserId: string | null;
    subjectName: string | null;
    state: AgentFindingState;
    firstSeenAt: IsoDate;
    lastSeenAt: IsoDate;
    seenCount: number;
    snoozedUntil: IsoDate | null;
    runId: string | null;
}

export interface PatchFindingBody {
    state: "ACKED" | "SNOOZED" | "RESOLVED" | "OPEN";
    /** Required with SNOOZED. */
    snoozedUntil?: IsoDate;
}

export interface AgentProposalItem {
    id: string;
    runId: string;
    tool: string;
    args: Record<string, unknown>;
    card: { title: string; details: Array<{ label: string; value: string }>; warning: string | null; confirmLabel: string; danger: boolean };
    rationale: string | null;
    risk: "confirm" | "safe_write";
    state: AgentProposalState;
    proposedAt: IsoDate;
    expiresAt: IsoDate;
    decidedByName: string | null;
    decidedAt: IsoDate | null;
    executedAt: IsoDate | null;
    outcome: string | null;
}

export interface DecideProposalBody {
    decision: "approve" | "reject";
}

export interface DecideProposalResponse {
    proposal: AgentProposalItem;
    /** Shown once, never stored (reveal_password-like tools). */
    secret?: { label: string; login: string; password: string } | null;
}

export interface DecideBatchBody {
    ids: string[];
    decision: "approve" | "reject";
}

export interface DecideBatchResponse {
    results: Array<{ id: string; ok: boolean; state: AgentProposalState; error?: string }>;
}

export interface CreateMissionBody {
    goal: string;
    folderId?: string | null;
    clientId?: string | null;
    missionId?: string | null;
    budget: "rapide" | "standard" | "approfondi";
    dryRun?: boolean;
}

export const MISSION_BUDGETS = {
    rapide: { maxCostEur: 1, deadlineMs: 5 * 60_000, maxToolCalls: 20, maxPhases: 4, maxSafeWrites: 2 },
    standard: { maxCostEur: 3, deadlineMs: 15 * 60_000, maxToolCalls: 60, maxPhases: 8, maxSafeWrites: 5 },
    approfondi: { maxCostEur: 8, deadlineMs: 40 * 60_000, maxToolCalls: 150, maxPhases: 14, maxSafeWrites: 8 },
} as const;

export interface AgentOverview {
    worker: { mode: "worker" | "lite" | "off"; seenAt: IsoDate | null; enabled: boolean };
    counts: { openFindings: number; critical: number; pendingProposals: number; running: number; queued: number };
    costTodayEur: number;
    recentRuns: AgentRunCard[];
    degraded?: boolean;
}

/** GET findings?state=OPEN&folderId=&severity=&cursor= ; GET runs?status=&folderId=&kind=&cursor= */
export type FindingsResponse = Page<AgentFindingItem>;
export type RunsResponse = Page<AgentRunCard>;
