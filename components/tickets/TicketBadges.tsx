import { cn } from "@/lib/utils";
import {
    TICKET_CATEGORY_LABELS,
    TICKET_PRIORITY_LABELS,
    TICKET_SCOPE_LABELS,
    TICKET_STATUS_LABELS,
} from "@/lib/tickets/constants";
import type { TaskPriority, TicketCategory, TicketScope, TicketStatus } from "./types";

const PILL = "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border whitespace-nowrap";

const STATUS_STYLES: Record<TicketStatus, string> = {
    NEW: "bg-slate-100 text-slate-700 border-slate-200",
    TODO: "bg-sky-50 text-sky-700 border-sky-200",
    IN_PROGRESS: "bg-indigo-50 text-indigo-700 border-indigo-200",
    BLOCKED: "bg-red-50 text-red-700 border-red-200",
    TESTING: "bg-violet-50 text-violet-700 border-violet-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const STATUS_DOTS: Record<TicketStatus, string> = {
    NEW: "bg-slate-400",
    TODO: "bg-sky-500",
    IN_PROGRESS: "bg-indigo-500",
    BLOCKED: "bg-red-500",
    TESTING: "bg-violet-500",
    COMPLETED: "bg-emerald-500",
};

const PRIORITY_STYLES: Record<TaskPriority, string> = {
    URGENT: "bg-red-50 text-red-700 border-red-200",
    HIGH: "bg-orange-50 text-orange-700 border-orange-200",
    MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
    LOW: "bg-slate-100 text-slate-600 border-slate-200",
};

const CATEGORY_STYLES: Record<TicketCategory, string> = {
    BUG: "bg-rose-50 text-rose-700 border-rose-200",
    IMPROVEMENT: "bg-teal-50 text-teal-700 border-teal-200",
    FEATURE_REQUEST: "bg-indigo-50 text-indigo-700 border-indigo-200",
    TECHNICAL_SUPPORT: "bg-slate-100 text-slate-700 border-slate-200",
};

const SCOPE_STYLES: Record<TicketScope, string> = {
    INTERNAL: "bg-slate-100 text-slate-600 border-slate-200",
    CLIENT_FACING: "bg-sky-50 text-sky-700 border-sky-200",
    MISSION_RELATED: "bg-purple-50 text-purple-700 border-purple-200",
};

export function TicketStatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
    return (
        <span className={cn(PILL, STATUS_STYLES[status], className)}>
            <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOTS[status])} />
            {TICKET_STATUS_LABELS[status]}
        </span>
    );
}

export function TicketPriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }) {
    return <span className={cn(PILL, PRIORITY_STYLES[priority], className)}>{TICKET_PRIORITY_LABELS[priority]}</span>;
}

export function TicketCategoryBadge({ category, className }: { category: TicketCategory; className?: string }) {
    return <span className={cn(PILL, CATEGORY_STYLES[category], className)}>{TICKET_CATEGORY_LABELS[category]}</span>;
}

export function TicketScopeBadge({ scope, className }: { scope: TicketScope; className?: string }) {
    return <span className={cn(PILL, SCOPE_STYLES[scope], className)}>{TICKET_SCOPE_LABELS[scope]}</span>;
}
