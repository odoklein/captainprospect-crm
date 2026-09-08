"use client";

import { memo, useState } from "react";
import type { Meeting, Aggregates } from "../_types";
import type { MeetingFiltersState } from "../_hooks/useMeetingFilters";
import type { ViewMode, DatePreset, ConfirmationFilter } from "../_types";
import { SearchInput } from "./shared/SearchInput";
import { downloadCSV } from "../_lib/csv-export";
import { List, CalendarDays, Download, Plus, Upload, Mic, SortAsc, SortDesc, X, Clock, CheckCircle2, XCircle } from "lucide-react";
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
          height: 52,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 14,
        }}
      >
        {/* Title & SAS Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <h1 className="rdv-serif" style={{ fontSize: 18, color: "var(--ink)", margin: 0, whiteSpace: "nowrap" }}>
            SAS RDV
          </h1>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "2px 7px",
              borderRadius: 5,
              background: "rgba(79, 70, 229, 0.08)",
              color: "var(--accent)",
            }}
          >
            Validation
          </span>
        </div>

        {/* SAS Status Quick Switcher */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "var(--surface2)",
            borderRadius: 8,
            padding: 2,
            gap: 2,
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setConfirmationFilter("all")}
            style={{
              fontSize: 12,
              fontWeight: confirmationFilter === "all" ? 600 : 500,
              padding: "4px 10px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              background: confirmationFilter === "all" ? "var(--surface)" : "transparent",
              color: confirmationFilter === "all" ? "var(--ink)" : "var(--ink3)",
              boxShadow: confirmationFilter === "all" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              transition: "all 0.12s",
            }}
          >
            Tous ({aggregates?.totalCount ?? meetings.length})
          </button>

          <button
            onClick={() => setConfirmationFilter("PENDING")}
            style={{
              fontSize: 12,
              fontWeight: confirmationFilter === "PENDING" ? 700 : 500,
              padding: "4px 10px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: confirmationFilter === "PENDING" ? "var(--surface)" : "transparent",
              color: confirmationFilter === "PENDING" ? "var(--amber)" : "var(--ink3)",
              boxShadow: confirmationFilter === "PENDING" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              transition: "all 0.12s",
            }}
          >
            <Clock size={12} style={{ color: "var(--amber)" }} />
            <span>En attente</span>
            {pendingCount > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: "1px 6px",
                  borderRadius: 999,
                  background: "var(--amber)",
                  color: "#ffffff",
                }}
              >
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setConfirmationFilter("CONFIRMED")}
            style={{
              fontSize: 12,
              fontWeight: confirmationFilter === "CONFIRMED" ? 600 : 500,
              padding: "4px 10px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: confirmationFilter === "CONFIRMED" ? "var(--surface)" : "transparent",
              color: confirmationFilter === "CONFIRMED" ? "var(--green)" : "var(--ink3)",
              boxShadow: confirmationFilter === "CONFIRMED" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              transition: "all 0.12s",
            }}
          >
            <CheckCircle2 size={12} style={{ color: "var(--green)" }} />
            <span>Confirmés</span>
          </button>

          <button
            onClick={() => setConfirmationFilter("CANCELLED")}
            style={{
              fontSize: 12,
              fontWeight: confirmationFilter === "CANCELLED" ? 600 : 500,
              padding: "4px 10px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: confirmationFilter === "CANCELLED" ? "var(--surface)" : "transparent",
              color: confirmationFilter === "CANCELLED" ? "var(--red)" : "var(--ink3)",
              boxShadow: confirmationFilter === "CANCELLED" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              transition: "all 0.12s",
            }}
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
          <div style={{ display: "flex", background: "var(--surface2)", borderRadius: 8, padding: 2 }}>
            {([["list", List], ["calendar", CalendarDays]] as const).map(([v, Icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  background: view === v ? "var(--surface)" : "transparent",
                  color: view === v ? "var(--accent)" : "var(--ink3)",
                  border: "none",
                  padding: "5px 9px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  transition: "all 0.12s",
                  borderRadius: 6,
                  boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}
                title={v === "list" ? "Vue Liste" : "Vue Calendrier"}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>

          {/* Date presets */}
          <div style={{ display: "flex", background: "var(--surface2)", borderRadius: 8, padding: 2, gap: 1 }}>
            {([["today", "Auj."], ["7days", "7j"], ["30days", "30j"], ["3months", "3m"]] as [DatePreset, string][]).map(([key, label]) => (
              <button
                key={key}
                style={{
                  padding: "4px 9px",
                  fontSize: 11,
                  borderRadius: 6,
                  background: datePreset === key ? "var(--surface)" : "transparent",
                  color: datePreset === key ? "var(--accent)" : "var(--ink3)",
                  border: "none",
                  fontWeight: datePreset === key ? 600 : 400,
                  cursor: "pointer",
                  boxShadow: datePreset === key ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.12s",
                }}
                onClick={() => setDatePreset(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <button className="rdv-btn rdv-btn-ghost" onClick={() => setAddRdvOpen(true)} title="Ajouter un RDV">
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
        display: "flex", alignItems: "center", gap: 6, padding: "6px 32px 8px",
        flexWrap: "wrap", borderTop: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--ink3)", whiteSpace: "nowrap" }}>
          Filtres :
        </span>
        {hasAudio !== null && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
            background: "var(--accentLight)", color: "var(--accent)", borderRadius: 20,
            padding: "2px 8px 2px 10px", border: "1px solid var(--accent)",
          }}>
            🎙 {hasAudio ? "Avec audio" : "Sans audio"}
            <button onClick={() => setHasAudio(null)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", display: "flex", padding: 0 }}>
              <X size={11} />
            </button>
          </span>
        )}
        {hasFeedback !== null && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
            background: "var(--accentLight)", color: "var(--accent)", borderRadius: 20,
            padding: "2px 8px 2px 10px", border: "1px solid var(--accent)",
          }}>
            💬 {hasFeedback ? "Avec feedback" : "Sans feedback"}
            <button onClick={() => setHasFeedback(null)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", display: "flex", padding: 0 }}>
              <X size={11} />
            </button>
          </span>
        )}
        {search && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
            background: "var(--accentLight)", color: "var(--accent)", borderRadius: 20,
            padding: "2px 8px 2px 10px", border: "1px solid var(--accent)",
          }}>
            🔍 &ldquo;{search}&rdquo;
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

