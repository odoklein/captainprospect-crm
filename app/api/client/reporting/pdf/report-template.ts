import { brand } from "@/lib/brand";
/**
 * Modern SaaS-style PDF report — HTML template for Puppeteer.
 * Design: Stripe / Linear / Notion — minimal, airy, strong hierarchy.
 */

export interface ReportTemplateData {
    clientName: string;
    missionLabel: string;
    periodLabel: string;
    generatedDate: string;
    /** Hero KPI */
    meetingsBooked: number;
    /** Optional: e.g. +18 vs previous period */
    meetingsDelta?: number;
    /** Card KPIs */
    contactsReached: number;
    qualifiedLeads: number;
    opportunities: number;
    conversionRate: number;
    /** Optional deltas for cards (same order: contacts, qualified, meetings, conversion) */
    deltas?: [number | null, number | null, number | null, number | null];
    /** For line chart */
    meetingsByPeriod: Array<{ label: string; count: number }>;
    missions: Array<{
        name: string;
        isActive: boolean;
        sdrCount: number;
        objective: string | null;
        startDate: string;
        endDate: string;
    }>;
}

function esc(s: string): string {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDelta(d: number): string {
    const sign = d >= 0 ? "+" : "";
    return `${sign}${d}%`;
}

/** Build SVG path for a minimal line chart (points from meetingsByPeriod). */
function lineChartPath(points: Array<{ label: string; count: number }>, width: number, height: number): string {
    if (points.length === 0) return "";
    const max = Math.max(1, ...points.map((p) => p.count));
    const padding = 24;
    const w = width - padding * 2;
    const h = height - padding * 2;
    const step = points.length <= 1 ? w : w / (points.length - 1);
    const coords = points.map((p, i) => {
        const x = padding + i * step;
        const y = padding + h - (p.count / max) * h;
        return [x, y];
    });
    return coords.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
}

export function getReportHtml(data: ReportTemplateData): string {
    const d = data;
    const periodUpper = esc(d.periodLabel).toUpperCase();
    const chartW = 520;
    const chartH = 140;
    const pathD = lineChartPath(d.meetingsByPeriod.slice(0, 12), chartW, chartH);
    const maxCount = Math.max(1, ...d.meetingsByPeriod.map((p) => p.count));
    const points = d.meetingsByPeriod.slice(0, 12);

    const cardDeltas = d.deltas ?? [null, null, null, null];

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rapport d'activité — ${esc(d.clientName)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    body { font-family: 'Inter', system-ui, sans-serif; }
  </style>
</head>
<body class="bg-white text-slate-900 antialiased">
  <div class="max-w-3xl mx-auto px-10 pt-12 pb-16">
    <!-- Cover: top ~30% -->
    <section class="mb-16">
      <p class="text-xs font-medium tracking-widest text-slate-400 uppercase mb-2">${periodUpper}</p>
      <h1 class="text-3xl font-bold text-slate-900 tracking-tight mb-1">${esc(d.missionLabel)}</h1>
      <p class="text-sm text-slate-500 mb-10">${esc(d.clientName)} · Généré le ${esc(d.generatedDate)}</p>
      <div class="text-center py-8">
        <p class="text-6xl font-bold text-slate-900 tabular-nums">${d.meetingsBooked}</p>
        <p class="text-lg font-medium text-slate-600 mt-1">RDV planifiés</p>
        ${d.meetingsDelta != null ? `<p class="text-sm mt-2 text-emerald-600 font-medium">${formatDelta(d.meetingsDelta)} vs période précédente</p>` : ""}
      </div>
    </section>

    <!-- Section 1: Performance snapshot (4 cards) -->
    <section class="mb-14">
      <h2 class="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-6">Performance</h2>
      <div class="grid grid-cols-4 gap-4">
        <div class="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p class="text-2xl font-bold text-slate-900 tabular-nums">${d.contactsReached}</p>
          <p class="text-xs text-slate-500 mt-1">Contacts</p>
          ${cardDeltas[0] != null ? `<p class="text-xs mt-2 ${cardDeltas[0] >= 0 ? "text-emerald-600" : "text-slate-400"}">${formatDelta(cardDeltas[0])}</p>` : ""}
        </div>
        <div class="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p class="text-2xl font-bold text-slate-900 tabular-nums">${d.qualifiedLeads}</p>
          <p class="text-xs text-slate-500 mt-1">Qualifiés</p>
          ${cardDeltas[1] != null ? `<p class="text-xs mt-2 ${cardDeltas[1] >= 0 ? "text-emerald-600" : "text-slate-400"}">${formatDelta(cardDeltas[1])}</p>` : ""}
        </div>
        <div class="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p class="text-2xl font-bold text-slate-900 tabular-nums">${d.meetingsBooked}</p>
          <p class="text-xs text-slate-500 mt-1">RDV</p>
          ${cardDeltas[2] != null ? `<p class="text-xs mt-2 ${cardDeltas[2] >= 0 ? "text-emerald-600" : "text-slate-400"}">${formatDelta(cardDeltas[2])}</p>` : ""}
        </div>
        <div class="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p class="text-2xl font-bold text-slate-900 tabular-nums">${d.conversionRate}%</p>
          <p class="text-xs text-slate-500 mt-1">Conversion</p>
          ${cardDeltas[3] != null ? `<p class="text-xs mt-2 ${cardDeltas[3] >= 0 ? "text-emerald-600" : "text-slate-400"}">${formatDelta(cardDeltas[3])}</p>` : ""}
        </div>
      </div>
    </section>

    <!-- Funnel: Contacts → Qualified → Meetings → Opportunities -->
    <section class="mb-14">
      <h2 class="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-6">Parcours</h2>
      <div class="flex flex-wrap items-center gap-2">
        <div class="rounded-lg bg-slate-100 px-4 py-2"><span class="font-semibold text-slate-900 tabular-nums">${d.contactsReached}</span> <span class="text-slate-500 text-sm">Contacts</span></div>
        <span class="text-slate-300">→</span>
        <div class="rounded-lg bg-slate-100 px-4 py-2"><span class="font-semibold text-slate-900 tabular-nums">${d.qualifiedLeads}</span> <span class="text-slate-500 text-sm">Qualifiés</span></div>
        <span class="text-slate-300">→</span>
        <div class="rounded-lg bg-slate-100 px-4 py-2"><span class="font-semibold text-slate-900 tabular-nums">${d.meetingsBooked}</span> <span class="text-slate-500 text-sm">RDV</span></div>
        <span class="text-slate-300">→</span>
        <div class="rounded-lg bg-slate-100 px-4 py-2"><span class="font-semibold text-slate-900 tabular-nums">${d.opportunities}</span> <span class="text-slate-500 text-sm">Opportunités</span></div>
      </div>
    </section>

    <!-- Section 2: Trend (minimal line chart) -->
    <section class="mb-14">
      <h2 class="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-6">Tendance des RDV</h2>
      <div class="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
        ${points.length === 0 ? `<p class="text-sm text-slate-400">Aucun RDV sur la période.</p>` : `
        <svg viewBox="0 0 ${chartW} ${chartH}" class="w-full h-[140px]" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0.2" />
              <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:0" />
            </linearGradient>
          </defs>
          <!-- Light grid -->
          ${Array.from({ length: 4 }, (_, i) => (i + 1) * (chartH / 5)).map(
              (y) => `<line x1="24" y1="${y}" x2="${chartW - 24}" y2="${y}" stroke="#f1f5f9" stroke-width="0.5" />`
          ).join("")}
          <!-- Area under line -->
          ${pathD ? `<path d="${pathD} L ${points.length <= 1 ? 24 : chartW - 24} ${chartH - 24} L 24 ${chartH - 24} Z" fill="url(#lineGrad)" />` : ""}
          <!-- Line -->
          ${pathD ? `<path d="${pathD}" fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />` : ""}
          <!-- Dots -->
          ${points
              .map((p, i) => {
                  const step = points.length <= 1 ? chartW - 48 : (chartW - 48) / (points.length - 1);
                  const x = 24 + i * step;
                  const y = 24 + (chartH - 48) - (p.count / maxCount) * (chartH - 48);
                  return `<circle cx="${x}" cy="${y}" r="3" fill="#3b82f6" />`;
              })
              .join("")}
        </svg>
        <div class="flex justify-between mt-2 text-xs text-slate-400">
          ${points.map((p) => `<span>${esc(p.label)}</span>`).join("")}
        </div>
        `}
      </div>
    </section>

    <!-- Section 3: Mission details (compact) -->
    <section class="mb-12">
      <h2 class="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-6">Missions</h2>
      <div class="space-y-3">
        ${d.missions
            .map(
                (m) => `
        <div class="rounded-xl border border-slate-200/80 bg-slate-50/50 px-5 py-4">
          <div class="flex items-center justify-between">
            <p class="font-medium text-slate-900">${esc(m.name)}</p>
            <span class="text-xs font-medium ${m.isActive ? "text-emerald-600" : "text-slate-400"}">${m.isActive ? "Actif" : "Inactif"}</span>
          </div>
          <p class="text-xs text-slate-500 mt-1">${m.sdrCount} SDR · ${esc(m.startDate)} – ${esc(m.endDate)}</p>
          ${m.objective ? `<p class="text-xs text-slate-500 mt-2 line-clamp-2">${esc(m.objective.slice(0, 120))}${m.objective.length > 120 ? "…" : ""}</p>` : ""}
        </div>
        `
            )
            .join("")}
      </div>
    </section>

    <!-- Footer -->
    <footer class="pt-8 border-t border-slate-200">
      <p class="text-xs text-slate-400">${brand.name} · Rapport d'activité</p>
    </footer>
  </div>
</body>
</html>`;
}
