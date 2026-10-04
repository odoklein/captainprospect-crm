"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Meeting, ViewMode } from "../_types";
import { useMeetingFilters } from "../_hooks/useMeetingFilters";
import { useMeetings } from "../_hooks/useMeetings";
import { useMeetingActions } from "../_hooks/useMeetingActions";
import { useDetailPanel } from "../_hooks/useDetailPanel";
import { useFicheRdv } from "../_hooks/useFicheRdv";
import { useFeedback } from "../_hooks/useFeedback";
import { useRdvBulkActions } from "../_hooks/useRdvBulkActions";
import { useRdvEntitySync } from "../_hooks/useRdvEntitySync";
import { useRdvKeyboardNavigation } from "@/lib/rdv/hooks/useRdvKeyboardNavigation";
import { CommandBar } from "./CommandBar";
import { IntelligenceStrip } from "./IntelligenceStrip";
import { FilterSidebar } from "./FilterSidebar";
import { MeetingList } from "./MeetingList";
import { CalendarView } from "./CalendarView";
import { DetailPanel } from "./DetailPanel";
import { RdvBulkActions } from "./RdvBulkActions";
import { RdvModals, type RdvModalType } from "./RdvModals";
import { DeleteRdvConfirmDialog } from "./modals/DeleteRdvConfirmDialog";
import { OutcomeOverview } from "./OutcomeOverview";
import type { DatePreset } from "../_types";
import "./rdv-shell.css";

const PERIOD_LABELS: Record<DatePreset, string> = {
  today: "aujourd'hui",
  "7days": "ces 7 derniers jours",
  "30days": "ces 30 derniers jours",
  "3months": "ces 3 derniers mois",
  all: "depuis le début",
  custom: "sur la période choisie",
};

