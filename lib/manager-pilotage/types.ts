// Wire shape of GET /api/manager/pilotage, read by app/manager/pilotage.

import type { Forecast } from "./forecast";
import type { Closers, Heatmap } from "./patterns";
import type { Signal, UntargetedMission } from "./signals";
import type { TeamMember } from "./team";

export interface ForecastMission {
    id: string;
    name: string;
    client: string | null;
    /** This month's share of targetMeetings. */
    target: number;
    meetings: number;
}

export interface PilotagePayload {
    generatedAt: string;
    today: { key: string; minute: number; month: string; monthLabel: string };
    config: { quota: number; targetHours: number };
    /** The 20 working days behind the patterns, reach and rate. */
    window: { from: string; to: string; days: number };
    forecast: Forecast & { missions: ForecastMission[] };
    untargeted: UntargetedMission[];
    signals: Signal[];
    team: TeamMember[];
    heatmap: { sdr: Heatmap; mission: Heatmap };
    closers: Closers;
}
