"use client";

import { useState, useMemo, useCallback } from "react";
import type {
  StatusFilter,
  ConfirmationFilter,
  NoShowFilter,
  DatePreset,
  MeetingTypeFilter,
  MeetingCategoryFilter,
  OutcomeFilter,
  ChannelFilter,
  FilterOption,
  MeetingFilters,
  SortField,
  SortDir,
  RdvBucket,
} from "../_types";
import { buildDateRange } from "../_lib/formatters";

export interface MeetingFiltersState extends MeetingFilters {
  setSearch: (v: string) => void;
  setStatusFilter: (v: StatusFilter) => void;
  setConfirmationFilter: (v: ConfirmationFilter) => void;
  setNoShowFilter: (v: NoShowFilter) => void;
  setDatePreset: (v: DatePreset) => void;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  setSelectedClients: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedMissions: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedSdrs: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedMeetingTypes: React.Dispatch<React.SetStateAction<Set<MeetingTypeFilter>>>;
  setSelectedMeetingCategories: React.Dispatch<React.SetStateAction<Set<MeetingCategoryFilter>>>;
  setSelectedOutcomes: React.Dispatch<React.SetStateAction<Set<OutcomeFilter>>>;
  setSelectedChannels: React.Dispatch<React.SetStateAction<Set<ChannelFilter>>>;
  setHasAudio: (v: boolean | null) => void;
  setHasFeedback: (v: boolean | null) => void;
  setSortBy: (v: SortField) => void;
  setSortDir: (v: SortDir) => void;
  toggleSort: (field: SortField) => void;
  applyQuickPreset: (id: string) => void;
  /** Bilan drill-down: show one bucket's RDVs (click again to clear). Keeps the scope filters. */
  drillBucket: (bucket: RdvBucket) => void;
  /** The bucket the current drill-down filters correspond to, if any. */
  activeBucket: RdvBucket | null;
  clearAllFilters: () => void;
  activeFilterCount: number;
  dateRange: { from: string; to: string };
  filterSummary: string;
  clientOptions: FilterOption[];
  missionOptions: FilterOption[];
  sdrOptions: FilterOption[];
  setClientOptions: (v: FilterOption[]) => void;
  setMissionOptions: (v: FilterOption[]) => void;
  setSdrOptions: (v: FilterOption[]) => void;
}

