export const WORKSPACE_VIEWS = ["captain", "pilotage", "client", "operations"] as const;
export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number];

/** Existing conversation URLs still open their thread; old folder URLs open their overview. */
export function resolveWorkspaceView(view: WorkspaceView | null, conversation: string | null, folder: string | null): WorkspaceView {
    if (view) return view === "client" && !folder ? "pilotage" : view;
    return conversation ? "captain" : folder ? "client" : "pilotage";
}

/** A contextual discussion can never silently target a different client's folder. */
export function canKeepContextualThread(threadFolder: string | null, targetFolder: string | null): boolean {
    return threadFolder === targetFolder;
}
