"use client";

import { memo, useEffect, useRef, useState } from "react";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import type { DateField, DatePreset } from "../_types";
import { PERIOD_OPTIONS, toLocalDateInput } from "../_lib/formatters";

/**
 * Period control for SAS RDV: every preset up to "Depuis le début du CRM",
 * an exact range, and which date the period applies to.
 */

interface PeriodPickerProps {
  datePreset: DatePreset;
  dateField: DateField;
  dateFrom: string;
  dateTo: string;
  setDatePreset: (v: DatePreset) => void;
  setDateField: (v: DateField) => void;
  setCustomRange: (from: string, to: string) => void;
}

function frDate(iso: string): string {
  if (!iso) return "…";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function periodLabel(datePreset: DatePreset, dateFrom: string, dateTo: string): string {
  if (datePreset === "custom") {
    if (!dateFrom && !dateTo) return "Personnalisée";
    if (!dateTo) return `Depuis le ${frDate(dateFrom)}`;
    if (!dateFrom) return `Jusqu'au ${frDate(dateTo)}`;
    return `${frDate(dateFrom)} → ${frDate(dateTo)}`;
  }
  return PERIOD_OPTIONS.find((o) => o.key === datePreset)?.label ?? "Période";
}

export const PeriodPicker = memo(function PeriodPicker({
  datePreset,
  dateField,
  dateFrom,
  dateTo,
  setDatePreset,
  setDateField,
  setCustomRange,
}: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo] = useState(dateTo);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setFrom(dateFrom);
    setTo(dateTo);
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, dateFrom, dateTo]);

  const pick = (key: DatePreset) => {
    setDatePreset(key);
    setOpen(false);
  };

  const applyCustom = () => {
    // Swap a reversed range rather than returning nothing.
    const [a, b] = from && to && from > to ? [to, from] : [from, to];
    setCustomRange(a, b);
    setOpen(false);
  };

  const today = toLocalDateInput(new Date());
  const presets = PERIOD_OPTIONS.filter((o) => o.key !== "custom");

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        className={`rdv-btn rdv-btn-ghost ${datePreset !== "3months" ? "rdv-period-set" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Choisir la période"
      >
        <CalendarRange size={13} />
        <span style={{ color: "var(--ink3)", fontWeight: 500 }}>{dateField === "callbackDate" ? "RDV prévus" : "RDV créés"} :</span>
        <span style={{ fontWeight: 650, color: "var(--ink)" }}>{periodLabel(datePreset, dateFrom, dateTo)}</span>
        <ChevronDown size={12} style={{ color: "var(--ink3)" }} />
      </button>

      {open && (
        <div className="rdv-popover" role="dialog" aria-label="Période">
          <div className="rdv-eyebrow" style={{ marginBottom: 6 }}>Appliquer la période à</div>
          <div className="rdv-seg" style={{ width: "100%", marginBottom: 12 }} role="group">
            <button
              type="button"
              className={`rdv-seg-btn ${dateField === "createdAt" ? "active" : ""}`}
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => setDateField("createdAt")}
              title="Quand le SDR a pris le RDV"
            >
              Date de prise du RDV
            </button>
            <button
              type="button"
              className={`rdv-seg-btn ${dateField === "callbackDate" ? "active" : ""}`}
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => setDateField("callbackDate")}
              title="Quand le rendez-vous a lieu"
            >
              Date du RDV
            </button>
          </div>

          <div className="rdv-eyebrow" style={{ marginBottom: 6 }}>Période</div>
          <div className="rdv-period-grid">
            {presets.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`rdv-period-opt ${datePreset === o.key ? "active" : ""} ${o.key === "all" ? "wide" : ""}`}
                onClick={() => pick(o.key)}
              >
                <span>{o.label}</span>
                {datePreset === o.key && <Check size={13} />}
              </button>
            ))}
          </div>

          <div className="rdv-eyebrow" style={{ margin: "12px 0 6px" }}>Dates précises</div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--ink3)" }}>
              Du
              <input type="date" className="rdv-input" style={{ fontSize: 12, padding: "6px 8px" }} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--ink3)" }}>
              Au
              <input type="date" className="rdv-input" style={{ fontSize: 12, padding: "6px 8px" }} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className="rdv-link-btn"
              onClick={() => { setFrom(""); setTo(today); }}
              title="Tout l'historique jusqu'à aujourd'hui"
            >
              Du début à aujourd'hui
            </button>
            <button
              type="button"
              className="rdv-btn rdv-btn-primary rdv-btn-sm"
              onClick={applyCustom}
              disabled={!from && !to}
            >
              Appliquer
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
