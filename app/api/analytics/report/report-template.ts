/** Self-contained HTML used by Chromium to render the analytics PDF. */

export interface AnalyticsReportTemplateData {
    missionLabel: string;
    periodLabel: string;
    kpis: {
        totalCalls: number;
        meetings: number;
        conversionRate: number;
        totalTalkTime: number;
        noResponse: number;
        callbacks: number;
    };
    statusBreakdown: Record<string, number>;
    sdrPerformance: Array<{ sdrName: string; calls: number; meetings: number; callbacks: number }>;
    aiSummary: string;
}

function esc(value: unknown): string {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function statusLabel(status: string): string {
    return status.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getAnalyticsReportHtml(data: AnalyticsReportTemplateData): string {
    const k = data.kpis;
    const talkMinutes = Math.round(k.totalTalkTime / 60);
    const statuses = Object.entries(data.statusBreakdown).sort(([, a], [, b]) => b - a).slice(0, 8);
    const generatedAt = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

    return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Stats commerciales - ${esc(data.missionLabel)}</title>
  <style>
    @page { size: A4; margin: 14mm 13mm 16mm; }
    :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; background: #fff; font-size: 10.5pt; line-height: 1.45; }
    .page { max-width: 780px; margin: 0 auto; }
    .brand { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 2px solid #7c5cfc; }
    .eyebrow { margin: 0 0 6px; color: #7c5cfc; font-size: 8pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0; color: #111827; font-size: 24pt; line-height: 1.05; letter-spacing: -.04em; }
    .period { margin: 8px 0 0; color: #667085; font-size: 10pt; }
    .meta { color: #98a2b3; font-size: 8.5pt; text-align: right; }
    .section { margin-top: 24px; page-break-inside: avoid; }
    .section-title { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; color: #344054; font-size: 9pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    .section-title::before { content: ""; width: 4px; height: 14px; border-radius: 2px; background: #7c5cfc; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; }
    .kpi { min-height: 78px; padding: 13px; border: 1px solid #e4e7ec; border-radius: 9px; background: #f8f9fc; }
    .kpi-value { color: #111827; font-size: 20pt; font-weight: 700; letter-spacing: -.03em; }
    .kpi-value.green { color: #039855; }
    .kpi-value.purple { color: #6941c6; }
    .kpi-label { margin-top: 3px; color: #667085; font-size: 8.5pt; }
    .grid { display: grid; grid-template-columns: 1.35fr .95fr; gap: 18px; align-items: start; }
    .panel { overflow: hidden; border: 1px solid #e4e7ec; border-radius: 9px; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 9px 11px; color: #667085; background: #f8f9fc; font-size: 7.5pt; font-weight: 700; letter-spacing: .08em; text-align: left; text-transform: uppercase; }
    td { padding: 9px 11px; border-top: 1px solid #f0f2f5; color: #344054; }
    td.number, th.number { text-align: right; font-variant-numeric: tabular-nums; }
    td.name { color: #101828; font-weight: 700; }
    td.accent { color: #039855; font-weight: 700; }
    .insight { padding: 14px 16px; border: 1px solid #ddd6fe; border-radius: 9px; background: #f7f5ff; color: #4c1d95; }
    .insight p { margin: 0; }
    .empty { padding: 18px; color: #98a2b3; text-align: center; }
    footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e4e7ec; color: #98a2b3; font-size: 8pt; }
    @media print { .section { break-inside: avoid; } .panel, .kpi, .insight { break-inside: avoid; } }
  </style>
</head>
<body>
  <main class="page">
    <header class="brand">
      <div>
        <p class="eyebrow">CaptainProspect · Export statistiques</p>
        <h1>${esc(data.missionLabel)}</h1>
        <p class="period">${esc(data.periodLabel)}</p>
      </div>
      <div class="meta">Généré le<br /><strong>${esc(generatedAt)}</strong></div>
    </header>

    <section class="section">
      <h2 class="section-title">Vue d'ensemble</h2>
      <div class="kpis">
        <div class="kpi"><div class="kpi-value">${k.totalCalls}</div><div class="kpi-label">Appels</div></div>
        <div class="kpi"><div class="kpi-value green">${k.meetings}</div><div class="kpi-label">RDV obtenus</div></div>
        <div class="kpi"><div class="kpi-value purple">${k.conversionRate}%</div><div class="kpi-label">Taux de conversion</div></div>
        <div class="kpi"><div class="kpi-value">${talkMinutes} min</div><div class="kpi-label">Temps de conversation</div></div>
      </div>
    </section>

    <section class="section grid">
      <div>
        <h2 class="section-title">Performance par SDR</h2>
        <div class="panel">
          ${data.sdrPerformance.length ? `<table><thead><tr><th>SDR</th><th class="number">Appels</th><th class="number">Rappels</th><th class="number">RDV</th></tr></thead><tbody>${data.sdrPerformance.slice(0, 10).map((s) => `<tr><td class="name">${esc(s.sdrName)}</td><td class="number">${s.calls}</td><td class="number">${s.callbacks}</td><td class="number accent">${s.meetings}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">Aucune donnée SDR sur cette période.</div>'}
        </div>
      </div>
      <div>
        <h2 class="section-title">Répartition des résultats</h2>
        <div class="panel">
          ${statuses.length ? `<table><tbody>${statuses.map(([status, count]) => `<tr><td>${esc(statusLabel(status))}</td><td class="number"><strong>${count}</strong></td></tr>`).join("")}</tbody></table>` : '<div class="empty">Aucun résultat enregistré.</div>'}
        </div>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Synthèse</h2>
      <div class="insight"><p>${esc(data.aiSummary)}</p></div>
    </section>

    <footer>Document exporté depuis CaptainProspect · ${k.noResponse} sans réponse · ${k.callbacks} rappels ou intéressés</footer>
  </main>
</body>
</html>`;
}
