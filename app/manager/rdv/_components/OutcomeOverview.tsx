"use client";

import { memo, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { RdvBucket, RdvOverview } from "../_types";
import type { OverviewBreakdownRow } from "@/lib/rdv/overview";
import { Skeleton } from "./shared/Skeleton";
import { BUCKET_META, bucketSwatch } from "../_lib/buckets";

/**
 * "Bilan des RDV": what happened to every RDV of the current scope, on one bar.
 * Computed server-side on the scope filters only (client, SDR, period…), so it
 * stays a stable overview while the segments drill the list down.
 */

const BUCKETS = BUCKET_META;

const GROUPS: { label: string; buckets: RdvBucket[] }[] = [
  { label: "À venir", buckets: ["upcoming_confirmed", "upcoming_pending"] },
  { label: "Réalisés", buckets: ["positive", "neutral", "negative", "no_show", "no_feedback"] },
  { label: "Sortis du pipe", buckets: ["rejected", "cancelled", "replaced"] },
];

const ORDER: RdvBucket[] = GROUPS.flatMap((g) => g.buckets);

const STORAGE_KEY = "rdv-bilan-open";

function pct(n: number, total: number): string {
  if (total === 0) return "0 %";
  const v = (n / total) * 100;
  return `${v > 0 && v < 1 ? "<1" : Math.round(v)} %`;
}

const swatchStyle = bucketSwatch;

interface OutcomeOverviewProps {
  overview: RdvOverview | null;
  loading: boolean;
  activeBucket: RdvBucket | null;
  onDrill: (bucket: RdvBucket) => void;
  selectedClients: Set<string>;
  selectedSdrs: Set<string>;
  onToggleClient: (id: string) => void;
  onToggleSdr: (id: string) => void;
  scopeLabel: string;
}

export const OutcomeOverview = memo(function OutcomeOverview({
  overview,
  loading,
  activeBucket,
  onDrill,
  selectedClients,
  selectedSdrs,
  onToggleClient,
  onToggleSdr,
  scopeLabel,
}: OutcomeOverviewProps) {
  const [open, setOpen] = useState(true);
  const [hovered, setHovered] = useState<RdvBucket | null>(null);
  const [breakdown, setBreakdown] = useState<"client" | "sdr">("client");

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "0") setOpen(false);
    } catch {
      /* storage unavailable: stay open */
    }
  }, []);

  const toggleOpen = () => {
    setOpen((prev) => {
      try {
        localStorage.setItem(STORAGE_KEY, prev ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !prev;
    });
  };

  const total = overview?.total ?? 0;
  const focus = hovered ?? activeBucket;
  const b = overview?.buckets;

  return (
    <section className="rdv-bilan" aria-label="Bilan des RDV">
      <div className="rdv-bilan-head">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
          <h2 className="rdv-serif" style={{ fontSize: 15, margin: 0, color: "var(--ink)" }}>
            Bilan des RDV
          </h2>
          <span style={{ fontSize: 12, color: "var(--ink3)" }}>
            <strong style={{ color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{total}</strong> RDV · {scopeLabel}
          </span>
          {open && total > 0 && (
            <span style={{ fontSize: 11, color: "var(--ink4)" }}>Cliquez un segment pour filtrer la liste</span>
          )}
        </div>
        <button type="button" className="rdv-btn rdv-btn-ghost rdv-btn-sm" onClick={toggleOpen} aria-expanded={open}>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {open ? "Masquer" : "Afficher"}
        </button>
      </div>

      {open && (
        loading && !overview ? (
          <div style={{ padding: "4px 20px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            <Skeleton w="100%" h={14} r={7} />
            <Skeleton w="100%" h={64} r={10} />
          </div>
        ) : !overview || total === 0 ? (
          <div style={{ padding: "4px 20px 14px", fontSize: 12.5, color: "var(--ink3)" }}>
            Aucun RDV dans ce périmètre.
          </div>
        ) : (
          <div className="rdv-bilan-grid">
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {/* The whole population on one bar */}
              <div>
                <div
                  className="rdv-bilan-bar"
                  onMouseLeave={() => setHovered(null)}
                  role="group"
                  aria-label="Répartition des RDV par issue"
                >
                  {ORDER.filter((k) => b![k] > 0).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`rdv-bilan-seg ${focus && focus !== k ? "dim" : ""}`}
                      style={{ flexGrow: b![k], ...swatchStyle(k) }}
                      onMouseEnter={() => setHovered(k)}
                      onFocus={() => setHovered(k)}
                      onBlur={() => setHovered(null)}
                      onClick={() => onDrill(k)}
                      aria-pressed={activeBucket === k}
                      aria-label={`${BUCKETS[k].label} : ${b![k]} RDV (${pct(b![k], total)})`}
                    />
                  ))}
                </div>
                <div className="rdv-bilan-readout" aria-live="polite">
                  {focus ? (
                    <>
                      <span className="rdv-bilan-swatch" style={swatchStyle(focus)} />
                      <strong>{BUCKETS[focus].label}</strong>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        {b![focus]} RDV · {pct(b![focus], total)}
                      </span>
                      <span style={{ color: "var(--ink4)" }}>— {BUCKETS[focus].hint}</span>
                      {focus === activeBucket && !hovered && (
                        <span className="rdv-count" style={{ marginLeft: "auto" }}>Filtre actif · cliquez pour retirer</span>
                      )}
                    </>
                  ) : (
                    <span style={{ color: "var(--ink4)" }}>Survolez la barre pour le détail</span>
                  )}
                </div>
              </div>

              {/* Legend, grouped by stage — every bucket has its number */}
              <div className="rdv-bilan-groups">
                {GROUPS.map((group) => {
                  const groupTotal = group.buckets.reduce((s, k) => s + b![k], 0);
                  return (
                    <div key={group.label} className="rdv-bilan-group">
                      <div className="rdv-bilan-group-head">
                        <span>{group.label}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          <strong>{groupTotal}</strong> · {pct(groupTotal, total)}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {group.buckets.map((k) => (
                          <button
                            key={k}
                            type="button"
                            className={`rdv-bilan-item ${activeBucket === k || (k === "replaced" && activeBucket === "cancelled") ? "active" : ""}`}
                            onClick={() => onDrill(k)}
                            onMouseEnter={() => setHovered(k)}
                            onMouseLeave={() => setHovered(null)}
                            disabled={b![k] === 0}
                            title={BUCKETS[k].hint}
                          >
                            <span className="rdv-bilan-swatch" style={swatchStyle(k)} />
                            <span>{BUCKETS[k].label}</span>
                            <strong style={{ fontVariantNumeric: "tabular-nums" }}>{b![k]}</strong>
                            {k === "no_show" && overview.noShow.open > 0 && (
                              <span className="rdv-count" data-tone="pending">{overview.noShow.open} à traiter</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rates */}
              <div className="rdv-bilan-rates">
                <RateTile
                  label="Taux de présence"
                  value={overview.rates.showRate}
                  sub={`${b!.no_show} absent${b!.no_show > 1 ? "s" : ""} sur ${b!.positive + b!.neutral + b!.negative + b!.no_show} RDV renseignés`}
                />
                <RateTile
                  label="Taux positif"
                  value={overview.rates.positiveRate}
                  sub={`${b!.positive} positif${b!.positive > 1 ? "s" : ""} parmi les RDV tenus`}
                />
                <RateTile
                  label="Retours renseignés"
                  value={overview.rates.feedbackCoverage}
                  sub={b!.no_feedback > 0 ? `${b!.no_feedback} RDV passé${b!.no_feedback > 1 ? "s" : ""} sans retour` : "Tous les RDV passés ont un retour"}
                  warn={b!.no_feedback > 0}
                  onClick={b!.no_feedback > 0 ? () => onDrill("no_feedback") : undefined}
                />
                <RateTile
                  label="Taux de perte"
                  value={overview.rates.lossRate}
                  sub={`${b!.rejected} rejeté${b!.rejected > 1 ? "s" : ""} SAS · ${b!.cancelled} annulé${b!.cancelled > 1 ? "s" : ""}`}
                />
              </div>
            </div>

            {/* Who drives the results */}
            <div className="rdv-bilan-side">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <span className="rdv-eyebrow">Répartition</span>
                <div className="rdv-seg" role="group" aria-label="Répartition par">
                  <button
                    type="button"
                    className={`rdv-seg-btn ${breakdown === "client" ? "active" : ""}`}
                    style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => setBreakdown("client")}
                  >
                    Par client
                  </button>
                  <button
                    type="button"
                    className={`rdv-seg-btn ${breakdown === "sdr" ? "active" : ""}`}
                    style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => setBreakdown("sdr")}
                  >
                    Par SDR
                  </button>
                </div>
              </div>
              <BreakdownTable
                rows={breakdown === "client" ? overview.byClient : overview.bySdr}
                selected={breakdown === "client" ? selectedClients : selectedSdrs}
                onToggle={breakdown === "client" ? onToggleClient : onToggleSdr}
                emptyLabel={breakdown === "client" ? "Aucun client" : "Aucun SDR"}
              />
            </div>
          </div>
        )
      )}
    </section>
  );
});

function RateTile({
  label,
  value,
  sub,
  warn,
  onClick,
}: {
  label: string;
  value: number | null;
  sub: string;
  warn?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="rdv-metric-label">{label}</span>
      <span className="rdv-metric-value" style={{ fontSize: 20 }}>
        {value === null ? "—" : <>{value}<span style={{ fontSize: 12, color: "var(--ink3)", marginLeft: 2 }}>%</span></>}
      </span>
      <span style={{ fontSize: 11, color: warn ? "var(--amberInk)" : "var(--ink3)", lineHeight: 1.35 }}>{sub}</span>
    </>
  );
  return onClick ? (
    <button type="button" className="rdv-bilan-rate interactive" onClick={onClick} title="Voir ces RDV">
      {content}
    </button>
  ) : (
    <div className="rdv-bilan-rate">{content}</div>
  );
}

const MINI: { key: keyof OverviewBreakdownRow; bucket: RdvBucket }[] = [
  { key: "upcoming", bucket: "upcoming_confirmed" },
  { key: "positive", bucket: "positive" },
  { key: "neutral", bucket: "neutral" },
  { key: "negative", bucket: "negative" },
  { key: "noShow", bucket: "no_show" },
  { key: "noFeedback", bucket: "no_feedback" },
  { key: "lost", bucket: "cancelled" },
];

function BreakdownTable({
  rows,
  selected,
  onToggle,
  emptyLabel,
}: {
  rows: OverviewBreakdownRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <div style={{ fontSize: 12, color: "var(--ink3)" }}>{emptyLabel}</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {rows.map((row) => {
        const held = row.positive + row.neutral + row.negative;
        const positiveRate = held > 0 ? Math.round((row.positive / held) * 100) : null;
        return (
          <button
            key={row.id}
            type="button"
            className={`rdv-bilan-row ${selected.has(row.id) ? "active" : ""}`}
            onClick={() => onToggle(row.id)}
            title={`${row.name} — ${row.positive} positifs · ${row.neutral} neutres · ${row.negative} négatifs · ${row.noShow} absents · ${row.noFeedback} sans retour · ${row.upcoming} à venir · ${row.lost} perdus. Cliquez pour filtrer.`}
          >
            <span className="rdv-bilan-row-name">{row.name}</span>
            <span className="rdv-bilan-mini">
              {MINI.filter((m) => (row[m.key] as number) > 0).map((m) => (
                <span key={m.key} style={{ flexGrow: row[m.key] as number, ...swatchStyle(m.bucket) }} />
              ))}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
              {row.total}
            </span>
            <span style={{ fontSize: 11, color: "var(--ink3)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
              {positiveRate === null ? "—" : `${positiveRate} % pos.`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
