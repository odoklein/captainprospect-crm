"use client";

import { AlertTriangle, CheckCircle2, ChevronRight, CircleAlert, Clock } from "lucide-react";
import type { AttentionEntry, AttentionTone } from "@/lib/manager/attention";
import type { MissionReadiness } from "@/lib/missions/readiness";

export interface WorkspaceMission {
    id: string;
    name: string;
    startDate?: string | null;
    endDate: string | null;
    isActive: boolean;
    status: string;
    sdrCount?: number;
    readiness?: MissionReadiness;
    openPoints?: number;
}

export type WorkspaceClientStatus = "ACTIVE" | "PAUSED" | "STOPPED";

export interface WorkspaceClient {
    id: string;
    name: string;
    industry?: string;
    email?: string;
    phone?: string;
    status: WorkspaceClientStatus;
    createdAt: string;
    missions: WorkspaceMission[];
    _count: { missions: number; users: number };
}

export type WorkspaceLocation = { client: string; mission?: string | null; tab?: string | null; espace?: string | null; page?: string | null };

const TONE_ICON: Record<AttentionTone, typeof CircleAlert> = {
    danger: AlertTriangle,
    warning: CircleAlert,
    success: CheckCircle2,
    neutral: Clock,
};
const TONE_ROW: Record<AttentionTone, string> = { danger: "danger", warning: "todo", success: "done", neutral: "wait" };

/** One « À traiter » line: what is wrong, where, and the button that opens the fix. */
export function InboxItem({ item, onOpen, hideClient }: {
    item: AttentionEntry<WorkspaceMission>;
    onOpen: (location: WorkspaceLocation) => void;
    hideClient?: boolean;
}) {
    const Icon = TONE_ICON[item.tone];
    const open = (tab: string) => onOpen({ client: item.clientId, mission: item.mission.id, tab: tab === "general" ? null : tab });
    return (
        <div className="cw-inbox-item">
            <span className="cw-row-icon" data-tone={TONE_ROW[item.tone]}><Icon aria-hidden /></span>
            <div className="cw-row-main">
                <button className="cw-row-title" title={item.mission.name} onClick={() => open("general")}>{item.mission.name}</button>
                <small title={`${item.label} — ${item.detail}`}>
                    {!hideClient && <>{item.clientName} · </>}<span className="font-semibold text-ink-2">{item.label}</span> — {item.detail}
                </small>
            </div>
            <div className="cw-row-side">
                <button className={item.tone === "success" ? "cw-button cw-primary" : "cw-button"} data-size="sm" onClick={() => open(item.tab)} aria-label={`${item.action} : ${item.mission.name}`}>
                    {item.action}<ChevronRight aria-hidden />
                </button>
            </div>
        </div>
    );
}
