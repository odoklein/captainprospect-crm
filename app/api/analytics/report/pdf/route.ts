import { NextRequest, NextResponse } from "next/server";
import {
    requireRole,
    withErrorHandler,
} from "@/lib/api-utils";
import { getChromiumExecutablePath } from "@/lib/pdf-chromium";
import { getAnalyticsReportData } from "../get-report-data";
import { getAnalyticsReportHtml } from "../report-template";

// ============================================
// GET /api/analytics/report/pdf
// Query: from, to, missionIds[]?, sdrIds[]?, clientIds[]?
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER", "DEVELOPER"], request);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from")?.trim();
    const to = searchParams.get("to")?.trim();
    const missionIds = searchParams.getAll("missionIds[]");
    const sdrIds = searchParams.getAll("sdrIds[]");
    const clientIds = searchParams.getAll("clientIds[]");
    const listIds = searchParams.getAll("listIds[]");

    if (!from || !to) {
        return NextResponse.json(
            { success: false, error: "from et to sont requis" },
            { status: 400 }
        );
    }

    const dateFrom = new Date(from);
    const dateTo = new Date(to);
    dateFrom.setHours(0, 0, 0, 0);
    dateTo.setHours(23, 59, 59, 999);

    if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime())) {
        return NextResponse.json(
            { success: false, error: "Dates invalides" },
            { status: 400 }
        );
    }

    if (dateFrom > dateTo) {
        return NextResponse.json(
            { success: false, error: "La date de début doit être avant la date de fin" },
            { status: 400 }
        );
    }

    const raw = await getAnalyticsReportData({
        from,
        to,
        missionIds,
        sdrIds,
        clientIds,
        listIds,
    });

    // Keep export fast and reliable: the PDF should not wait on an external AI request.
    const topSdr = raw.sdrPerformance[0];
    const aiSummary = raw.kpis.totalCalls === 0
        ? "Aucune activité d'appel sur la période sélectionnée."
        : `${raw.kpis.meetings} rendez-vous obtenus sur ${raw.kpis.totalCalls} appels, soit un taux de conversion de ${raw.kpis.conversionRate}%.${topSdr ? ` ${topSdr.sdrName} arrive en tête avec ${topSdr.meetings} rendez-vous.` : ""}`;

    const templateData = {
        ...raw,
        aiSummary,
    };
    const html = getAnalyticsReportHtml(templateData);

    const isVercel = !!process.env.VERCEL;
    const puppeteer = isVercel ? await import("puppeteer-core") : await import("puppeteer");
    const chromium = isVercel ? (await import("@sparticuz/chromium-min")).default : null;
    const executablePath = isVercel
        ? await getChromiumExecutablePath()
        : process.env.PUPPETEER_EXECUTABLE_PATH;
    const browser = await puppeteer.default.launch({
        headless: true,
        args: isVercel ? chromium!.args : ["--no-sandbox", "--disable-setuid-sandbox"],
        executablePath,
    });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
        });
        const filename = `rapport-analytics-${from}-${to}.pdf`;
        const buffer = Buffer.from(pdfBuffer);

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Content-Length": String(buffer.length),
            },
        });
    } finally {
        await browser.close();
    }
});
