import { useMemo, useState } from "react";
import { getRdvStatus, isOpenNoShow } from "../_lib/formatters";
import type { Meeting, StatusFilter } from "../_types";

export function useSdrMeetingFilters(meetings: Meeting[]) {
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [query, setQuery] = useState("");

    const stats = useMemo(() => {
        const upcoming = meetings.filter((m) => getRdvStatus(m) === "upcoming").length;
        const past = meetings.filter((m) => getRdvStatus(m) === "past").length;
        const cancelled = meetings.filter((m) => getRdvStatus(m) === "cancelled").length;
        const confirmed = meetings.filter((m) => m.confirmationStatus === "CONFIRMED" && m.result !== "MEETING_CANCELLED").length;
        const absent = meetings.filter(isOpenNoShow).length;
        return { upcoming, past, cancelled, confirmed, absent, all: meetings.length };
    }, [meetings]);

    const absentMeetings = useMemo(
        () =>
            meetings
                .filter(isOpenNoShow)
                .sort((a, b) => {
                    const da = a.meetingFeedback?.createdAt ? new Date(a.meetingFeedback.createdAt).getTime() : 0;
                    const db = b.meetingFeedback?.createdAt ? new Date(b.meetingFeedback.createdAt).getTime() : 0;
                    return db - da;
                }),
        [meetings],
    );

    const filteredMeetings = useMemo(() => {
        let statusScoped: Meeting[];
        if (statusFilter === "all") {
            statusScoped = meetings;
        } else if (statusFilter === "confirmed") {
            statusScoped = meetings.filter((m) => m.confirmationStatus === "CONFIRMED" && m.result !== "MEETING_CANCELLED");
        } else if (statusFilter === "absent") {
            statusScoped = meetings.filter(isOpenNoShow);
        } else {
            statusScoped = meetings.filter((m) => getRdvStatus(m) === statusFilter);
        }

        const queryScoped = query.trim()
            ? statusScoped.filter((m) => {
                const haystack = [
                    m.contact.firstName,
                    m.contact.lastName,
                    m.contact.company.name,
                    m.contact.company.industry,
                    m.mission?.name,
                    m.list?.name,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return haystack.includes(query.trim().toLowerCase());
            })
            : statusScoped;

        return [...queryScoped].sort((a, b) => {
            if (statusFilter === "absent") {
                const fa = a.meetingFeedback?.createdAt ? new Date(a.meetingFeedback.createdAt).getTime() : 0;
                const fb = b.meetingFeedback?.createdAt ? new Date(b.meetingFeedback.createdAt).getTime() : 0;
                return fb - fa;
            }
            const da = a.callbackDate ? new Date(a.callbackDate).getTime() : 0;
            const db = b.callbackDate ? new Date(b.callbackDate).getTime() : 0;
            return statusFilter === "upcoming" ? da - db : db - da;
        });
    }, [meetings, statusFilter, query]);

    return { statusFilter, setStatusFilter, query, setQuery, stats, absentMeetings, filteredMeetings };
}
