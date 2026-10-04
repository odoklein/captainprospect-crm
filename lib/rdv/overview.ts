/**
 * "Bilan des RDV" — what happened to every RDV in a population.
 *
 * Each RDV lands in exactly one bucket, so the buckets always add up to the
 * total and the manager can read the whole population on one bar. Pure: no
 * Prisma, no Date.now() — the route passes rows and `now` in.
 */

export type RdvBucket =
  | "upcoming_confirmed"
  | "upcoming_pending"
  | "positive"
  | "neutral"
  | "negative"
  | "no_show"
  | "no_feedback"
  | "rejected"
  | "cancelled"
  | "replaced";

/** Display order: still ahead → happened → left the pipeline. */
export const RDV_BUCKETS: RdvBucket[] = [
  "upcoming_confirmed",
  "upcoming_pending",
  "positive",
  "neutral",
  "negative",
  "no_show",
  "no_feedback",
  "rejected",
  "cancelled",
  "replaced",
];

export interface OverviewRow {
  result: string;
  confirmationStatus: string;
  callbackDate: Date | null;
  cancellationReason: string | null;
  sdr: { id: string; name: string | null } | null;
  client: { id: string; name: string } | null;
  feedback: {
    outcome: string;
    standByAt: Date | null;
    outOfScopeAt: Date | null;
  } | null;
}

export interface OverviewBreakdownRow {
  id: string;
  name: string;
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  noShow: number;
  noFeedback: number;
  upcoming: number;
  lost: number;
}

export interface RdvOverview {
  total: number;
  buckets: Record<RdvBucket, number>;
  /** Absences split by what has been done about them. */
  noShow: { open: number; standBy: number; outOfScope: number };
  rates: {
    /** Held / (held + absent). Null until at least one RDV has been reported. */
    showRate: number | null;
    /** Positive / held. */
    positiveRate: number | null;
    /** Past RDVs with a reported outcome / all past RDVs. */
    feedbackCoverage: number | null;
    /** (Rejected at SAS + cancelled) / total. Replaced RDVs are re-booked, not lost. */
    lossRate: number | null;
  };
  byClient: OverviewBreakdownRow[];
  bySdr: OverviewBreakdownRow[];
}

export function classifyRdv(row: OverviewRow, now: Date): RdvBucket {
  if (row.result === "MEETING_CANCELLED") {
    return row.cancellationReason === "replaced" ? "replaced" : "cancelled";
  }
  // Rejected at SAS keeps result=MEETING_BOOKED: it must not read as upcoming.
  if (row.confirmationStatus === "CANCELLED") return "rejected";

  if (row.callbackDate && row.callbackDate.getTime() >= now.getTime()) {
    return row.confirmationStatus === "CONFIRMED" ? "upcoming_confirmed" : "upcoming_pending";
  }

  switch (row.feedback?.outcome) {
    case "POSITIVE":
      return "positive";
    case "NEUTRAL":
      return "neutral";
    case "NEGATIVE":
      return "negative";
    case "NO_SHOW":
      return "no_show";
    default:
      return "no_feedback";
  }
}

function emptyBuckets(): Record<RdvBucket, number> {
  return Object.fromEntries(RDV_BUCKETS.map((b) => [b, 0])) as Record<RdvBucket, number>;
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 100) : null;
}

function bump(map: Map<string, OverviewBreakdownRow>, id: string, name: string, bucket: RdvBucket) {
  let entry = map.get(id);
  if (!entry) {
    entry = { id, name, total: 0, positive: 0, neutral: 0, negative: 0, noShow: 0, noFeedback: 0, upcoming: 0, lost: 0 };
    map.set(id, entry);
  }
  entry.total++;
  if (bucket === "positive") entry.positive++;
  else if (bucket === "neutral") entry.neutral++;
  else if (bucket === "negative") entry.negative++;
  else if (bucket === "no_show") entry.noShow++;
  else if (bucket === "no_feedback") entry.noFeedback++;
  else if (bucket === "upcoming_confirmed" || bucket === "upcoming_pending") entry.upcoming++;
  else if (bucket === "rejected" || bucket === "cancelled") entry.lost++;
}

export function buildRdvOverview(rows: OverviewRow[], now: Date, breakdownLimit = 6): RdvOverview {
  const buckets = emptyBuckets();
  const noShow = { open: 0, standBy: 0, outOfScope: 0 };
  const clients = new Map<string, OverviewBreakdownRow>();
  const sdrs = new Map<string, OverviewBreakdownRow>();

  for (const row of rows) {
    const bucket = classifyRdv(row, now);
    buckets[bucket]++;

    if (bucket === "no_show") {
      if (row.feedback?.outOfScopeAt) noShow.outOfScope++;
      else if (row.feedback?.standByAt) noShow.standBy++;
      else noShow.open++;
    }

    if (row.client) bump(clients, row.client.id, row.client.name, bucket);
    if (row.sdr) bump(sdrs, row.sdr.id, row.sdr.name ?? "—", bucket);
  }

  const held = buckets.positive + buckets.neutral + buckets.negative;
  const reported = held + buckets.no_show;

  const top = (map: Map<string, OverviewBreakdownRow>) =>
    Array.from(map.values())
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
      .slice(0, breakdownLimit);

  return {
    total: rows.length,
    buckets,
    noShow,
    rates: {
      showRate: ratio(held, reported),
      positiveRate: ratio(buckets.positive, held),
      feedbackCoverage: ratio(reported, reported + buckets.no_feedback),
      lossRate: ratio(buckets.rejected + buckets.cancelled, rows.length),
    },
    byClient: top(clients),
    bySdr: top(sdrs),
  };
}
