"use client";

import { useState, useCallback, useRef } from "react";
import type { Meeting, Aggregates, Pagination, FilterOption } from "../_types";
import type { MeetingFiltersState } from "./useMeetingFilters";

export interface UseMeetingsReturn {
  meetings: Meeting[];
  aggregates: Aggregates | null;
  pagination: Pagination | null;
  loading: boolean;
  loadingMore: boolean;
  fetchMeetings: (page?: number, append?: boolean) => Promise<void>;
  loadMore: () => void;
  updateLocalMeeting: (id: string, patch: Partial<Meeting>) => void;
  updateLocalMeetings: (updater: (prev: Meeting[]) => Meeting[]) => void;
  listRef: React.RefObject<HTMLDivElement | null>;
}

function buildQuery(filters: MeetingFiltersState, page = 1): string {
  const p = new URLSearchParams();
  if (filters.search) p.set("search", filters.search);
  if (filters.dateRange.from) p.set("dateFrom", filters.dateRange.from);
  if (filters.dateRange.to) p.set("dateTo", filters.dateRange.to);
  filters.selectedClients.forEach((id) => p.append("clientIds[]", id));
  filters.selectedMissions.forEach((id) => p.append("missionIds[]", id));
  filters.selectedSdrs.forEach((id) => p.append("sdrIds[]", id));
  if (filters.statusFilter !== "all") p.append("status[]", filters.statusFilter);
  if (filters.confirmationFilter !== "all") p.append("confirmationStatus[]", filters.confirmationFilter);
  if (filters.noShowFilter !== "all") p.set("noShow", filters.noShowFilter);
  filters.selectedMeetingTypes.forEach((t) => p.append("meetingType[]", t));
  filters.selectedMeetingCategories.forEach((c) => p.append("meetingCategory[]", c));
  filters.selectedOutcomes.forEach((o) => {
    if (o !== "NONE") p.append("outcome[]", o);
  });
  filters.selectedChannels.forEach((ch) => p.append("channel[]", ch));
  if (filters.hasAudio !== null) p.set("hasAudio", filters.hasAudio ? "1" : "0");
  if (filters.hasFeedback !== null) p.set("hasFeedback", filters.hasFeedback ? "1" : "0");
  if (filters.sortBy && filters.sortBy !== "createdAt") p.set("sortBy", filters.sortBy);
  if (filters.sortDir && filters.sortDir !== "desc") p.set("sortDir", filters.sortDir);
  p.set("page", String(page));
  p.set("limit", "50");
  return p.toString();
}

export function useMeetings(filters: MeetingFiltersState): UseMeetingsReturn {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [aggregates, setAggregates] = useState<Aggregates | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const paginationRef = useRef(pagination);
  paginationRef.current = pagination;
  const loadingMoreRef = useRef(loadingMore);
  loadingMoreRef.current = loadingMore;

  const fetchMeetings = useCallback(
    async (page = 1, append = false) => {
      if (!append) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await fetch(`/api/manager/rdv?${buildQuery(filters, page)}`);
        const json = await res.json();
        if (json.success) {
          if (append) {
            setMeetings((prev) => [...prev, ...json.data.meetings]);
          } else {
            setMeetings(json.data.meetings);
            const clientMap = new Map<string, FilterOption>();
            const missionMap = new Map<string, FilterOption>();
            const sdrMap = new Map<string, FilterOption>();
            for (const m of json.data.meetings as Meeting[]) {
              if (m.client) {
                const existing = clientMap.get(m.client.id);
                clientMap.set(m.client.id, { id: m.client.id, name: m.client.name, count: (existing?.count ?? 0) + 1 });
              }
              const existingMission = missionMap.get(m.mission.id);
              missionMap.set(m.mission.id, { id: m.mission.id, name: m.mission.name, count: (existingMission?.count ?? 0) + 1 });
              const existingSdr = sdrMap.get(m.sdr.id);
              sdrMap.set(m.sdr.id, { id: m.sdr.id, name: m.sdr.name, count: (existingSdr?.count ?? 0) + 1 });
            }
            filters.setClientOptions(Array.from(clientMap.values()));
            filters.setMissionOptions(Array.from(missionMap.values()));
            filters.setSdrOptions(Array.from(sdrMap.values()));
          }
          setAggregates(json.data.aggregates);
          setPagination(json.data.pagination);
        }
      } catch (e) {
        console.error("Failed to fetch meetings:", e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      filters.search,
      filters.dateRange,
      filters.statusFilter,
      filters.confirmationFilter,
      filters.noShowFilter,
      filters.selectedClients,
      filters.selectedMissions,
      filters.selectedSdrs,
      filters.selectedMeetingTypes,
      filters.selectedMeetingCategories,
      filters.selectedOutcomes,
      filters.selectedChannels,
      filters.hasAudio,
      filters.hasFeedback,
      filters.sortBy,
      filters.sortDir,
    ]
  );

  const loadMore = useCallback(() => {
    const pg = paginationRef.current;
    if (loadingMoreRef.current || !pg?.hasMore) return;
    fetchMeetings(pg.page + 1, true);
  }, [fetchMeetings]);

  const updateLocalMeeting = useCallback((id: string, patch: Partial<Meeting>) => {
    setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const updateLocalMeetings = useCallback((updater: (prev: Meeting[]) => Meeting[]) => {
    setMeetings((prev) => updater(prev));
  }, []);

  return {
    meetings,
    aggregates,
    pagination,
    loading,
    loadingMore,
    fetchMeetings,
    loadMore,
    updateLocalMeeting,
    updateLocalMeetings,
    listRef,
  };
}
