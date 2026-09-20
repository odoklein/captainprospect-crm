import { Calendar } from "lucide-react";
import { EmptyState, LoadingState } from "@/components/ui";
import { MeetingCard } from "./MeetingCard";
import type { Meeting, StatusFilter } from "../_types";

interface MeetingListProps {
    meetings: Meeting[];
    isLoading: boolean;
    query: string;
    statusFilter: StatusFilter;
    onOpen: (meeting: Meeting) => void;
    onReschedule: (meeting: Meeting) => void;
    onCancel: (meeting: Meeting) => void;
    onContextMenu: (event: React.MouseEvent, meeting: Meeting) => void;
}

const EMPTY_DESCRIPTIONS: Record<StatusFilter, string> = {
    all: "Vos rendez-vous validés apparaîtront ici.",
    upcoming: "Aucun rendez-vous à venir.",
    past: "Aucun rendez-vous passé.",
    confirmed: "Aucun rendez-vous confirmé.",
    absent: "Aucun rendez-vous marqué absent.",
    cancelled: "Aucun rendez-vous annulé.",
};

export function MeetingList({ meetings, isLoading, query, statusFilter, onOpen, onReschedule, onCancel, onContextMenu }: MeetingListProps) {
    if (isLoading) {
        return <LoadingState message="Chargement des rendez-vous..." />;
    }

    if (meetings.length === 0) {
        return (
            <EmptyState
                icon={Calendar}
                title={query ? "Aucun résultat" : "Aucun rendez-vous"}
                description={query ? "Essayez une autre recherche." : EMPTY_DESCRIPTIONS[statusFilter]}
            />
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {meetings.map((meeting) => (
                <MeetingCard
                    key={meeting.id}
                    meeting={meeting}
                    onOpen={onOpen}
                    onReschedule={onReschedule}
                    onCancel={onCancel}
                    onContextMenu={onContextMenu}
                />
            ))}
        </div>
    );
}
