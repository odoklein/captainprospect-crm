"use client";

import { memo, useState } from "react";
import type { Meeting, Aggregates } from "../_types";
import type { MeetingFiltersState } from "../_hooks/useMeetingFilters";
import type { ViewMode, ConfirmationFilter } from "../_types";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/shadcn/dropdown-menu";
import { SearchInput } from "./shared/SearchInput";
import { downloadCSV } from "../_lib/csv-export";
import { List, CalendarDays, Download, Plus, Upload, Mic, SortAsc, SortDesc, X, Clock, CheckCircle2, XCircle, MessageSquare, Search, Ellipsis, Filter } from "lucide-react";
import { AddRdvModal } from "./modals/AddRdvModal";
import { PeriodPicker } from "./PeriodPicker";
import { ImportRdvModal } from "./modals/ImportRdvModal";

const SORT_LABELS: Record<string, string> = {
  createdAt: "Créé le",
  callbackDate: "Date RDV",
  duration: "Durée",
  contactName: "Contact",
  companyName: "Entreprise",
  sdrName: "SDR",
};

interface CommandBarProps {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  filters: MeetingFiltersState;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  meetings: Meeting[];
  aggregates?: Aggregates | null;
  onRefresh?: () => void;
  onOpenSyncAudios?: () => void;
}