function toggleInSet(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function RdvShell() {
  const [view, setView] = useState<ViewMode>("list");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeModal, setActiveModal] = useState<RdvModalType>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [syncAudiosOpen, setSyncAudiosOpen] = useState(false);

  const filters = useMeetingFilters();
  const {
    meetings,
    aggregates,
    overview,
    loading,
    loadingMore,
    fetchMeetings,
    loadMore,
    updateLocalMeeting,
    updateLocalMeetings,
    listRef,
  } = useMeetings(filters);

  const { updateMeeting, bulkUpdateMeetings, deleteMeetings } = useMeetingActions(() => fetchMeetings());
  const panelState = useDetailPanel();
  const ficheState = useFicheRdv(updateMeeting);
  const feedbackState = useFeedback();
  const selectedMeeting = panelState.selectedMeeting;
  const { initFiche } = ficheState;
  const { initFeedback } = feedbackState;

  // The period filter applies to the booking date, so the Bilan says so.
  const scopeLabel = useMemo(() => {
    const parts = [`créés ${PERIOD_LABELS[filters.datePreset]}`];
    if (filters.selectedClients.size > 0) parts.push(`${filters.selectedClients.size} client${filters.selectedClients.size > 1 ? "s" : ""}`);
    if (filters.selectedMissions.size > 0) parts.push(`${filters.selectedMissions.size} mission${filters.selectedMissions.size > 1 ? "s" : ""}`);
    if (filters.selectedSdrs.size > 0) parts.push(`${filters.selectedSdrs.size} SDR`);
    if (filters.search) parts.push(`« ${filters.search} »`);
    return parts.join(" · ");
  }, [filters.datePreset, filters.selectedClients, filters.selectedMissions, filters.selectedSdrs, filters.search]);

  const selectedMeetings = useMemo(
    () => meetings.filter((meeting) => panelState.selectedIds.has(meeting.id)),
    [meetings, panelState.selectedIds],
  );

  const bulkActions = useRdvBulkActions({
    selectedIds: panelState.selectedIds,
    clearSelection: panelState.clearSelection,
    updateMeeting,
    bulkUpdateMeetings,
    deleteMeetings,
    updateLocalMeeting,
  });
  const entitySync = useRdvEntitySync({
    selectedMeeting,
    setSelectedMeeting: panelState.setSelectedMeeting,
    updateLocalMeeting,
    updateLocalMeetings,
  });

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  useRdvKeyboardNavigation({
    panelOpen: panelState.panelOpen,
    selectedMeetingId: panelState.selectedMeeting?.id ?? null,
    meetings,
    closePanel: panelState.closePanel,
    openPanel: panelState.openPanel,
  });

  const handleOpenPanel = useCallback(
    (meeting: Meeting) => {
      panelState.openPanel(meeting, meetings);
    },
    [meetings, panelState],
  );

  useEffect(() => {
    if (!selectedMeeting) return;

    initFiche(selectedMeeting);
    initFeedback(selectedMeeting);
  }, [selectedMeeting, initFiche, initFeedback]);

  return (
    <div className="rdv-page">
      <CommandBar
        view={view}
        setView={setView}
        filters={filters}
        meetings={meetings}
        aggregates={aggregates}
        onRefresh={() => fetchMeetings()}
        onOpenSyncAudios={() => setSyncAudiosOpen(true)}
      />

      <IntelligenceStrip
        aggregates={aggregates}
        loading={loading}
        statusFilter={filters.statusFilter}
        datePreset={filters.datePreset}
        confirmationFilter={filters.confirmationFilter}
        onSetStatusFilter={filters.setStatusFilter}
        onSetDatePreset={filters.setDatePreset}
        onSetConfirmationFilter={filters.setConfirmationFilter}
      />

      <OutcomeOverview
        overview={overview}
        loading={loading}
        activeBucket={filters.activeBucket}
        onDrill={filters.drillBucket}
        selectedClients={filters.selectedClients}
        selectedSdrs={filters.selectedSdrs}
        onToggleClient={(id) => filters.setSelectedClients((prev) => toggleInSet(prev, id))}
        onToggleSdr={(id) => filters.setSelectedSdrs((prev) => toggleInSet(prev, id))}
        scopeLabel={scopeLabel}
      />

      <div className={`rdv-content-layout ${panelState.panelOpen ? "panel-open" : ""}`}>
        <FilterSidebar
          filters={filters}
          sidebarOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onOpen={() => setSidebarOpen(true)}
        />

        <div className="rdv-main-column">
          {view === "list" && (
            <MeetingList
              meetings={meetings}
              loading={loading}
              loadingMore={loadingMore}
              listRef={listRef}
              selectedIds={panelState.selectedIds}
              onToggleSelect={panelState.toggleSelect}
              onToggleSelectAll={() => panelState.toggleSelectAll(meetings)}
              onOpen={handleOpenPanel}
              onLoadMore={loadMore}
              updateMeeting={updateMeeting}
              updateLocalMeeting={updateLocalMeeting}
              sortBy={filters.sortBy}
              sortDir={filters.sortDir}
              onSort={filters.toggleSort}
            />
          )}
          {view === "calendar" && (
            <CalendarView
              meetings={meetings}
              openPanel={handleOpenPanel}
              updateMeeting={updateMeeting}
              updateLocalMeeting={updateLocalMeeting}
            />
          )}
        </div>

        <DetailPanel
          panelState={panelState}
          ficheState={ficheState}
          feedbackState={feedbackState}
          updateMeeting={updateMeeting}
          onOpenEditContact={() => setActiveModal("editContact")}
          onOpenEditCompany={() => setActiveModal("editCompany")}
          onOpenLinkContact={() => setActiveModal("linkContact")}
          updateLocalMeeting={updateLocalMeeting}
          meetings={meetings}
        />
      </div>

      <RdvBulkActions
        selectedMeetings={selectedMeetings}
        confirming={bulkActions.confirming}
        cancelling={bulkActions.cancelling}
        onConfirm={bulkActions.confirmSelected}
        onCancelMeetings={bulkActions.cancelSelected}
        onDeleteRequest={() => setDeleteDialogOpen(true)}
        onClearSelection={panelState.clearSelection}
      />

      <DeleteRdvConfirmDialog
        isOpen={deleteDialogOpen}
        selectedMeetings={selectedMeetings}
        deleting={bulkActions.deleting}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={async () => {
          await bulkActions.deleteSelected();
          setDeleteDialogOpen(false);
        }}
      />

      <RdvModals
        activeModal={activeModal}
        selectedMeeting={selectedMeeting}
        meetings={meetings}
        selectedIds={panelState.selectedIds}
        syncAudiosOpen={syncAudiosOpen}
        onCloseActiveModal={() => setActiveModal(null)}
        onCloseSyncAudios={() => setSyncAudiosOpen(false)}
        onContactSaved={entitySync.handleContactSaved}
        onCompanySaved={entitySync.handleCompanySaved}
        onContactLinked={entitySync.handleContactLinked}
        onAudiosSynced={async () => {
          await fetchMeetings();
        }}
      />
    </div>
  );
}
