// URL state of the manager « Espace clients » (/manager/clients).
//
//   ?client=<id>              client workspace (home = espace=missions)
//   &espace=<view>            client view
//   &page=<id>                client page (block editor)
//   &mission=<id>             mission brief
//   &tab=<panel>              mission panel (general = the brief itself)
//
// This query string is a contract: bookmarks, the redirects under
// app/manager/missions/**, the « Reprendre » entry kept in localStorage,
// Attention.tab (lib/manager/attention) and the e-mails / reports that link here
// all depend on it. Old names keep working through the alias tables below.
// Pure, so tests and server redirects read the same rules.

export type WorkspaceKey = "client" | "mission" | "tab" | "espace" | "page";
export const WORKSPACE_KEYS: readonly WorkspaceKey[] = ["client", "mission", "tab", "espace", "page"];

export type WorkspaceLocation = {
    client: string;
    mission?: string | null;
    tab?: string | null;
    espace?: string | null;
    page?: string | null;
};

/** Mission panels the workspace knows. `general` is the brief, `lancement` scrolls to the launch checklist. */
export const MISSION_TABS = ["general", "lancement", "audience", "strategies", "strategy", "emails", "equipe", "feedback", "reglages"] as const;
export type MissionTab = (typeof MISSION_TABS)[number];

/** Client views. `missions` is the client home. */
export const CLIENT_VIEWS = ["missions", "apercu", "parametres", "contrat", "onboarding", "acces", "activite", "avis-sdr", "sessions"] as const;
export type ClientView = (typeof CLIENT_VIEWS)[number];

/** Names older pages and links used for mission panels. */
export const MISSION_TAB_ALIASES: Readonly<Record<string, MissionTab>> = {
    assignments: "equipe",
    team: "equipe",
    campaigns: "strategies",
    strategy: "strategies",
    lists: "audience",
    bases: "audience",
    launch: "lancement",
    overview: "general",
    brief: "general",
    settings: "reglages",
    templates: "emails",
};

/** Names older pages and links used for client views. */
export const CLIENT_VIEW_ALIASES: Readonly<Record<string, ClientView>> = {
    home: "missions",
    accueil: "missions",
    apercu: "parametres",
    settings: "parametres",
    overview: "parametres",
    access: "acces",
    contacts: "acces",
    activity: "activite",
    feedback: "avis-sdr",
    comptes_rendus: "sessions",
    "comptes-rendus": "sessions",
    contract: "contrat",
};

function isMissionTab(value: string): value is MissionTab {
    return (MISSION_TABS as readonly string[]).includes(value);
}
function isClientView(value: string): value is ClientView {
    return (CLIENT_VIEWS as readonly string[]).includes(value);
}

/**
 * Canonical mission panel for any value a URL may carry. Unknown values fall
 * back to the brief rather than an empty drawer. `aliasMap` lets a caller
 * keep an old name live while its panel still exists (see ACTIVE_ALIASES).
 */
export function normalizeMissionTab(value: string | null | undefined, aliases: Readonly<Record<string, string>> = ACTIVE_MISSION_TAB_ALIASES): string {
    if (!value) return "general";
    const target = aliases[value] ?? value;
    return isMissionTab(target) ? target : "general";
}

export function normalizeClientView(value: string | null | undefined, aliases: Readonly<Record<string, string>> = ACTIVE_CLIENT_VIEW_ALIASES): string {
    if (!value) return "missions";
    const target = aliases[value] ?? value;
    return isClientView(target) ? target : "missions";
}

/**
 * Aliases that are live today. Phase-by-phase: a panel or view that still
 * exists under its own name keeps it until its successor ships, then the
 * full alias above takes over. Keeping both tables lets tests pin the final
 * contract while the app migrates.
 */
export const ACTIVE_MISSION_TAB_ALIASES: Readonly<Record<string, string>> = {
    ...MISSION_TAB_ALIASES,
    strategy: "strategy",
    campaigns: "strategy",
    templates: "strategy",
};
export const ACTIVE_CLIENT_VIEW_ALIASES: Readonly<Record<string, string>> = {
    ...CLIENT_VIEW_ALIASES,
    apercu: "apercu",
    settings: "apercu",
    overview: "apercu",
    contract: "apercu",
};

export interface ParsedWorkspace {
    client: string | null;
    mission: string | null;
    page: string | null;
    /** Canonical mission panel; "general" when none. */
    tab: string;
    /** Canonical client view; "missions" when none. */
    espace: string;
}

type ParamsLike = { get(name: string): string | null };

export function parseWorkspace(params: ParamsLike): ParsedWorkspace {
    const clean = (key: WorkspaceKey) => params.get(key)?.trim() || null;
    return {
        client: clean("client"),
        mission: clean("mission"),
        page: clean("page"),
        tab: normalizeMissionTab(clean("tab")),
        espace: normalizeClientView(clean("espace")),
    };
}

/**
 * The query string for a location, keeping unrelated params (e.g. ?bilan=)
 * from `current`. Defaults (tab=general, espace=missions) are left out so
 * links stay short; `null` goes back to the directory.
 */
export function buildWorkspaceSearch(next: WorkspaceLocation | null, current: string | URLSearchParams = ""): string {
    const params = new URLSearchParams(current);
    for (const key of WORKSPACE_KEYS) {
        const value = next?.[key];
        if (value) params.set(key, value);
        else params.delete(key);
    }
    if (params.get("tab") === "general") params.delete("tab");
    return params.toString();
}

export function buildWorkspaceHref(next: WorkspaceLocation | null, pathname = "/manager/clients", current: string | URLSearchParams = ""): string {
    const search = buildWorkspaceSearch(next, current);
    return search ? `${pathname}?${search}` : pathname;
}

/**
 * A location read back from storage (« Reprendre »), or anything else that
 * may predate a rename: canonical names, or null when it is unusable.
 */
export function normalizeStoredLocation(value: unknown): WorkspaceLocation | null {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    const str = (key: string) => (typeof raw[key] === "string" && (raw[key] as string).trim() ? (raw[key] as string).trim() : null);
    const client = str("client");
    if (!client) return null;
    const mission = str("mission");
    const tab = mission ? normalizeMissionTab(str("tab")) : null;
    return {
        client,
        mission,
        tab: tab && tab !== "general" ? tab : null,
        espace: normalizeClientView(str("espace")),
        page: str("page"),
    };
}
