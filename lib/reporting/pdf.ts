import PDFDocument from "pdfkit";
import type { ReportData, ReportMission } from "@/lib/reporting/types";

const COLORS = {
    paper: "#FAF9F6",
    paperRaised: "#FFFFFF",
    paperSunken: "#F4F3EE",
    brand: "#2B5F3E",
    brandStrong: "#1F4A2F",
    brandSoft: "#E6EFE8",
    ink: "#1F2A1F",
    ink2: "#2B3A2B",
    ink3: "#615F55",
    inkMuted: "#A8A69A",
    line: "#E9E4DB",
    lineStrong: "#D9D2C6",
    success: "#0F9D74",
    danger: "#B23B3B",
    warning: "#C97B2A",
};

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
    });
}

function ensureSpace(doc: PDFKit.PDFDocument, requiredHeight: number) {
    const bottomLimit = doc.page.height - doc.page.margins.bottom;
    if (doc.y + requiredHeight > bottomLimit) {
        doc.addPage();
        paintPageBackground(doc);
    }
}

function truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function formatDelta(delta: number | null | undefined, suffix = "%"): string | null {
    if (delta == null) return null;
    const sign = delta >= 0 ? "+" : "";
    return `${sign}${delta}${suffix}`;
}

function getDeltaColor(delta: number): string {
    if (delta > 0) return COLORS.success;
    if (delta < 0) return COLORS.danger;
    return COLORS.ink3;
}

function paintPageBackground(doc: PDFKit.PDFDocument) {
    const margin = 18;
    const x = margin;
    const y = margin;
    const w = doc.page.width - margin * 2;
    const h = doc.page.height - margin * 2;
    doc.roundedRect(x, y, w, h, 20).fill(COLORS.paper);
}

function buildInsights(data: ReportData): string[] {
    const insights: string[] = [];

    if (data.meetingsDelta != null) {
        insights.push(
            data.meetingsDelta >= 0
                ? `La prise de rendez-vous progresse de ${data.meetingsDelta}% par rapport a la periode precedente.`
                : `La prise de rendez-vous recule de ${Math.abs(data.meetingsDelta)}% par rapport a la periode precedente.`
        );
    }

    if (data.meetingsByPeriod.length > 0) {
        const bestPeriod = data.meetingsByPeriod.reduce((best, current) =>
            current.count > best.count ? current : best
        );
        insights.push(`Le meilleur mois observe sur la periode est ${bestPeriod.label} avec ${bestPeriod.count} RDV.`);
    }

    if (data.conversionRate >= 20) {
        insights.push(`Le taux de conversion de ${data.conversionRate}% indique une prospection efficace sur les contacts touches.`);
    } else if (data.contactsReached > 0) {
        insights.push(`Le taux de conversion reste a ${data.conversionRate}%, ce qui laisse une marge d'amelioration sur la qualification et le closing.`);
    }

    if (data.opportunities > 0) {
        insights.push(`${data.opportunities} opportunite${data.opportunities > 1 ? "s" : ""} ont ete detectee${data.opportunities > 1 ? "s" : ""}, signe d'un pipeline exploitable.`);
    }

    const activeMissions = data.missions.filter((mission) => mission.isActive).length;
    if (data.missions.length > 1) {
        insights.push(`${activeMissions} mission${activeMissions > 1 ? "s" : ""} active${activeMissions > 1 ? "s" : ""} sur ${data.missions.length} alimentent ce rapport.`);
    }

    if (insights.length === 0) {
        insights.push("Aucune tendance marquee n'a ete detectee sur la periode selectionnee.");
    }

    return insights.slice(0, 4);
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string) {
    doc.fillColor(COLORS.ink3).font("Helvetica-Bold").fontSize(9).text(title.toUpperCase(), {
        characterSpacing: 1.1,
    });
    doc.moveDown(0.35);
    const y = doc.y;
    const x = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.moveTo(x, y).lineTo(x + width, y).lineWidth(1).strokeColor(COLORS.line).stroke();
    doc.moveDown(0.55);
}

