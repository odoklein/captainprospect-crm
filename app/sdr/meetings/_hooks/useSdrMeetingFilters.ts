import { useMemo, useState } from "react";
import { getRdvStatus, isOpenNoShow, isPrimeEligible } from "../_lib/formatters";
import type { Meeting, StatusFilter } from "../_types";

export function useSdrMeetingFilters(meetings: Meeting[]) {
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [query, setQuery] = useState("");

    const stats = useMemo(() => {
        const upcoming = meetings.filter((m) => getRdvStatus(m) === "upcoming").length;
        const past = meetings.filter((m) => getRdvStatus(m) === "past").length;
        const cancelled = meetings.filter((m) => getRdvStatus(m) === "cancelled").length;
        // "Passés" is date-only; "Valides" is the prime-eligible subset of it.
        // Kept apart on purpose so an SDR can see both what happened and what pays.
        const valid = meetings.filter(isPrimeEligible).length;
        const absent = meetings.filter(isOpenNoShow).length;
        // Negative verdicts are what the teams have to learn from, so they get
        // their own count instead of being lost in "Passés".
        const negative = meetings.filter((m) => m.meetingFeedback?.outcome === "NEGATIVE").length;
        return { upcoming, past, cancelled, valid, absent, negative, all: meetings.length };
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
        } else if (statusFilter === "valid") {
            statusScoped = meetings.filter(isPrimeEligible);
        } else if (statusFilter === "absent") {
            statusScoped = meetings.filter(isOpenNoShow);
        } else if (statusFilter === "negative") {
            statusScoped = meetings.filter((m) => m.meetingFeedback?.outcome === "NEGATIVE");
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
