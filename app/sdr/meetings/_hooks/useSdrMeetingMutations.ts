import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SDR_MEETINGS_QUERY_KEY } from "@/lib/query-keys";
import { fetchJson } from "../_lib/api";
import type { Meeting, MeetingResult } from "../_types";

interface PatchMeetingPayload {
    id: string;
    result?: MeetingResult;
    note?: string;
    callbackDate?: string | null;
    meetingType?: "VISIO" | "PHYSIQUE" | "TELEPHONIQUE" | null;
    meetingCategory?: "EXPLORATOIRE" | "BESOIN" | null;
    meetingAddress?: string | null;
    meetingJoinUrl?: string | null;
    meetingPhone?: string | null;
    cancellationReason?: string;
}

function patchMeeting({ id, ...data }: PatchMeetingPayload) {
    return fetchJson<Meeting>(`/api/actions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

function deleteMeetingRequest(id: string) {
    return fetchJson<{ deleted: true }>(`/api/actions/${id}`, { method: "DELETE" });
}

export function useSdrMeetingMutations() {
    const queryClient = useQueryClient();
    const invalidate = () => queryClient.invalidateQueries({ queryKey: SDR_MEETINGS_QUERY_KEY });

    const patchMutation = useMutation({
        mutationFn: patchMeeting,
        onSuccess: invalidate,
    });

    const cancelMutation = useMutation({
        mutationFn: (payload: { id: string; cancellationReason: string; note?: string }) =>
            patchMeeting({ id: payload.id, result: "MEETING_CANCELLED", cancellationReason: payload.cancellationReason, note: payload.note }),
        onSuccess: invalidate,
    });

    const rescheduleMutation = useMutation({
        mutationFn: (payload: { id: string; callbackDate: string; note?: string }) =>
            patchMeeting({ id: payload.id, callbackDate: payload.callbackDate, note: payload.note }),
        onSuccess: invalidate,
    });

    const deleteMutation = useMutation({
        mutationFn: deleteMeetingRequest,
        onSuccess: invalidate,
    });

    return {
        patchMeeting: patchMutation.mutateAsync,
        isSaving: patchMutation.isPending,
        cancelMeeting: cancelMutation.mutateAsync,
        isCancelling: cancelMutation.isPending,
        rescheduleMeeting: rescheduleMutation.mutateAsync,
        isRescheduling: rescheduleMutation.isPending,
        deleteMeeting: deleteMutation.mutateAsync,
        isDeleting: deleteMutation.isPending,
        invalidate,
    };
}