function drawHeader(doc: PDFKit.PDFDocument, data: ReportData) {
    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const headerHeight = 152;
    const badgeWidth = 112;
    const badgeHeight = 72;
    const y = doc.y;

    doc.roundedRect(left, y, width, headerHeight, 20).fill(COLORS.brandStrong);
    doc.roundedRect(left + 22, y + 18, badgeWidth, badgeHeight, 14).fill("#FFFFFF22");

    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(9).text("RAPPORT CLIENT", left + 30, y + 34, {
        width: badgeWidth - 28,
    });
    doc.fillColor("#F6F4FF").font("Helvetica").fontSize(9).text(data.periodLabel.toUpperCase(), left + 36, y + 52, {
        width: badgeWidth - 28,
    });

    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(24).text(data.missionLabel, left + 156, y + 30, {
        width: width - 176,
    });
    doc.fillColor("#E6E1FF").font("Helvetica").fontSize(10.5).text(`${data.clientName} | Genere le ${data.generatedDate}`, left + 156, y + 68, {
        width: width - 176,
    });

    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(36).text(String(data.meetingsBooked), left + 156, y + 94);
    doc.fillColor("#E6E1FF").font("Helvetica").fontSize(11).text("RDV planifies", left + 216, y + 106);

    if (data.meetingsDelta != null) {
        const deltaColor = data.meetingsDelta >= 0 ? "#BDF7E8" : "#FFD3D3";
        doc.fillColor(deltaColor)
            .font("Helvetica-Bold")
            .fontSize(10)
            .text(`${formatDelta(data.meetingsDelta) ?? ""} vs periode precedente`, left + width - 210, y + 114, {
                width: 186,
                align: "right",
            });
    }

    doc.y = y + headerHeight + 18;
}

function drawStatCard(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    value: string,
    delta?: number | null
) {
    doc.roundedRect(x, y, width, height, 14).fillAndStroke(COLORS.paperRaised, COLORS.line);
    doc.fillColor(COLORS.ink3).font("Helvetica-Bold").fontSize(9).text(title.toUpperCase(), x + 14, y + 12, {
        width: width - 28,
        characterSpacing: 0.7,
    });
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(24).text(value, x + 14, y + 34, {
        width: width - 28,
    });

    if (delta != null) {
        doc.fillColor(getDeltaColor(delta))
            .font("Helvetica-Bold")
            .fontSize(10)
            .text(formatDelta(delta) ?? "", x + 14, y + height - 22);
    }
}

function drawPipeline(doc: PDFKit.PDFDocument, data: ReportData) {
    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const cardHeight = 66;
    const gap = 10;
    const cardWidth = (width - gap * 3) / 4;
    const pipeline = [
        { label: "Contacts", value: data.contactsReached },
        { label: "Qualifies", value: data.qualifiedLeads },
        { label: "RDV", value: data.meetingsBooked },
        { label: "Opportunites", value: data.opportunities },
    ];

    for (let i = 0; i < pipeline.length; i += 1) {
        const item = pipeline[i];
        const x = left + i * (cardWidth + gap);
        const y = doc.y;
        doc.roundedRect(x, y, cardWidth, cardHeight, 12).fillAndStroke(COLORS.paperSunken, COLORS.line);
        doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(19).text(String(item.value), x + 12, y + 16, {
            width: cardWidth - 24,
        });
        doc.fillColor(COLORS.ink3).font("Helvetica").fontSize(9).text(item.label, x + 12, y + 42, {
            width: cardWidth - 24,
        });
    }
    doc.y += cardHeight + 16;
}

function drawTrendRows(doc: PDFKit.PDFDocument, periods: ReportData["meetingsByPeriod"]) {
    const rows = periods.slice(-8);
    const max = Math.max(1, ...rows.map((row) => row.count));
    const left = doc.page.margins.left;
    const totalWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const labelWidth = 74;
    const valueWidth = 36;
    const barWidth = totalWidth - labelWidth - valueWidth - 20;

    if (rows.length === 0) {
        doc.fillColor(COLORS.ink3).font("Helvetica").fontSize(10).text("Aucun RDV enregistre sur la periode selectionnee.");
        doc.moveDown(0.4);
        return;
    }

    for (const row of rows) {
        ensureSpace(doc, 26);
        const y = doc.y;
        const fillWidth = Math.max(8, (row.count / max) * barWidth);

        doc.fillColor(COLORS.ink3).font("Helvetica-Bold").fontSize(9.5).text(row.label, left, y + 6, {
            width: labelWidth,
        });
        doc.roundedRect(left + labelWidth + 8, y + 8, barWidth, 8, 4).fill(COLORS.brandSoft);
        doc.roundedRect(left + labelWidth + 8, y + 8, fillWidth, 8, 4).fill(COLORS.brand);
        doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(10).text(String(row.count), left + labelWidth + barWidth + 16, y + 4, {
            width: valueWidth,
            align: "right",
        });
        doc.y = y + 24;
    }
}

