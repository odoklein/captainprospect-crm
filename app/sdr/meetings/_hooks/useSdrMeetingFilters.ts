import { useMemo, useState } from "react";
import { getRdvStatus, isOpenNoShow, isPrimeEligible, isSetAsideNoShow } from "../_lib/formatters";
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
        const setAside = meetings.filter(isSetAsideNoShow).length;
        return { upcoming, past, cancelled, valid, absent, negative, setAside, all: meetings.length };
    }, [meetings]);

    const absentMeetings = useMemo(
        () =>
            meetings
                .filter(isOpenNoShow)
                .sort((a, b) => {
                    // Those the client wants called back come first, then the oldest
                    // (the one going cold) before the freshest.
                    const rank = (m: Meeting) => (m.meetingFeedback?.recontactRequested === "YES" ? 0 : m.meetingFeedback?.recontactRequested === "MAYBE" ? 1 : 2);
                    if (rank(a) !== rank(b)) return rank(a) - rank(b);
                    const da = a.callbackDate ? new Date(a.callbackDate).getTime() : 0;
                    const db = b.callbackDate ? new Date(b.callbackDate).getTime() : 0;
                    return da - db;
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
        } else if (statusFilter === "setAside") {
            statusScoped = meetings.filter(isSetAsideNoShow);
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

        // In "Tous", absences still to work float to the top: they are the only
        // rows here that need the SDR to do something.
        const openRank = (m: Meeting) => (statusFilter === "all" && isOpenNoShow(m) ? 0 : 1);
        return [...queryScoped].sort((a, b) => {
            if (openRank(a) !== openRank(b)) return openRank(a) - openRank(b);
            if (statusFilter === "absent" || statusFilter === "setAside") {
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
