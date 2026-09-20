import { useEffect, useState } from "react";
import { toLocalDatetimeInput } from "../_lib/formatters";
import type { DetailDrawerTab, Meeting, MeetingResult } from "../_types";

export function useSdrDetailDrawer() {
    const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
    const [editNote, setEditNote] = useState("");
    const [editResult, setEditResult] = useState<MeetingResult>("MEETING_BOOKED");
    const [editCallbackDate, setEditCallbackDate] = useState("");
    const [editMeetingType, setEditMeetingType] = useState<"" | "VISIO" | "PHYSIQUE" | "TELEPHONIQUE">("");
    const [editMeetingCategory, setEditMeetingCategory] = useState<"" | "EXPLORATOIRE" | "BESOIN">("");
    const [editMeetingAddress, setEditMeetingAddress] = useState("");
    const [editMeetingJoinUrl, setEditMeetingJoinUrl] = useState("");
    const [editMeetingPhone, setEditMeetingPhone] = useState("");
    const [savingError, setSavingError] = useState<string | null>(null);
    const [detailDrawerTab, setDetailDrawerTab] = useState<DetailDrawerTab>("detail");

    // Sync edit state when the drawer opens on a (possibly new) meeting
    useEffect(() => {
        if (selectedMeeting) {
            setEditNote(selectedMeeting.note ?? "");
            setEditResult((selectedMeeting.result as MeetingResult) || "MEETING_BOOKED");
            setEditCallbackDate(selectedMeeting.callbackDate ? toLocalDatetimeInput(new Date(selectedMeeting.callbackDate)) : "");
            setEditMeetingType(selectedMeeting.meetingType ?? "");
            setEditMeetingCategory(selectedMeeting.meetingCategory ?? "");
            setEditMeetingAddress(selectedMeeting.meetingAddress ?? "");
            setEditMeetingJoinUrl(selectedMeeting.meetingJoinUrl ?? "");
            setEditMeetingPhone(selectedMeeting.meetingPhone ?? "");
            setSavingError(null);
            setDetailDrawerTab("detail");
        }
    }, [selectedMeeting]);

    return {
        selectedMeeting,
        setSelectedMeeting,
        editNote,
        setEditNote,
        editResult,
        setEditResult,
        editCallbackDate,
        setEditCallbackDate,
        editMeetingType,
        setEditMeetingType,
        editMeetingCategory,
        setEditMeetingCategory,
        editMeetingAddress,
        setEditMeetingAddress,
        editMeetingJoinUrl,
        setEditMeetingJoinUrl,
        editMeetingPhone,
        setEditMeetingPhone,
        savingError,
        setSavingError,
        detailDrawerTab,
        setDetailDrawerTab,
    };
}

export type SdrDetailDrawerState = ReturnType<typeof useSdrDetailDrawer>;