function drawMissionCard(doc: PDFKit.PDFDocument, mission: ReportMission) {
    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const objectiveText = mission.objective ? truncate(mission.objective, 180) : null;
    const bodyText = `${mission.sdrCount} SDR • ${mission.startDate} -> ${mission.endDate}`;
    const objectiveHeight = objectiveText
        ? doc.heightOfString(objectiveText, { width: width - 32, align: "left" })
        : 0;
    const cardHeight = 58 + objectiveHeight;

    ensureSpace(doc, cardHeight + 10);

    const y = doc.y;
    doc.roundedRect(left, y, width, cardHeight, 14).fillAndStroke(COLORS.paperRaised, COLORS.line);
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(11).text(mission.name, left + 16, y + 14, {
        width: width - 120,
    });
    doc.fillColor(mission.isActive ? COLORS.success : COLORS.inkMuted)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(mission.isActive ? "ACTIF" : "INACTIF", left + width - 72, y + 16, {
            width: 56,
            align: "right",
        });
    doc.fillColor(COLORS.ink3).font("Helvetica").fontSize(9).text(bodyText, left + 16, y + 34);

    if (objectiveText) {
        doc.fillColor(COLORS.ink2).font("Helvetica").fontSize(9).text(objectiveText, left + 16, y + 50, {
            width: width - 32,
        });
    }

    doc.y = y + cardHeight + 10;
}

export async function generateClientReportPdf(data: ReportData): Promise<Buffer> {
    const doc = new PDFDocument({
        size: "A4",
        margins: { top: 56, right: 48, bottom: 56, left: 48 },
        info: {
            Title: `Rapport d'activite - ${data.clientName}`,
            Author: "Captain Prospect CRM",
            Creator: "Captain Prospect CRM",
        },
    });

    const bufferPromise = collectPdfBuffer(doc);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;

    paintPageBackground(doc);
    drawHeader(doc, data);
    drawSectionTitle(doc, "Synthese executive");

    const gap = 12;
    const cardWidth = (pageWidth - gap) / 2;
    const cardHeight = 84;
    const cardsY = doc.y;

    drawStatCard(doc, left, cardsY, cardWidth, cardHeight, "Contacts touches", String(data.contactsReached), data.deltas?.[0] ?? null);
    drawStatCard(doc, left + cardWidth + gap, cardsY, cardWidth, cardHeight, "Leads qualifies", String(data.qualifiedLeads), data.deltas?.[1] ?? null);
    drawStatCard(doc, left, cardsY + cardHeight + gap, cardWidth, cardHeight, "Opportunites", String(data.opportunities), null);
    drawStatCard(
        doc,
        left + cardWidth + gap,
        cardsY + cardHeight + gap,
        cardWidth,
        cardHeight,
        "Taux de conversion",
        `${data.conversionRate}%`,
        data.deltas?.[3] ?? null
    );

    doc.y = cardsY + cardHeight * 2 + gap + 24;
    ensureSpace(doc, 100);
    drawSectionTitle(doc, "Parcours de conversion");
    drawPipeline(doc, data);

    ensureSpace(doc, 120);
    drawSectionTitle(doc, "Points cles");

    const insights = buildInsights(data);
    for (const insight of insights) {
        ensureSpace(doc, 28);
        const bulletY = doc.y + 3;
        doc.circle(left + 4, bulletY + 4, 2.5).fill(COLORS.brand);
        doc.fillColor(COLORS.ink2).font("Helvetica").fontSize(10.5).text(insight, left + 16, doc.y, {
            width: pageWidth - 16,
            lineGap: 2,
        });
        doc.moveDown(0.7);
    }

    ensureSpace(doc, 160);
    drawSectionTitle(doc, "Evolution des RDV");
    drawTrendRows(doc, data.meetingsByPeriod);
    doc.moveDown(0.4);

    ensureSpace(doc, 80);
    drawSectionTitle(doc, "Portefeuille de missions");
    if (data.missions.length === 0) {
        doc.fillColor(COLORS.ink3).font("Helvetica").fontSize(10).text("Aucune mission sur la periode selectionnee.");
    } else {
        for (const mission of data.missions) {
            drawMissionCard(doc, mission);
        }
    }

    doc.fillColor(COLORS.inkMuted).font("Helvetica").fontSize(8).text("Document genere par le moteur de reporting Captain Prospect CRM.", left, doc.page.height - 32, {
        width: pageWidth,
        align: "center",
    });

    doc.end();
    return bufferPromise;
}
