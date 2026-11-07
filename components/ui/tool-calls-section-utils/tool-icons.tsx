/**
 * Tool categories: which family a tool belongs to, its French label and its
 * tile (a lucide icon on a soft, role-coloured square). Shared by the
 * ToolCallsSection primitive and the assistant's trace (components/assistant-ui/ToolTrace.tsx).
 */

import type { ReactNode } from "react";
import {
    ArrowLeftRight,
    BarChart3,
    Brain,
    Building2,
    CalendarDays,
    Database,
    FileText,
    FolderKanban,
    KeyRound,
    ListTodo,
    Mail,
    PieChart,
    Phone,
    Search,
    SquareTerminal,
    Users,
    Wrench,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolCategory =
    | "search"
    | "stats"
    | "contacts"
    | "calls"
    | "meetings"
    | "structure"
    | "documents"
    | "email"
    | "tasks"
    | "credentials"
    | "memory"
    | "database"
    | "visuals"
    | "projects"
    | "executor"
    | "handoff"
    | "general";

interface CategoryMeta {
    label: string;
    icon: LucideIcon;
    /** Role classes: soft background + its ink. */
    tone: string;
}

export const TOOL_CATEGORY_META: Record<ToolCategory, CategoryMeta> = {
    search: { label: "Recherche", icon: Search, tone: "bg-primary-soft text-primary-soft-ink" },
    stats: { label: "Statistiques", icon: BarChart3, tone: "bg-accent-soft text-accent-soft-ink" },
    contacts: { label: "Contacts", icon: Users, tone: "bg-info-soft text-info-ink" },
    calls: { label: "Appels", icon: Phone, tone: "bg-success-soft text-success-ink" },
    meetings: { label: "Rendez-vous", icon: CalendarDays, tone: "bg-warning-soft text-warning-ink" },
    structure: { label: "Missions & équipes", icon: Building2, tone: "bg-surface-3 text-ink-2" },
    documents: { label: "Documents", icon: FileText, tone: "bg-info-soft text-info-ink" },
    email: { label: "E-mails", icon: Mail, tone: "bg-primary-soft text-primary-soft-ink" },
    tasks: { label: "Tâches", icon: ListTodo, tone: "bg-success-soft text-success-ink" },
    credentials: { label: "Accès", icon: KeyRound, tone: "bg-danger-soft text-danger-ink" },
    memory: { label: "Mémoire", icon: Brain, tone: "bg-accent-soft text-accent-soft-ink" },
    database: { label: "Base de données", icon: Database, tone: "bg-surface-3 text-ink-2" },
    visuals: { label: "Visuels", icon: PieChart, tone: "bg-accent-soft text-accent-soft-ink" },
    projects: { label: "Projet", icon: FolderKanban, tone: "bg-primary-soft text-primary-soft-ink" },
    executor: { label: "Exécution", icon: SquareTerminal, tone: "bg-surface-3 text-ink-2" },
    handoff: { label: "Relais", icon: ArrowLeftRight, tone: "bg-warning-soft text-warning-ink" },
    general: { label: "Outil", icon: Wrench, tone: "bg-surface-3 text-ink-3" },
};

/** Aliases for integration ids that are not CRM categories (gmail, google_calendar…). */
const CATEGORY_ALIASES: Record<string, ToolCategory> = {
    gmail: "email",
    outlook: "email",
    google_calendar: "meetings",
    calendar: "meetings",
};

/** First match wins: the order settles names that hit two families. */
const NAME_RULES: ReadonlyArray<[RegExp, ToolCategory]> = [
    [/^admin_db|_sql$/, "database"],
    [/credential|password|portal_account|access/, "credentials"],
    [/remember|memor|forget/, "memory"],
    [/visual/, "visuals"],
    [/email|send_draft/, "email"],
    [/task/, "tasks"],
    [/appointment|meeting|rdv/, "meetings"],
    [/call|transcript|activit/, "calls"],
    [/contact|compan|lead/, "contacts"],
    [/^(whoami|list_projects|get_project_overview)$/, "projects"],
    [/stats|report|metric|overview|quality|status|finding/, "stats"],
    [/document|file|playbook|draft|pdf|xlsx|pptx/, "documents"],
    [/client|mission|campaign|list|team|user|exclusion/, "structure"],
    [/search|help|tool_group/, "search"],
];

/** A CRM tool name (search_calls, get_rdv_overview…) to its category. */
export function toolCategoryOf(toolName: string): ToolCategory {
    const name = toolName.toLowerCase();
    for (const [rule, category] of NAME_RULES) if (rule.test(name)) return category;
    return "general";
}

/** A free category string (CRM or integration id) to a known category, or null. */
export function resolveToolCategory(category: string): ToolCategory | null {
    const key = category.toLowerCase();
    if (key in TOOL_CATEGORY_META) return key as ToolCategory;
    return CATEGORY_ALIASES[key] ?? null;
}

export function toolCategoryLabel(category: ToolCategory): string {
    return TOOL_CATEGORY_META[category].label;
}

/** « search_contacts » → « Search contacts ». */
export function formatToolName(name: string): string {
    const words = name.replace(/[_-]+/g, " ").trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
}

/** The square tile for a category: `size` is the glyph, the tile adds padding around it. */
export function ToolCategoryTile({ category, size = 16, className }: { category: ToolCategory; size?: number; className?: string }) {
    const meta = TOOL_CATEGORY_META[category];
    const Icon = meta.icon;
    const box = Math.round(size * 1.5);
    return (
        <span
            className={cn("inline-flex shrink-0 items-center justify-center rounded-lg ring-2 ring-surface", meta.tone, className)}
            style={{ width: box, height: box }}
            aria-hidden
        >
            <Icon size={size} strokeWidth={1.9} />
        </span>
    );
}

/**
 * The icon for a ToolCallsSection entry: the integration's own image when one
 * is given, the category tile when the category is known, null otherwise (the
 * section then draws its generic tool tile).
 */
export function getToolCategoryIcon(category: string, dims: { width: number; height: number }, iconUrl?: string): ReactNode {
    if (iconUrl) {
        return (
            // Integration logos come from arbitrary hosts; next/image would need each one allow-listed.
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={iconUrl}
                alt=""
                width={dims.width + 8}
                height={dims.height + 8}
                className="rounded-lg bg-surface object-contain p-1 ring-2 ring-surface"
            />
        );
    }
    const resolved = resolveToolCategory(category);
    if (!resolved) return null;
    return <ToolCategoryTile category={resolved} size={Math.round(dims.width * 0.76)} />;
}
