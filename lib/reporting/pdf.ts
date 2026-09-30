import PDFDocument from "pdfkit";
import type { ReportData, ReportMission } from "@/lib/reporting/types";

// Client report PDF. Every text call gets explicit x/y (pdfkit otherwise
// reuses the last x and width, which is how titles ended up wrapped in a
// 36pt column), and only WinAnsi characters are used so Helvetica renders
// French accents instead of dropping glyphs.

type Doc = PDFKit.PDFDocument;

const C = {
    brand: "#2B5F3E",
    brandStrong: "#1F4A2F",
    brandMid: "#6F9E80",
    brandSoft: "#E8F0EA",
    cream: "#F7F6F2",
    ink: "#0F1216",
    ink2: "#3B424A",
    ink3: "#737B85",
    ink4: "#A3AAB3",
    line: "#E6E8EB",
    white: "#FFFFFF",
    up: "#1F8A4C",
    down: "#B45309",
};

const F = { regular: "Helvetica", bold: "Helvetica-Bold" };

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const CW = PAGE.width - PAGE.margin * 2;
const LEFT = PAGE.margin;
const CONTENT_BOTTOM = PAGE.height - PAGE.margin - 18;

/* ── text & number helpers ── */

/** fr-FR uses U+202F as thousands separator, which Helvetica's WinAnsi lacks. */
function fr(n: number): string {
    return n.toLocaleString("fr-FR").replace(/ /g, " ");
}

function pct(n: number): string {
    return `${String(n).replace(".", ",")} %`;
}