export const CommandBar = memo(function CommandBar({ view, setView, filters, filtersOpen, onToggleFilters, meetings, aggregates, onRefresh, onOpenSyncAudios }: CommandBarProps) {
  const {
    search,
    setSearch,
    datePreset,
    setDatePreset,
    confirmationFilter,
    setConfirmationFilter,
    filterSummary,
    sortBy,
    sortDir,
    toggleSort,
    activeFilterCount,
    hasAudio,
    setHasAudio,
    hasFeedback,
    setHasFeedback,
  } = filters;
  const [addRdvOpen, setAddRdvOpen] = useState(false);
  const [importRdvOpen, setImportRdvOpen] = useState(false);

  const pendingCount = aggregates?.pendingCount ?? 0;

  return (
    <div style={{ flexShrink: 0, zIndex: 20, background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
      <div className="rdv-workspace-toolbar">
        <h1 className="rdv-serif rdv-workspace-title">SAS RDV</h1>

        <SegmentedControl<ConfirmationFilter>
          value={confirmationFilter}
          onChange={setConfirmationFilter}
          ariaLabel="Statut du rendez-vous"
          className="rdv-workspace-status"
          options={[
            { value: "all", label: "Tous", count: aggregates?.totalCount ?? meetings.length },
            { value: "PENDING", label: "En attente", icon: Clock, count: pendingCount || undefined },
            { value: "CONFIRMED", label: "Confirmés", icon: CheckCircle2 },
            { value: "CANCELLED", label: "Annulés", icon: XCircle },
          ]}
          sliding
        />

        {/* Search */}
        <div className="rdv-workspace-search">
          <SearchInput initialSearch={search} onDebouncedSearch={setSearch} />
        </div>

        {/* Right Action Tools */}
        <div className="rdv-workspace-tools">
          {/* View toggle */}
          <SegmentedControl<ViewMode>
            value={view}
            onChange={setView}
            ariaLabel="Affichage des rendez-vous"
            options={[
              { value: "list", label: null, icon: List, ariaLabel: "Vue liste" },
              { value: "calendar", label: null, icon: CalendarDays, ariaLabel: "Vue calendrier" },
            ]}
            sliding
          />

          {/* Period: presets up to the whole history, exact dates, booking vs RDV date */}
          <PeriodPicker
            datePreset={datePreset}
            dateField={filters.dateField}
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            setDatePreset={setDatePreset}
            setDateField={filters.setDateField}
            setCustomRange={filters.setCustomRange}
          />

          <button type="button" className="rdv-btn rdv-btn-primary" onClick={() => setAddRdvOpen(true)} aria-label="Ajouter un RDV">
            <Plus size={13} aria-hidden /> Ajouter
          </button>
          <button type="button" className="rdv-btn rdv-btn-ghost" onClick={onToggleFilters} aria-expanded={filtersOpen}>
            <Filter size={13} aria-hidden /> Filtres
            {activeFilterCount > 0 && <span className="rdv-count">{activeFilterCount}</span>}
          </button>

          {/* Sort indicator pill */}
          <button
            onClick={() => toggleSort(sortBy)}
            className="rdv-btn rdv-btn-ghost"
            title="Changer le tri"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              fontWeight: 500,
              color: sortBy !== "createdAt" ? "var(--accent)" : "var(--ink3)",
              background: sortBy !== "createdAt" ? "var(--accentLight)" : "transparent",
            }}
          >
            {sortDir === "asc" ? <SortAsc size={12} /> : <SortDesc size={12} />}
            <span>{SORT_LABELS[sortBy] ?? sortBy}</span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="rdv-icon-btn" aria-label="Plus d’actions sur les rendez-vous">
                <Ellipsis size={16} aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setImportRdvOpen(true)}><Upload aria-hidden /> Importer des RDV</DropdownMenuItem>
              {onOpenSyncAudios && <DropdownMenuItem onSelect={onOpenSyncAudios}><Mic aria-hidden /> Synchroniser les audios</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => downloadCSV(meetings, filterSummary)}><Download aria-hidden /> Exporter CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

    {/* ─── Active filter chips bar ─── */}
    {activeFilterCount > 0 && (
      <div style={{
        display: "flex", alignItems: "center", gap: 6, padding: "7px 20px 9px",
        flexWrap: "wrap", borderTop: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--ink3)", whiteSpace: "nowrap" }}>
          Filtres :
        </span>
        {hasAudio !== null && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
            background: "var(--accentLight)", color: "var(--accentInk)", borderRadius: 20,
            padding: "3px 8px 3px 10px", border: "1px solid color-mix(in oklab, var(--accent) 22%, transparent)",
          }}>
            <Mic size={11} />
            {hasAudio ? "Avec audio" : "Sans audio"}
            <button onClick={() => setHasAudio(null)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", display: "flex", padding: 0 }}>
              <X size={11} />
            </button>
          </span>
        )}
        {hasFeedback !== null && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
            background: "var(--accentLight)", color: "var(--accentInk)", borderRadius: 20,
            padding: "3px 8px 3px 10px", border: "1px solid color-mix(in oklab, var(--accent) 22%, transparent)",
          }}>
            <MessageSquare size={11} />
            {hasFeedback ? "Avec feedback" : "Sans feedback"}
            <button onClick={() => setHasFeedback(null)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", display: "flex", padding: 0 }}>
              <X size={11} />
            </button>
          </span>
        )}
        {search && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
            background: "var(--accentLight)", color: "var(--accentInk)", borderRadius: 20,
            padding: "3px 8px 3px 10px", border: "1px solid color-mix(in oklab, var(--accent) 22%, transparent)",
          }}>
            <Search size={11} />
            &ldquo;{search}&rdquo;
            <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", display: "flex", padding: 0 }}>
              <X size={11} />
            </button>
          </span>
        )}
        <span style={{ fontSize: 10, color: "var(--ink3)", marginLeft: "auto" }}>
          {activeFilterCount} filtre{activeFilterCount > 1 ? "s" : ""} actif{activeFilterCount > 1 ? "s" : ""} · ouvrez le panneau pour gérer
        </span>
      </div>
    )}

      <AddRdvModal
        isOpen={addRdvOpen}
        onClose={() => setAddRdvOpen(false)}
        onSuccess={() => onRefresh?.()}
      />
      <ImportRdvModal
        isOpen={importRdvOpen}
        onClose={() => setImportRdvOpen(false)}
        onSuccess={() => onRefresh?.()}
      />
    </div>
  );
});

