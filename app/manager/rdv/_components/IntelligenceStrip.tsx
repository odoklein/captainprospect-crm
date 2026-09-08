"use client";

import { memo } from "react";
import type { Aggregates, ConfirmationFilter, StatusFilter, DatePreset } from "../_types";
import { Skeleton } from "./shared/Skeleton";
import { AnimatedNumber } from "./shared/AnimatedNumber";
import { Clock, CheckCircle2, TrendingUp, Calendar, Users, ListChecks } from "lucide-react";

interface IntelligenceStripProps {
  aggregates: Aggregates | null;
  loading: boolean;
  statusFilter: StatusFilter;
  datePreset: DatePreset;
  confirmationFilter?: ConfirmationFilter;
  onSetStatusFilter: (v: StatusFilter) => void;
  onSetDatePreset: (v: DatePreset) => void;
  onSetConfirmationFilter?: (v: ConfirmationFilter) => void;
}

export const IntelligenceStrip = memo(function IntelligenceStrip({
  aggregates,
  loading,
  statusFilter,
  datePreset,
  confirmationFilter,
  onSetStatusFilter,
  onSetDatePreset,
  onSetConfirmationFilter,
}: IntelligenceStripProps) {
  const pending = aggregates?.pendingCount ?? 0;

  const cards = [
    {
      label: "SAS En Attente",
      value: pending,
      color: "var(--amber)",
      icon: Clock,
      active: confirmationFilter === "PENDING",
      interactive: true,
      urgent: pending > 0,
      onClick: () => {
        if (onSetConfirmationFilter) {
          onSetConfirmationFilter(confirmationFilter === "PENDING" ? "all" : "PENDING");
        }
      },
    },
    {
      label: "Total RDV",
      value: aggregates?.totalCount ?? 0,
      color: "var(--accent)",
      icon: ListChecks,
      active: statusFilter === "all" && (!confirmationFilter || confirmationFilter === "all"),
      interactive: true,
      onClick: () => {
        onSetStatusFilter("all");
        if (onSetConfirmationFilter) onSetConfirmationFilter("all");
      },
    },
    {
      label: "À venir",
      value: aggregates?.upcomingCount ?? 0,
      color: "var(--green)",
      icon: Calendar,
      active: statusFilter === "upcoming",
      interactive: true,
      onClick: () => onSetStatusFilter(statusFilter === "upcoming" ? "all" : "upcoming"),
    },
    {
      label: "Taux Conv. SAS",
      value: aggregates?.conversionRate ?? 0,
      color: "var(--blue)",
      suffix: "%",
      icon: TrendingUp,
      active: false,
      interactive: false,
      onClick: () => {},
    },
    {
      label: "Cette semaine",
      value: aggregates?.meetingsThisWeek ?? 0,
      color: "var(--accent)",
      icon: Calendar,
      active: datePreset === "7days",
      interactive: true,
      onClick: () => onSetDatePreset("7days"),
    },
    {
      label: "Moy. / SDR",
      value: aggregates?.avgPerSdr ?? 0,
      color: "#8b5cf6",
      icon: Users,
      active: false,
      interactive: false,
      onClick: () => {},
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "8px 20px",
        flexShrink: 0,
        overflowX: "auto",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
      }}
      className="rdv-scrollbar"
    >
      {loading
        ? Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ flex: 1, minWidth: 130 }}>
              <Skeleton w="100%" h={54} r={10} />
            </div>
          ))
        : cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className={`rdv-metric-card ${card.active ? "active" : ""} ${card.urgent ? "pulse-urgent" : ""}`}
                style={{
                  flex: 1,
                  minWidth: 135,
                  cursor: card.interactive ? "pointer" : "default",
                  padding: "8px 12px",
                  borderRadius: 10,
                  borderLeft: `3px solid ${card.color}`,
                  background: card.active ? "var(--surface2)" : "var(--surface)",
                }}
                onClick={card.interactive ? card.onClick : undefined}
                title={card.interactive ? `Filtrer par : ${card.label}` : undefined}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--ink3)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {card.label}
                  </span>
                  <Icon size={12} style={{ color: card.color, opacity: 0.8 }} />
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginTop: 2 }}>
                  <span
                    style={{
                      fontSize: 19,
                      fontWeight: 700,
                      color: card.urgent ? "var(--amber)" : "var(--ink)",
                      letterSpacing: "-0.02em",
                      lineHeight: 1.1,
                    }}
                  >
                    <AnimatedNumber value={card.value} />
                  </span>
                  {card.suffix && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink3)" }}>{card.suffix}</span>
                  )}
                  {card.urgent && (
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 4,
                        background: "var(--amberLight)",
                        color: "var(--amber)",
                      }}
                    >
                      À traiter
                    </span>
                  )}
                </div>
              </div>
            );
          })}
    </div>
  );
});