function deltaLabel(value: number, unit: "%" | "pts" = "%"): string {
    const sign = value > 0 ? "+" : value < 0 ? "–" : "";
    const abs = Math.abs(value);
    return unit === "%" ? `${sign}${abs} %` : `${sign}${abs} pt${abs > 1 ? "s" : ""}`;
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MONTHS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** "09/2026" → "sept. 26" (short) or "septembre 2026" (long). */
function monthLabel(label: string, long = false): string {
    const [m, y] = label.split("/").map(Number);
    if (!m || !y) return label;
    return long ? `${MONTHS_LONG[m - 1]} ${y}` : `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

function truncate(doc: Doc, text: string, width: number): string {
    if (doc.widthOfString(text) <= width) return text;
    let out = text;
    while (out.length > 1 && doc.widthOfString(`${out}…`) > width) out = out.slice(0, -1);
    return `${out.trimEnd()}…`;
}

interface TextOpts {
    font?: string;
    size?: number;
    color?: string;
    width?: number;
    align?: "left" | "right" | "center";
    spacing?: number;
    lineGap?: number;
    opacity?: number;
}

function text(doc: Doc, value: string, x: number, y: number, o: TextOpts = {}) {
    doc.font(o.font ?? F.regular)
        .fontSize(o.size ?? 10)
        .fillColor(o.color ?? C.ink)
        .fillOpacity(o.opacity ?? 1)
        .text(value, x, y, {
            width: o.width,
            align: o.align,
            characterSpacing: o.spacing ?? 0,
            lineGap: o.lineGap ?? 0,
            lineBreak: o.width !== undefined,
        });
    doc.fillOpacity(1);
    doc.x = LEFT;
}

function measure(doc: Doc, value: string, o: TextOpts & { width: number }): number {
    return doc.font(o.font ?? F.regular).fontSize(o.size ?? 10)
        .heightOfString(value, { width: o.width, lineGap: o.lineGap ?? 0, characterSpacing: o.spacing ?? 0 });
}

function eyebrow(doc: Doc, value: string, x: number, y: number, color = C.ink3, width?: number, align?: "left" | "right") {
    text(doc, value.toUpperCase(), x, y, { font: F.bold, size: 7.5, color, spacing: 1.1, width, align });
}

function hairline(doc: Doc, y: number, x = LEFT, w = CW) {
    doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.75).strokeColor(C.line).stroke();
}

function pill(doc: Doc, value: string, x: number, y: number, o: { bg: string; fg: string; bgOpacity?: number; size?: number }) {
    const size = o.size ?? 8;
    doc.font(F.bold).fontSize(size);
    const w = doc.widthOfString(value) + 14;
    const h = size + 9;
    doc.save().fillOpacity(o.bgOpacity ?? 1).roundedRect(x, y, w, h, h / 2).fill(o.bg).restore();
    text(doc, value, x + 7, y + 4.6, { font: F.bold, size, color: o.fg });
    return w;
}

/* ── layout state ── */

class Cursor {
    y = PAGE.margin;
    constructor(private doc: Doc, private onNewPage: () => number) {}
    ensure(height: number) {
        if (this.y + height <= CONTENT_BOTTOM) return;
        this.doc.addPage();
        this.y = this.onNewPage();
    }
}

/** Compact header on continuation pages; returns where content starts. */
function drawRunningHeader(doc: Doc, data: ReportData): number {
    const y = PAGE.margin;
    doc.roundedRect(LEFT, y, 12, 12, 3).fill(C.brand);
    doc.roundedRect(LEFT + 4, y + 4, 4, 4, 1).fill(C.white);
    text(doc, `${data.clientName}  ·  Rapport d'activité`, LEFT + 20, y + 1.5, { font: F.bold, size: 9, color: C.ink2 });
    text(doc, data.periodLabel, LEFT, y + 2, { size: 8.5, color: C.ink3, width: CW, align: "right" });
    hairline(doc, y + 22);
    return y + 44;
}

function sectionTitle(doc: Doc, cur: Cursor, title: string, hint?: string) {
    cur.ensure(40);
    text(doc, title, LEFT, cur.y, { font: F.bold, size: 12, color: C.ink });
    if (hint) text(doc, hint, LEFT, cur.y + 2.5, { size: 8.5, color: C.ink3, width: CW, align: "right" });
    cur.y += 22;
}

/* ── blocks ── */

function drawTopBar(doc: Doc, cur: Cursor) {
    const y = cur.y;
    doc.roundedRect(LEFT, y, 16, 16, 4).fill(C.brand);
    doc.roundedRect(LEFT + 5, y + 5, 6, 6, 1.5).fill(C.white);
    text(doc, "Captain Prospect", LEFT + 24, y + 2.5, { font: F.bold, size: 11.5, color: C.ink });
    eyebrow(doc, "Rapport d'activité", LEFT, y + 4.5, C.ink3, CW, "right");
    cur.y = y + 30;
    hairline(doc, cur.y);
    cur.y += 28;
}

function drawTitle(doc: Doc, cur: Cursor, data: ReportData) {
    eyebrow(doc, data.periodLabel, LEFT, cur.y, C.brand);
    cur.y += 15;
    const h = measure(doc, data.clientName, { font: F.bold, size: 28, width: CW });
    text(doc, data.clientName, LEFT, cur.y, { font: F.bold, size: 28, color: C.ink, width: CW });
    cur.y += h + 6;
    const showMission = data.missionLabel.trim().toLowerCase() !== data.clientName.trim().toLowerCase();
    const sub = [showMission ? data.missionLabel : null, `Généré le ${data.generatedDate}`].filter(Boolean).join("   ·   ");
    text(doc, sub, LEFT, cur.y, { size: 10, color: C.ink3, width: CW });
    cur.y += 30;
}

function drawHero(doc: Doc, cur: Cursor, data: ReportData) {
    const H = 150;
    const y = cur.y;
    const x = LEFT;

    doc.save();
    doc.roundedRect(x, y, CW, H, 16).clip();
    doc.rect(x, y, CW, H).fill(C.brandStrong);
    // Soft brand glow, clipped to the band.
    doc.fillOpacity(0.18).circle(x + CW - 40, y + 10, 140).fill(C.brand);
    doc.fillOpacity(0.1).circle(x + CW - 120, y + H + 30, 110).fill(C.brandMid);
    doc.restore();
    doc.fillOpacity(1);

    // Left: meetings, the headline result.
    const lx = x + 28;
    eyebrow(doc, "RDV obtenus", lx, y + 26, "#BFD6C6");
    const big = fr(data.meetingsBooked);
    text(doc, big, lx, y + 42, { font: F.bold, size: 56, color: C.white });
    if (data.meetingsDelta != null) {
        const up = data.meetingsDelta >= 0;
        pill(doc, `${deltaLabel(data.meetingsDelta)} vs période précédente`, lx, y + H - 36, {
            bg: C.white,
            bgOpacity: 0.14,
            fg: up ? "#CDEFD9" : "#FFDDB8",
            size: 8,
        });
    } else {
        text(doc, "sur la période", lx, y + H - 32, { size: 9, color: "#BFD6C6" });
    }

    // Divider + right: conversion.
    const dx = x + CW * 0.52;
    doc.save().fillOpacity(0.18).rect(dx, y + 26, 0.75, H - 52).fill(C.white).restore();
    const rx = dx + 26;
    const rw = x + CW - 28 - rx;
    eyebrow(doc, "Taux de conversion", rx, y + 26, "#BFD6C6");
    text(doc, pct(data.conversionRate), rx, y + 42, { font: F.bold, size: 32, color: C.white });
    text(doc, "des contacts touchés ont obtenu un RDV", rx, y + 86, { size: 9, color: "#D6E4DA", width: rw, lineGap: 2 });
    const convDelta = data.deltas?.[3];
    if (convDelta != null) {
        pill(doc, `${deltaLabel(convDelta, "pts")} vs période précédente`, rx, y + H - 36, {
            bg: C.white,
            bgOpacity: 0.14,
            fg: convDelta >= 0 ? "#CDEFD9" : "#FFDDB8",
            size: 8,
        });
    }

    cur.y = y + H + 16;
}

function drawKpis(doc: Doc, cur: Cursor, data: ReportData) {
    const gap = 12;
    const w = (CW - gap * 2) / 3;
    const h = 88;
    const y = cur.y;
    const items: Array<{ label: string; value: string; delta: number | null | undefined; caption: string }> = [
        { label: "Contacts touchés", value: fr(data.contactsReached), delta: data.deltas?.[0], caption: "entreprises et contacts" },
        { label: "Leads qualifiés", value: fr(data.qualifiedLeads), delta: data.deltas?.[1], caption: "intérêt, rappel ou RDV" },
        { label: "Opportunités", value: fr(data.opportunities), delta: undefined, caption: "détectées sur la période" },
    ];

    items.forEach((item, i) => {
        const x = LEFT + i * (w + gap);
        doc.roundedRect(x, y, w, h, 12).lineWidth(0.75).fillAndStroke(C.white, C.line);
        eyebrow(doc, item.label, x + 16, y + 16);
        text(doc, item.value, x + 16, y + 32, { font: F.bold, size: 24, color: C.ink });
        if (item.delta != null) {
            const label = deltaLabel(item.delta);
            text(doc, label, x + 16, y + h - 22, { font: F.bold, size: 8.5, color: item.delta >= 0 ? C.up : C.down });
            doc.font(F.bold).fontSize(8.5);
            const lw = doc.widthOfString(label);
            text(doc, "vs période précédente", x + 16 + lw + 5, y + h - 22, { size: 8.5, color: C.ink4 });
        } else {
            text(doc, item.caption, x + 16, y + h - 22, { size: 8.5, color: C.ink4 });
        }
    });

    cur.y = y + h + 30;
}

function drawChart(doc: Doc, cur: Cursor, periods: ReportData["meetingsByPeriod"]) {
    const rows = periods.slice(-12);
    const total = rows.reduce((n, r) => n + r.count, 0);
    sectionTitle(doc, cur, "Évolution des RDV", `${fr(total)} RDV sur ${rows.length} mois`);

    const chartH = 120;
    cur.ensure(chartH + 30);
    const top = cur.y + 14;
    const base = top + chartH;
    const max = Math.max(1, ...rows.map((r) => r.count));

    // Guides at 50% and 100% of the best month.
    for (const f of [0.5, 1]) {
        const gy = base - chartH * f;
        doc.save().dash(2, { space: 3 }).moveTo(LEFT, gy).lineTo(LEFT + CW, gy).lineWidth(0.5).strokeColor(C.line).stroke().undash().restore();
    }
    hairline(doc, base);

    const slot = CW / rows.length;
    const barW = Math.min(34, slot * 0.56);
    rows.forEach((r, i) => {
        const cx = LEFT + slot * i + slot / 2;
        const h = Math.max(2, (r.count / max) * chartH);
        const isLast = i === rows.length - 1;
        doc.roundedRect(cx - barW / 2, base - h, barW, h, Math.min(5, barW / 3)).fill(isLast ? C.brand : C.brandMid);
        text(doc, fr(r.count), cx - 30, base - h - 13, { font: F.bold, size: 8.5, color: C.ink2, width: 60, align: "center" });
        text(doc, monthLabel(r.label), cx - 30, base + 7, { size: 7.5, color: C.ink3, width: 60, align: "center" });
    });

    cur.y = base + 36;
}

function buildInsights(data: ReportData): string[] {
    const out: string[] = [];
    if (data.meetingsDelta != null && data.meetingsDelta !== 0) {
        out.push(data.meetingsDelta > 0
            ? `Les RDV obtenus progressent de ${data.meetingsDelta} % par rapport à la période précédente.`
            : `Les RDV obtenus reculent de ${Math.abs(data.meetingsDelta)} % par rapport à la période précédente.`);
    }
    if (data.meetingsByPeriod.length > 1) {
        const best = data.meetingsByPeriod.reduce((b, c) => (c.count > b.count ? c : b));
        out.push(`Meilleur mois de la période : ${monthLabel(best.label, true)}, avec ${fr(best.count)} RDV.`);
    }
    // The conversion rate is already the hero figure; say what it means instead.
    if (data.meetingsBooked > 0 && data.contactsReached > 0) {
        const perMeeting = Math.max(1, Math.round(data.contactsReached / data.meetingsBooked));
        out.push(`En moyenne, un RDV obtenu pour ${fr(perMeeting)} contacts touchés.`);
    }
    if (data.qualifiedLeads > 0 && data.contactsReached > 0) {
        const q = Math.round((data.qualifiedLeads / data.contactsReached) * 1000) / 10;
        out.push(`${fr(data.qualifiedLeads)} leads qualifiés (intérêt, rappel ou RDV), soit ${pct(q)} des contacts touchés.`);
    }
    if (data.opportunities > 0) {
        out.push(`${fr(data.opportunities)} opportunité${data.opportunities > 1 ? "s" : ""} identifiée${data.opportunities > 1 ? "s" : ""} sur la période.`);
    }
    if (data.missions.length > 1) {
        const active = data.missions.filter((m) => m.isActive).length;
        out.push(`${active} mission${active > 1 ? "s" : ""} active${active > 1 ? "s" : ""} sur ${data.missions.length} contribuent à ce rapport.`);
    }
    if (out.length === 0) out.push("Aucune activité enregistrée sur la période sélectionnée.");
    return out.slice(0, 4);
}

function drawInsights(doc: Doc, cur: Cursor, data: ReportData) {
    const items = buildInsights(data);
    const pad = 20;
    const textW = CW - pad * 2 - 16;
    const heights = items.map((i) => measure(doc, i, { size: 10, width: textW, lineGap: 2.5 }));
    const h = pad + 22 + heights.reduce((a, b) => a + b + 10, 0) + pad - 10;
    cur.ensure(h + 24);

    const y = cur.y;
    doc.roundedRect(LEFT, y, CW, h, 12).fill(C.cream);
    doc.roundedRect(LEFT, y + 14, 3, h - 28, 1.5).fill(C.brand);
    text(doc, "Points clés", LEFT + pad, y + pad, { font: F.bold, size: 12, color: C.ink });

    let iy = y + pad + 24;
    items.forEach((item, i) => {
        doc.circle(LEFT + pad + 3, iy + 5, 2.6).fill(C.brand);
        text(doc, item, LEFT + pad + 16, iy, { size: 10, color: C.ink2, width: textW, lineGap: 2.5 });
        iy += heights[i] + 10;
    });

    cur.y = y + h + 30;
}

function drawMissions(doc: Doc, cur: Cursor, missions: ReportMission[]) {
    sectionTitle(doc, cur, "Missions", `${missions.length} mission${missions.length > 1 ? "s" : ""}`);
    if (missions.length === 0) {
        text(doc, "Aucune mission sur la période sélectionnée.", LEFT, cur.y, { size: 10, color: C.ink3 });
        cur.y += 20;
        return;
    }

    const cols = { name: LEFT, status: LEFT + CW * 0.5, period: LEFT + CW * 0.64, team: LEFT + CW * 0.9 };
    const headerY = cur.y;
    eyebrow(doc, "Mission", cols.name, headerY);
    eyebrow(doc, "Statut", cols.status, headerY);
    eyebrow(doc, "Période", cols.period, headerY);
    eyebrow(doc, "Équipe", LEFT, headerY, C.ink3, CW, "right");
    cur.y = headerY + 14;
    hairline(doc, cur.y);

    for (const m of missions) {
        const rowH = m.objective ? 42 : 30;
        cur.ensure(rowH);
        const y = cur.y;
        doc.font(F.bold).fontSize(10);
        text(doc, truncate(doc, m.name, CW * 0.47), cols.name, y + 10, { font: F.bold, size: 10, color: C.ink });
        if (m.objective) {
            doc.font(F.regular).fontSize(8.5);
            text(doc, truncate(doc, m.objective, CW * 0.47), cols.name, y + 25, { size: 8.5, color: C.ink3 });
        }
        pill(doc, m.isActive ? "Active" : "Terminée", cols.status, y + 8, {
            bg: m.isActive ? C.brandSoft : "#EEF0F2",
            fg: m.isActive ? C.brand : C.ink3,
            size: 7.5,
        });
        text(doc, `${m.startDate} – ${m.endDate}`, cols.period, y + 10, { size: 9, color: C.ink2 });
        text(doc, `${m.sdrCount} SDR`, LEFT, y + 10, { size: 9, color: C.ink2, width: CW, align: "right" });
        cur.y = y + rowH;
        hairline(doc, cur.y);
    }
    cur.y += 20;
}

function drawFooters(doc: Doc, data: ReportData) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        // Writing below the bottom margin would make pdfkit open a new page.
        const bottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        const y = PAGE.height - 34;
        hairline(doc, y - 10);
        text(doc, `Captain Prospect  ·  Rapport d'activité ${data.clientName}`, LEFT, y, { size: 7.5, color: C.ink4 });
        text(doc, `${i + 1} / ${range.count}`, LEFT, y, { size: 7.5, color: C.ink4, width: CW, align: "right" });
        doc.page.margins.bottom = bottom;
    }
}

function collectPdfBuffer(doc: Doc): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
    });
}

export async function generateClientReportPdf(data: ReportData): Promise<Buffer> {
    const doc = new PDFDocument({
        size: "A4",
        margins: { top: PAGE.margin, right: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin },
        bufferPages: true,
        info: {
            Title: `Rapport d'activité - ${data.clientName}`,
            Author: "Captain Prospect",
            Creator: "Captain Prospect",
        },
    });
    const done = collectPdfBuffer(doc);
    const cur = new Cursor(doc, () => drawRunningHeader(doc, data));

    drawTopBar(doc, cur);
    drawTitle(doc, cur, data);
    drawHero(doc, cur, data);
    drawKpis(doc, cur, data);
    if (data.meetingsByPeriod.length > 1) drawChart(doc, cur, data.meetingsByPeriod);
    drawInsights(doc, cur, data);
    drawMissions(doc, cur, data.missions);
    drawFooters(doc, data);

    doc.end();
    return done;
}
