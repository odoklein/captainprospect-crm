import { NextRequest, NextResponse } from "next/server";
import { requireRole, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

// ============================================
// GET /api/users/[id]/sdr-report
// Query: from, to (YYYY-MM-DD)
// Returns: calls per mission, comments analysis, RDV stats
// ============================================

export const GET = withErrorHandler(async (request: NextRequest, { params }: { params: { id: string } }) => {
    await requireRole(["MANAGER", "DEVELOPER"], request);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from")?.trim();
    const to = searchParams.get("to")?.trim();

    if (!from || !to) {
        return NextResponse.json({ success: false, error: "Les paramètres from et to sont requis" }, { status: 400 });
    }

    const dateFrom = new Date(from);
    const dateTo = new Date(to);
    dateFrom.setHours(0, 0, 0, 0);
    dateTo.setHours(23, 59, 59, 999);

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime()) || dateFrom > dateTo) {
        return NextResponse.json({ success: false, error: "Dates invalides" }, { status: 400 });
    }

    const sdrId = params.id;

    // Verify user exists and is SDR/BOOKER
    const user = await prisma.user.findUnique({
        where: { id: sdrId },
        select: { id: true, name: true, role: true },
    });
    if (!user) {
        return NextResponse.json({ success: false, error: "Utilisateur introuvable" }, { status: 404 });
    }

    // Fetch all actions for this SDR in the date range
    const actions = await prisma.action.findMany({
        where: {
            sdrId,
            createdAt: { gte: dateFrom, lte: dateTo },
        },
        select: {
            id: true,
            channel: true,
            result: true,
            note: true,
            callSummary: true,
            duration: true,
            createdAt: true,
            callbackDate: true,
            campaign: {
                select: {
                    id: true,
                    name: true,
                    mission: {
                        select: {
                            id: true,
                            name: true,
                            client: { select: { name: true } },
                        },
                    },
                },
            },
        },
        orderBy: { createdAt: "asc" },
    });

    // Group by mission
    const missionMap = new Map<string, {
        missionId: string;
        missionName: string;
        clientName: string | null;
        calls: number;
        emails: number;
        linkedin: number;
        rdv: number;
        callbacks: number;
        interested: number;
        noResponse: number;
        otherResults: number;
        totalDuration: number;
        notes: string[];
    }>();

    let totalCalls = 0;
    let totalRdv = 0;
    let totalCallbacks = 0;
    let totalInterested = 0;
    let totalNoResponse = 0;
    let totalDuration = 0;
    const allNotes: { note: string; result: string }[] = [];

    for (const action of actions) {
        const mission = action.campaign?.mission;
        const missionId = mission?.id ?? "__no_mission__";
        const missionName = mission?.name ?? "Mission inconnue";
        const clientName = mission?.client?.name ?? null;

        if (!missionMap.has(missionId)) {
            missionMap.set(missionId, {
                missionId,
                missionName,
                clientName,
                calls: 0,
                emails: 0,
                linkedin: 0,
                rdv: 0,
                callbacks: 0,
                interested: 0,
                noResponse: 0,
                otherResults: 0,
                totalDuration: 0,
                notes: [],
            });
        }

        const m = missionMap.get(missionId)!;

        // Channel counts
        if (action.channel === "CALL") { m.calls++; totalCalls++; }
        else if (action.channel === "EMAIL") m.emails++;
        else if (action.channel === "LINKEDIN") m.linkedin++;

        // Result counts
        if (action.result === "MEETING_BOOKED") { m.rdv++; totalRdv++; }
        else if (action.result === "CALLBACK_REQUESTED") { m.callbacks++; totalCallbacks++; }
        else if (action.result === "INTERESTED") { m.interested++; totalInterested++; }
        else if (action.result === "NO_RESPONSE") { m.noResponse++; totalNoResponse++; }
        else { m.otherResults++; }

        // Duration
        if (action.duration) { m.totalDuration += action.duration; totalDuration += action.duration; }

        // Collect notes
        const noteText = action.note?.trim() || action.callSummary?.trim();
        if (noteText && noteText.length > 3) {
            m.notes.push(noteText);
            allNotes.push({ note: noteText, result: action.result });
        }
    }

    // Build per-mission array
    const byMission = Array.from(missionMap.values()).map((m) => ({
        missionId: m.missionId,
        missionName: m.missionName,
        clientName: m.clientName,
        calls: m.calls,
        emails: m.emails,
        linkedin: m.linkedin,
        rdv: m.rdv,
        callbacks: m.callbacks,
        interested: m.interested,
        noResponse: m.noResponse,
        otherResults: m.otherResults,
        totalDuration: m.totalDuration,
        conversionRate: m.calls > 0 ? Math.round((m.rdv / m.calls) * 10000) / 100 : 0,
        topNotes: m.notes.slice(0, 20),
    })).sort((a, b) => b.calls - a.calls);

    // Comments analysis across all missions
    const negativeResults = new Set(["NO_RESPONSE", "BAD_CONTACT", "DISQUALIFIED", "NOT_INTERESTED", "MEETING_CANCELLED"]);
    const positiveResults = new Set(["MEETING_BOOKED", "INTERESTED", "CALLBACK_REQUESTED"]);

    const painPointNotes = allNotes
        .filter((n) => negativeResults.has(n.result) && n.note.length > 5)
        .map((n) => n.note)
        .slice(0, 30);

    const positiveNotes = allNotes
        .filter((n) => positiveResults.has(n.result) && n.note.length > 5)
        .map((n) => n.note)
        .slice(0, 30);

    const allNotesFlat = allNotes.map((n) => n.note).slice(0, 50);

    // Word frequency for top themes (basic tokenization)
    const stopWords = new Set([
        "le", "la", "les", "de", "du", "des", "un", "une", "et", "en", "à", "au", "aux",
        "il", "elle", "ils", "elles", "je", "tu", "nous", "vous", "on", "se", "ne", "pas",
        "que", "qui", "ce", "ca", "ça", "est", "été", "a", "y", "par", "sur", "pour",
        "mais", "ou", "donc", "car", "ni", "or", "the", "is", "in", "of", "to", "and",
        "pas", "non", "oui", "très", "plus", "bien", "tout", "même", "fait", "fait",
        "avec", "dans", "son", "sa", "ses", "mon", "ma", "mes", "leur", "leurs",
    ]);

    const wordCount: Record<string, number> = {};
    for (const { note } of allNotes) {
        const words = note.toLowerCase().replace(/[^\w\sàâäéèêëîïôùûüç]/g, " ").split(/\s+/);
        for (const word of words) {
            if (word.length >= 4 && !stopWords.has(word)) {
                wordCount[word] = (wordCount[word] ?? 0) + 1;
            }
        }
    }
    const topKeywords = Object.entries(wordCount)
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([word, count]) => ({ word, count }));

    const conversionRate = totalCalls > 0 ? Math.round((totalRdv / totalCalls) * 10000) / 100 : 0;

    return NextResponse.json({
        success: true,
        data: {
            sdrName: user.name,
            period: { from, to },
            overview: {
                totalActions: actions.length,
                totalCalls,
                totalRdv,
                totalCallbacks,
                totalInterested,
                totalNoResponse,
                totalDuration,
                conversionRate,
            },
            byMission,
            comments: {
                total: allNotes.length,
                painPoints: painPointNotes,
                positiveSignals: positiveNotes,
                allSample: allNotesFlat,
                topKeywords,
            },
        },
    });
});
