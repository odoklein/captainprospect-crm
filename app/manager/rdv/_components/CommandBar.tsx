"use client";

import { memo, useState } from "react";
import type { Meeting, Aggregates } from "../_types";
import type { MeetingFiltersState } from "../_hooks/useMeetingFilters";
import type { ViewMode, DatePreset, ConfirmationFilter } from "../_types";
import { SearchInput } from "./shared/SearchInput";
import { downloadCSV } from "../_lib/csv-export";
import { List, CalendarDays, Download, Plus, Upload, Mic, SortAsc, SortDesc, X, Clock, CheckCircle2, XCircle, MessageSquare, Search } from "lucide-react";
import { AddRdvModal } from "./modals/AddRdvModal";
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
  meetings: Meeting[];
  aggregates?: Aggregates | null;
  onRefresh?: () => void;
  onOpenSyncAudios?: () => void;
}

export const CommandBar = memo(function CommandBar({ view, setView, filters, meetings, aggregates, onRefresh, onOpenSyncAudios }: CommandBarProps) {
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
      <div
        style={{
          height: 60,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 14,
        }}
      >
        {/* Title & SAS Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <h1 className="rdv-serif" style={{ fontSize: 20, color: "var(--ink)", margin: 0, whiteSpace: "nowrap" }}>
            SAS RDV
          </h1>
          <span className="rdv-tag">Validation</span>
        </div>

        {/* SAS Status Quick Switcher */}
        <div className="rdv-seg" role="group" aria-label="Statut SAS">
          <button
            type="button"
            className={`rdv-seg-btn ${confirmationFilter === "all" ? "active" : ""}`}
            onClick={() => setConfirmationFilter("all")}
          >
            Tous <span className="rdv-count">{aggregates?.totalCount ?? meetings.length}</span>
          </button>
          <button
            type="button"
            data-tone="pending"
            className={`rdv-seg-btn ${confirmationFilter === "PENDING" ? "active" : ""}`}
            onClick={() => setConfirmationFilter("PENDING")}
          >
            <Clock size={12} style={{ color: "var(--amber)" }} />
            <span>En attente</span>
            {pendingCount > 0 && <span className="rdv-count" data-tone="pending">{pendingCount}</span>}
          </button>
          <button
            type="button"
            data-tone="confirmed"
            className={`rdv-seg-btn ${confirmationFilter === "CONFIRMED" ? "active" : ""}`}
            onClick={() => setConfirmationFilter("CONFIRMED")}
          >
            <CheckCircle2 size={12} style={{ color: "var(--green)" }} />
            <span>Confirmés</span>
          </button>
          <button
            type="button"
            data-tone="cancelled"
            className={`rdv-seg-btn ${confirmationFilter === "CANCELLED" ? "active" : ""}`}
            onClick={() => setConfirmationFilter("CANCELLED")}
          >
            <XCircle size={12} style={{ color: "var(--red)" }} />
            <span>Annulés</span>
          </button>
        </div>

        {/* Search */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <SearchInput initialSearch={search} onDebouncedSearch={setSearch} />
        </div>

        {/* Right Action Tools */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* View toggle */}
          <div className="rdv-seg" role="group" aria-label="Vue">
            {([["list", List], ["calendar", CalendarDays]] as const).map(([v, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rdv-seg-btn icon-only ${view === v ? "active" : ""}`}
                title={v === "list" ? "Vue Liste" : "Vue Calendrier"}
                aria-pressed={view === v}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>

          {/* Date presets */}
          <div className="rdv-seg" role="group" aria-label="Période">
            {([["today", "Auj."], ["7days", "7j"], ["30days", "30j"], ["3months", "3m"]] as [DatePreset, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`rdv-seg-btn ${datePreset === key ? "active" : ""}`}
                style={{ fontSize: 11.5, padding: "4px 9px" }}
                onClick={() => setDatePreset(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <button className="rdv-btn rdv-btn-primary" onClick={() => setAddRdvOpen(true)} title="Ajouter un RDV">
            <Plus size={13} /> <span className="hidden sm:inline">Ajouter</span>
          </button>
          <button className="rdv-btn rdv-btn-ghost" onClick={() => setImportRdvOpen(true)} title="Importer des RDV">
            <Upload size={13} /> <span className="hidden sm:inline">Importer</span>
          </button>
          <button className="rdv-btn rdv-btn-ghost" onClick={() => onOpenSyncAudios?.()} title="Synchroniser audios">
            <Mic size={13} /> <span className="hidden sm:inline">Sync audios</span>
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

          <button className="rdv-btn rdv-btn-ghost" onClick={() => downloadCSV(meetings, filterSummary)} title="Exporter CSV">
            <Download size={13} />
          </button>
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