export function useMeetingFilters(): MeetingFiltersState {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [confirmationFilter, setConfirmationFilter] = useState<ConfirmationFilter>("all");
  const [noShowFilter, setNoShowFilter] = useState<NoShowFilter>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("3months");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [selectedMissions, setSelectedMissions] = useState<Set<string>>(new Set());
  const [selectedSdrs, setSelectedSdrs] = useState<Set<string>>(new Set());
  const [selectedMeetingTypes, setSelectedMeetingTypes] = useState<Set<MeetingTypeFilter>>(new Set());
  const [selectedMeetingCategories, setSelectedMeetingCategories] = useState<Set<MeetingCategoryFilter>>(new Set());
  const [selectedOutcomes, setSelectedOutcomes] = useState<Set<OutcomeFilter>>(new Set());
  const [selectedChannels, setSelectedChannels] = useState<Set<ChannelFilter>>(new Set());
  const [hasAudio, setHasAudio] = useState<boolean | null>(null);
  const [hasFeedback, setHasFeedback] = useState<boolean | null>(null);
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [clientOptions, setClientOptions] = useState<FilterOption[]>([]);
  const [missionOptions, setMissionOptions] = useState<FilterOption[]>([]);
  const [sdrOptions, setSdrOptions] = useState<FilterOption[]>([]);

  const dateRange = useMemo(
    () => buildDateRange(datePreset, dateFrom, dateTo),
    [datePreset, dateFrom, dateTo],
  );

  // Toggle sort: click same field → flip dir; click new field → set desc
  const toggleSort = useCallback((field: SortField) => {
    setSortBy((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        return field;
      }
      setSortDir("desc");
      return field;
    });
  }, []);

  // Apply a quick preset (resets to a clean state first)
  const applyQuickPreset = useCallback((id: string) => {
    // Reset everything first
    setSearch("");
    setStatusFilter("all");
    setConfirmationFilter("all");
    setNoShowFilter("all");
    setDatePreset("3months");
    setDateFrom("");
    setDateTo("");
    setSelectedClients(new Set());
    setSelectedMissions(new Set());
    setSelectedSdrs(new Set());
    setSelectedMeetingTypes(new Set());
    setSelectedMeetingCategories(new Set());
    setSelectedOutcomes(new Set());
    setSelectedChannels(new Set());
    setHasAudio(null);
    setHasFeedback(null);
    setSortBy("createdAt");
    setSortDir("desc");

    // Then apply preset-specific overrides
    switch (id) {
      case "absent_open":
        // The one-click "absent" view: flagged absent, still to deal with,
        // oldest first because that is the one going cold.
        setNoShowFilter("open");
        setDatePreset("all");
        setSortBy("callbackDate");
        setSortDir("asc");
        break;
      case "to_confirm":
        setStatusFilter("upcoming");
        setConfirmationFilter("PENDING");
        setSortBy("callbackDate");
        setSortDir("asc");
        break;
      case "past_no_feedback":
        setStatusFilter("past");
        setHasFeedback(false);
        setSortBy("callbackDate");
        setSortDir("desc");
        break;
      case "no_audio":
        setHasAudio(false);
        setSortBy("callbackDate");
        setSortDir("desc");
        break;
      case "this_week":
        setDatePreset("7days");
        setSortBy("createdAt");
        setSortDir("desc");
        break;
      case "positive":
        setSelectedOutcomes(new Set(["POSITIVE"]));
        setSortBy("callbackDate");
        setSortDir("desc");
        break;
    }
  }, []);

  // Bilan buckets → the drill-down filters that list them. Scope filters
  // (client, mission, SDR, period, search, type…) are left untouched.
  const activeBucket = useMemo<RdvBucket | null>(() => {
    if (noShowFilter !== "all" || hasFeedback !== null) return null;
    const outcome = selectedOutcomes.size === 1 ? Array.from(selectedOutcomes)[0] : null;
    if (selectedOutcomes.size > 1) return null;
    if (statusFilter === "upcoming" && !outcome) {
      if (confirmationFilter === "CONFIRMED") return "upcoming_confirmed";
      if (confirmationFilter === "PENDING") return "upcoming_pending";
    }
    if (statusFilter === "past" && confirmationFilter === "all") {
      if (outcome === "POSITIVE") return "positive";
      if (outcome === "NEUTRAL") return "neutral";
      if (outcome === "NEGATIVE") return "negative";
      if (outcome === "NO_SHOW") return "no_show";
      if (outcome === "NONE") return "no_feedback";
    }
    if (statusFilter === "all" && confirmationFilter === "CANCELLED" && !outcome) return "rejected";
    if (statusFilter === "cancelled" && confirmationFilter === "all" && !outcome) return "cancelled";
    return null;
  }, [statusFilter, confirmationFilter, noShowFilter, selectedOutcomes, hasFeedback]);

  const drillBucket = useCallback((bucket: RdvBucket) => {
    const target = bucket === "replaced" ? "cancelled" : bucket;
    const clear = activeBucket === target;
    setNoShowFilter("all");
    setHasFeedback(null);
    setStatusFilter("all");
    setConfirmationFilter("all");
    setSelectedOutcomes(new Set());
    if (clear) return;
    switch (target) {
      case "upcoming_confirmed":
        setStatusFilter("upcoming");
        setConfirmationFilter("CONFIRMED");
        break;
      case "upcoming_pending":
        setStatusFilter("upcoming");
        setConfirmationFilter("PENDING");
        break;
      case "positive":
      case "neutral":
      case "negative":
      case "no_show":
      case "no_feedback": {
        const outcome: OutcomeFilter =
          target === "positive" ? "POSITIVE"
          : target === "neutral" ? "NEUTRAL"
          : target === "negative" ? "NEGATIVE"
          : target === "no_show" ? "NO_SHOW"
          : "NONE";
        setStatusFilter("past");
        setSelectedOutcomes(new Set([outcome]));
        break;
      }
      case "rejected":
        setConfirmationFilter("CANCELLED");
        break;
      case "cancelled":
        setStatusFilter("cancelled");
        break;
    }
  }, [activeBucket]);

  const clearAllFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
    setConfirmationFilter("all");
    setNoShowFilter("all");
    setDatePreset("3months");
    setDateFrom("");
    setDateTo("");
    setSelectedClients(new Set());
    setSelectedMissions(new Set());
    setSelectedSdrs(new Set());
    setSelectedMeetingTypes(new Set());
    setSelectedMeetingCategories(new Set());
    setSelectedOutcomes(new Set());
    setSelectedChannels(new Set());
    setHasAudio(null);
    setHasFeedback(null);
    setSortBy("createdAt");
    setSortDir("desc");
  }, []);

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (search) c++;
    if (statusFilter !== "all") c++;
    if (confirmationFilter !== "all") c++;
    if (noShowFilter !== "all") c++;
    if (selectedClients.size > 0) c++;
    if (selectedMissions.size > 0) c++;
    if (selectedSdrs.size > 0) c++;
    if (selectedMeetingTypes.size > 0) c++;
    if (selectedMeetingCategories.size > 0) c++;
    if (selectedOutcomes.size > 0) c++;
    if (selectedChannels.size > 0) c++;
    if (hasAudio !== null) c++;
    if (hasFeedback !== null) c++;
    return c;
  }, [
    search, statusFilter, confirmationFilter, noShowFilter,
    selectedClients, selectedMissions, selectedSdrs,
    selectedMeetingTypes, selectedMeetingCategories, selectedOutcomes,
    selectedChannels, hasAudio, hasFeedback,
  ]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (statusFilter !== "all") parts.push(statusFilter);
    if (selectedClients.size > 0) parts.push(`${selectedClients.size}clients`);
    if (sortBy !== "createdAt") parts.push(sortBy);
    return parts.join("_");
  }, [statusFilter, selectedClients, sortBy]);

  return {
    search, setSearch,
    statusFilter, setStatusFilter,
    confirmationFilter, setConfirmationFilter,
    noShowFilter, setNoShowFilter,
    datePreset, setDatePreset,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    selectedClients, setSelectedClients,
    selectedMissions, setSelectedMissions,
    selectedSdrs, setSelectedSdrs,
    selectedMeetingTypes, setSelectedMeetingTypes,
    selectedMeetingCategories, setSelectedMeetingCategories,
    selectedOutcomes, setSelectedOutcomes,
    selectedChannels, setSelectedChannels,
    hasAudio, setHasAudio,
    hasFeedback, setHasFeedback,
    sortBy, setSortBy,
    sortDir, setSortDir,
    toggleSort,
    applyQuickPreset,
    drillBucket,
    activeBucket,
    clearAllFilters,
    activeFilterCount,
    dateRange,
    filterSummary,
    clientOptions, setClientOptions,
    missionOptions, setMissionOptions,
    sdrOptions, setSdrOptions,
  };
}
