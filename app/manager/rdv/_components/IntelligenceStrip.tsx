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
      color: "var(--accent)",
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
      color: "var(--rose)",
      icon: Users,
      active: false,
      interactive: false,
      onClick: () => {},
    },
  ];

  return (
    <div className="rdv-kpi-strip rdv-scrollbar">
      {loading
        ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} w="100%" h={58} r={12} />)
        : cards.map((card) => {
            const Icon = card.icon;
            const className = `rdv-metric-card ${card.interactive ? "interactive" : ""} ${card.active ? "active" : ""} ${card.urgent ? "pulse-urgent" : ""}`;
            const body = (
              <>
                <span className="rdv-metric-icon" style={{ "--tone": card.urgent ? "var(--amber)" : card.color } as React.CSSProperties}>
                  <Icon size={16} strokeWidth={2} />
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
                  <span className="rdv-metric-label">{card.label}</span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                    <span className="rdv-metric-value" style={card.urgent ? { color: "var(--amberInk)" } : undefined}>
                      <AnimatedNumber value={card.value} />
                    </span>
                    {card.suffix && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink3)" }}>{card.suffix}</span>
                    )}
                    {card.urgent && (
                      <span className="rdv-count" data-tone="pending" style={{ marginLeft: "auto" }}>
                        À traiter
                      </span>
                    )}
                  </span>
                </span>
              </>
            );
            return card.interactive ? (
              <button
                key={card.label}
                type="button"
                className={className}
                onClick={card.onClick}
                aria-pressed={card.active}
                title={`Filtrer par : ${card.label}`}
              >
                {body}
              </button>
            ) : (
              <div key={card.label} className={className}>
                {body}
              </div>
            );
          })}
    </div>
  );
});
