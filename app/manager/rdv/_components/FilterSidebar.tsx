"use client";

import { memo, useState, type Dispatch, type SetStateAction } from "react";
import type { MeetingFiltersState } from "../_hooks/useMeetingFilters";
import type {
  MeetingTypeFilter,
  MeetingCategoryFilter,
  OutcomeFilter,
  ConfirmationFilter,
  DatePreset,
  ChannelFilter,
  SortField,
} from "../_types";
import { QUICK_PRESETS } from "../_types";
import { Filter, ChevronLeft, ChevronDown, ChevronUp, SortAsc, SortDesc, Zap } from "lucide-react";
import { FilterSection } from "./shared/FilterSection";
import { FilterChip } from "./shared/FilterChip";
import { hashColor } from "../_lib/formatters";
import {
  statusLabel,
  confirmationLabel,
  confirmationBg,
  confirmationColor,
  categoryLabel,
  categoryBg,
  categoryColor,
  meetingTypeLabel,
} from "../_lib/formatters";

interface FilterSidebarProps {
  filters: MeetingFiltersState;
  sidebarOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "createdAt", label: "Date de création" },
  { value: "callbackDate", label: "Date du RDV" },
  { value: "duration", label: "Durée d'appel" },
  { value: "contactName", label: "Contact (A→Z)" },
  { value: "companyName", label: "Entreprise (A→Z)" },
  { value: "sdrName", label: "SDR (A→Z)" },
];

function toggleSetValue<T>(setter: Dispatch<SetStateAction<Set<T>>>, value: T) {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });
}

function ToggleFilter({ label, value, onChange }: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span style={{ fontSize: 13, color: "var(--ink2)" }}>{label}</span>
      <div style={{ display: "flex", gap: 4 }}>
        {([null, true, false] as const).map((v) => (
          <button
            key={String(v)}
            onClick={() => onChange(v)}
            style={{
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 6,
              border: "1px solid",
              cursor: "pointer",
              fontWeight: value === v ? 700 : 400,
              background: value === v ? "var(--accent)" : "var(--surface2)",
              color: value === v ? "#fff" : "var(--ink3)",
              borderColor: value === v ? "var(--accent)" : "transparent",
              transition: "all 0.12s",
            }}
          >
            {v === null ? "Tous" : v ? "Oui" : "Non"}
          </button>
        ))}
      </div>
    </div>
  );
}

