import type { SnapshotMission } from '../PlanningMonthContext';

export interface CalBlock {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    suggestionStatus: string | null;
    notes: string | null;
    sdrId: string;
    missionId: string;
    allocationId: string | null;
    sdr: { id: string; name: string; email: string; role: string };
    mission: { id: string; name: string; channel: string; client: { id: string; name: string } };
    createdBy: { id: string; name: string };
}

export interface CalTeamMember {
    id: string;
    name: string;
    email: string;
    role: string;
}

export interface MonthlyData {
    month: string;
    daysInMonth: number;
    blocks: CalBlock[];
    blocksByDate: Record<string, CalBlock[]>;
    team: CalTeamMember[];
    missions: SnapshotMission[];
    sdrs: import('../PlanningMonthContext').SnapshotSdr[];
}

export interface QuickAddCell {
    sdrId: string;
    date: string;
}

export interface DragState {
    blockId: string;
    sourceSdrId: string;
    sourceDate: string;
    block: CalBlock;
}

export interface CellPosition {
    top: number;
    left: number;
}

export interface DeleteConfirmPopoverState {
    blockId: string;
    missionName: string;
    sdrName: string;
    top: number;
    left: number;
}

export interface WeekDay {
    date: Date;
    dateStr: string;
    isToday: boolean;
    isCurrentMonth: boolean;
}

export interface MissionOption {
    mission: SnapshotMission;
    allocationId: string | null;
}

/** Per-mission target/progress row shown in the left mission panel. */
export interface MissionTarget {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    totalContractDays: number | null;
    totalPlannedDays: number;
    contractDeltaDays: number | null;
    monthTargetDays: number;
    monthAllocatedDays: number;
    monthScheduledDays: number;
    monthRemainingDays: number;
    suggestedMonthTargetDays: number;
    weekPlacedDays: number;
    weekRecommendedAddDays: number;
    shouldAddThisWeek: boolean;
}

export interface ClientTargets {
    clientName: string;
    missions: MissionTarget[];
}