export const FilterSidebar = memo(function FilterSidebar({ filters, sidebarOpen, onClose, onOpen }: FilterSidebarProps) {
  const {
    datePreset, setDatePreset, dateFrom, setDateFrom, dateTo, setDateTo,
    clientOptions, selectedClients, setSelectedClients,
    missionOptions, selectedMissions, setSelectedMissions,
    sdrOptions, selectedSdrs, setSelectedSdrs,
    confirmationFilter, setConfirmationFilter,
    statusFilter, setStatusFilter,
    selectedMeetingTypes, setSelectedMeetingTypes,
    selectedMeetingCategories, setSelectedMeetingCategories,
    selectedOutcomes, setSelectedOutcomes,
    selectedChannels, setSelectedChannels,
    hasAudio, setHasAudio,
    hasFeedback, setHasFeedback,
    sortBy, sortDir, toggleSort,
    applyQuickPreset,
    activeFilterCount, clearAllFilters,
    search, setSearch,
  } = filters;

  const [sortOpen, setSortOpen] = useState(false);

  if (!sidebarOpen) {
    return (
      <button
        onClick={onOpen}
        style={{
          position: "absolute", left: 0, top: 16, zIndex: 10,
          background: "var(--surface)", border: "1px solid var(--border)", borderLeft: "none",
          borderRadius: "0 10px 10px 0", padding: "10px 8px", color: "var(--ink3)", cursor: "pointer",
          boxShadow: "2px 0 8px rgba(0,0,0,0.04)",
        }}
      >
        <Filter size={14} />
        {activeFilterCount > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, background: "var(--accent)", color: "white", borderRadius: "50%", width: 16, height: 16, fontSize: 9, fontWeight: 700, display: "grid", placeContent: "center" }}>
            {activeFilterCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className="rdv-scrollbar"
      style={{
        width: 260, flexShrink: 0, borderRight: "1px solid var(--border)",
        background: "var(--surface)", overflowY: "auto", padding: "16px",
        display: "flex", flexDirection: "column", gap: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
          <Filter size={15} />
          Filtres
          {activeFilterCount > 0 && (
            <span style={{ background: "var(--accent)", color: "white", borderRadius: 10, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>
              {activeFilterCount}
            </span>
          )}
        </span>
        <button style={{ background: "none", border: "none", color: "var(--ink3)", cursor: "pointer" }} onClick={onClose}>
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* ─── Quick presets ─── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink3)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
          <Zap size={11} />
          Vues rapides
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyQuickPreset(preset.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)",
                cursor: "pointer", textAlign: "left", transition: "all 0.12s",
              }}
              className="rdv-btn"
            >
              <span style={{ fontSize: 14 }}>{preset.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{preset.label}</div>
                <div style={{ fontSize: 10, color: "var(--ink3)", lineHeight: 1.3 }}>{preset.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Sort ─── */}
      <div>
        <button
          onClick={() => setSortOpen((v) => !v)}
          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink3)", display: "flex", alignItems: "center", gap: 5 }}>
            {sortDir === "asc" ? <SortAsc size={11} /> : <SortDesc size={11} />}
            Tri · <span style={{ color: "var(--accent)", fontWeight: 700 }}>{SORT_OPTIONS.find(o => o.value === sortBy)?.label}</span>
          </span>
          {sortOpen ? <ChevronUp size={13} color="var(--ink3)" /> : <ChevronDown size={13} color="var(--ink3)" />}
        </button>
        {sortOpen && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            {SORT_OPTIONS.map((opt) => {
              const isActive = sortBy === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => toggleSort(opt.value)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "6px 10px", borderRadius: 8, border: "1px solid",
                    borderColor: isActive ? "var(--accent)" : "transparent",
                    background: isActive ? "var(--accentLight)" : "var(--surface2)",
                    color: isActive ? "var(--accent)" : "var(--ink2)",
                    fontWeight: isActive ? 600 : 400, fontSize: 12, cursor: "pointer",
                    transition: "all 0.12s",
                  }}
                >
                  {opt.label}
                  {isActive && (
                    <span style={{ fontSize: 10, fontWeight: 700 }}>{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Period ─── */}
      <FilterSection title="Période">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {([["today", "Aujourd'hui"], ["7days", "7 jours"], ["30days", "30 jours"], ["3months", "3 mois"], ["custom", "Personnalisée"]] as [DatePreset, string][]).map(([key, label]) => (
            <button
              key={key}
              className="rdv-btn"
              style={{
                padding: "5px 12px", fontSize: 12, borderRadius: 8,
                background: datePreset === key ? "var(--accentLight)" : "var(--surface2)",
                color: datePreset === key ? "var(--accent)" : "var(--ink2)",
                border: `1px solid ${datePreset === key ? "var(--accent)" : "transparent"}`,
                fontWeight: datePreset === key ? 600 : 400,
              }}
              onClick={() => setDatePreset(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {datePreset === "custom" && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input type="date" className="rdv-input" style={{ flex: 1, fontSize: 12, padding: "8px 10px" }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <input type="date" className="rdv-input" style={{ flex: 1, fontSize: 12, padding: "8px 10px" }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        )}
      </FilterSection>

      {/* ─── Status + Confirmation ─── */}
      <FilterSection title="Statut & Confirmation">
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
          {([["all", "Tous"], ["upcoming", "À venir"], ["past", "Passés"], ["cancelled", "Annulés"]] as const).map(([key, label]) => (
            <button
              key={key}
              className="rdv-pill"
              style={{
                cursor: "pointer", padding: "4px 10px", fontSize: 11,
                background: statusFilter === key ? "var(--accentLight)" : "var(--surface2)",
                color: statusFilter === key ? "var(--accent)" : "var(--ink3)",
                border: `1px solid ${statusFilter === key ? "var(--accent)" : "transparent"}`,
                fontWeight: statusFilter === key ? 600 : 400,
              }}
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {(["all", "PENDING", "CONFIRMED", "CANCELLED"] as ConfirmationFilter[]).map((key) => (
            <button
              key={key}
              className="rdv-pill"
              style={{
                cursor: "pointer", padding: "4px 10px", fontSize: 11,
                background: confirmationFilter === key ? confirmationBg(key) : "var(--surface2)",
                color: confirmationFilter === key ? confirmationColor(key) : "var(--ink3)",
                border: `1px solid ${confirmationFilter === key ? confirmationColor(key) : "transparent"}`,
              }}
              onClick={() => setConfirmationFilter(key)}
            >
              {confirmationLabel(key)}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* ─── Smart filters ─── */}
      <FilterSection title="Données liées">
        <ToggleFilter label="🎙 Audio lié" value={hasAudio} onChange={setHasAudio} />
        <ToggleFilter label="💬 Feedback renseigné" value={hasFeedback} onChange={setHasFeedback} />
      </FilterSection>

      {/* ─── Channel ─── */}
      <FilterSection title="Canal">
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {([["CALL", "📞 Appel"], ["EMAIL", "📧 Email"], ["LINKEDIN", "🔗 LinkedIn"]] as [ChannelFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              className="rdv-pill"
              style={{
                cursor: "pointer", padding: "4px 10px", fontSize: 11,
                background: selectedChannels.has(key) ? "var(--accentLight)" : "var(--surface2)",
                color: selectedChannels.has(key) ? "var(--accent)" : "var(--ink3)",
                border: `1px solid ${selectedChannels.has(key) ? "var(--accent)" : "transparent"}`,
              }}
              onClick={() => toggleSetValue(setSelectedChannels, key)}
            >
              {label}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* ─── Clients ─── */}
      <FilterSection title="Clients">
        {clientOptions.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--ink3)", padding: "4px 0" }}>Aucun client</div>
        ) : (
          <>
            <button
              style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 11, cursor: "pointer", padding: 0, marginBottom: 4, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}
              onClick={() => {
                if (selectedClients.size === clientOptions.length) setSelectedClients(new Set());
                else setSelectedClients(new Set(clientOptions.map((c) => c.id)));
              }}
            >
              {selectedClients.size === clientOptions.length ? "Tout désélectionner" : "Tout sélectionner"}
            </button>
            {clientOptions.map((c) => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--ink2)", cursor: "pointer", padding: "4px 0" }}>
                <input type="checkbox" className="rdv-checkbox" checked={selectedClients.has(c.id)} onChange={() => {
                  toggleSetValue(setSelectedClients, c.id);
                }} />
                <span style={{ flex: 1 }}>{c.name}</span>
                {c.count != null && <span style={{ fontSize: 10, color: "var(--ink3)", background: "var(--surface2)", borderRadius: 6, padding: "1px 6px", fontWeight: 600 }}>{c.count}</span>}
              </label>
            ))}
          </>
        )}
      </FilterSection>

      {/* ─── Missions ─── */}
      {missionOptions.length > 0 && (
        <FilterSection title="Missions">
          {missionOptions.map((m) => (
            <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--ink2)", cursor: "pointer", padding: "4px 0" }}>
              <input type="checkbox" className="rdv-checkbox" checked={selectedMissions.has(m.id)} onChange={() => {
                toggleSetValue(setSelectedMissions, m.id);
              }} />
              <span style={{ flex: 1 }}>{m.name}</span>
              {m.count != null && <span style={{ fontSize: 10, color: "var(--ink3)", background: "var(--surface2)", borderRadius: 6, padding: "1px 6px", fontWeight: 600 }}>{m.count}</span>}
            </label>
          ))}
        </FilterSection>
      )}

      {/* ─── SDRs ─── */}
      {sdrOptions.length > 0 && (
        <FilterSection title="SDRs">
          {sdrOptions.map((s) => (
            <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--ink2)", cursor: "pointer", padding: "4px 0" }}>
              <input type="checkbox" className="rdv-checkbox" checked={selectedSdrs.has(s.id)} onChange={() => {
                toggleSetValue(setSelectedSdrs, s.id);
              }} />
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: hashColor(s.name), display: "grid", placeContent: "center", fontSize: 10, fontWeight: 700, color: "white", flexShrink: 0 }}>
                {s.name.charAt(0)}
              </div>
              <span style={{ flex: 1 }}>{s.name}</span>
              {s.count != null && <span style={{ fontSize: 10, color: "var(--ink3)", background: "var(--surface2)", borderRadius: 6, padding: "1px 6px", fontWeight: 600 }}>{s.count}</span>}
            </label>
          ))}
        </FilterSection>
      )}

      {/* ─── Type + Category ─── */}
      <FilterSection title="Type & Catégorie">
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
          {([["VISIO", "📹 Visio"], ["PHYSIQUE", "📍 Physique"], ["TELEPHONIQUE", "📞 Tel"]] as [MeetingTypeFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              className="rdv-pill"
              style={{
                cursor: "pointer", padding: "4px 10px", fontSize: 11,
                background: selectedMeetingTypes.has(key) ? "var(--accentLight)" : "var(--surface2)",
                color: selectedMeetingTypes.has(key) ? "var(--accent)" : "var(--ink3)",
                border: `1px solid ${selectedMeetingTypes.has(key) ? "var(--accent)" : "transparent"}`,
              }}
              onClick={() => toggleSetValue(setSelectedMeetingTypes, key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {([["EXPLORATOIRE", "Exploratoire"], ["BESOIN", "Besoin"]] as [MeetingCategoryFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              className="rdv-pill"
              style={{
                cursor: "pointer", padding: "4px 10px", fontSize: 11,
                background: selectedMeetingCategories.has(key) ? categoryBg(key) : "var(--surface2)",
                color: selectedMeetingCategories.has(key) ? categoryColor(key) : "var(--ink3)",
                border: `1px solid ${selectedMeetingCategories.has(key) ? categoryColor(key) : "transparent"}`,
              }}
              onClick={() => toggleSetValue(setSelectedMeetingCategories, key)}
            >
              {label}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* ─── Feedback outcome ─── */}
      <FilterSection title="Feedback">
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {([["POSITIVE", "✅ Positif"], ["NEUTRAL", "➖ Neutre"], ["NEGATIVE", "❌ Négatif"], ["NO_SHOW", "👻 Absent"], ["NONE", "💬 Sans retour"]] as [OutcomeFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              className="rdv-pill"
              style={{
                cursor: "pointer", padding: "4px 10px", fontSize: 11,
                background: selectedOutcomes.has(key) ? "var(--accentLight)" : "var(--surface2)",
                color: selectedOutcomes.has(key) ? "var(--accent)" : "var(--ink3)",
                border: `1px solid ${selectedOutcomes.has(key) ? "var(--accent)" : "transparent"}`,
              }}
              onClick={() => toggleSetValue(setSelectedOutcomes, key)}
            >
              {label}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* ─── Active filter chips ─── */}
      {activeFilterCount > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "var(--ink3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Filtres actifs</span>
            <button style={{ background: "none", border: "none", color: "var(--red)", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }} onClick={clearAllFilters}>
              Tout effacer
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {search && <FilterChip label={`"${search}"`} onRemove={() => setSearch("")} />}
            {statusFilter !== "all" && <FilterChip label={statusLabel(statusFilter)} onRemove={() => setStatusFilter("all")} />}
            {confirmationFilter !== "all" && <FilterChip label={confirmationLabel(confirmationFilter)} onRemove={() => setConfirmationFilter("all")} />}
            {hasAudio !== null && <FilterChip label={hasAudio ? "Avec audio" : "Sans audio"} onRemove={() => setHasAudio(null)} />}
            {hasFeedback !== null && <FilterChip label={hasFeedback ? "Avec feedback" : "Sans feedback"} onRemove={() => setHasFeedback(null)} />}
            {Array.from(selectedChannels).map((ch) => (
              <FilterChip key={ch} label={ch} onRemove={() => setSelectedChannels((p) => { const n = new Set(p); n.delete(ch); return n; })} />
            ))}
            {Array.from(selectedClients).map((id) => {
              const c = clientOptions.find((o) => o.id === id);
              return c ? <FilterChip key={id} label={c.name} onRemove={() => setSelectedClients((p) => { const n = new Set(p); n.delete(id); return n; })} /> : null;
            })}
            {Array.from(selectedMissions).map((id) => {
              const m = missionOptions.find((o) => o.id === id);
              return m ? <FilterChip key={id} label={m.name} onRemove={() => setSelectedMissions((p) => { const n = new Set(p); n.delete(id); return n; })} /> : null;
            })}
            {Array.from(selectedSdrs).map((id) => {
              const s = sdrOptions.find((o) => o.id === id);
              return s ? <FilterChip key={id} label={s.name} onRemove={() => setSelectedSdrs((p) => { const n = new Set(p); n.delete(id); return n; })} /> : null;
            })}
            {Array.from(selectedMeetingTypes).map((t) => (
              <FilterChip key={t} label={meetingTypeLabel(t)} onRemove={() => setSelectedMeetingTypes((p) => { const n = new Set(p); n.delete(t); return n; })} />
            ))}
            {Array.from(selectedMeetingCategories).map((c) => (
              <FilterChip key={c} label={categoryLabel(c)} onRemove={() => setSelectedMeetingCategories((p) => { const n = new Set(p); n.delete(c); return n; })} />
            ))}
            {Array.from(selectedOutcomes).map((o) => (
              <FilterChip key={o} label={o} onRemove={() => setSelectedOutcomes((p) => { const n = new Set(p); n.delete(o); return n; })} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
