import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
    normalizeCompanyName,
    resolveCompanyMatches,
    type DuplicateScope,
} from "@/lib/import/dedup";

// ============================================
// Pre-import simulation: given the (deduped) company names found in a CSV, reports
// how many are new vs. already-existing vs. already-worked, against the real DB —
// using the exact same matching function the real import route uses, so the numbers
// shown before import can never disagree with what actually happens during import.
// Lightweight by design: takes normalized names only, not the whole file.
// ============================================

const MAX_NAMES = 20000;
const SAMPLE_SIZE = 50;

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== "MANAGER") {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }

        const body = await req.json().catch(() => null);
        if (!body || !Array.isArray(body.companyNames)) {
            return NextResponse.json(
                { success: false, error: "companyNames (string[]) requis" },
                { status: 400 }
            );
        }

        const listIdParam = typeof body.listId === "string" ? body.listId.trim() : "";
        const missionIdParam = typeof body.missionId === "string" ? body.missionId.trim() : "";
        const scope: DuplicateScope = body.duplicateScope === "mission" ? "mission" : "list";

        const companyNames: string[] = body.companyNames
            .filter((n: unknown): n is string => typeof n === "string" && n.trim().length > 0)
            .slice(0, MAX_NAMES);

        if (companyNames.length === 0) {
            return NextResponse.json({
                success: true,
                data: { newCompanies: 0, existingCompanies: 0, alreadyWorked: 0, sampleMatches: [] },
            });
        }

        let listId = listIdParam;
        let missionId = missionIdParam || null;

        if (listId) {
            const list = await prisma.list.findUnique({
                where: { id: listId },
                select: { id: true, missionId: true },
            });
            if (!list) {
                return NextResponse.json({ success: false, error: "Liste non trouvée" }, { status: 404 });
            }
            missionId = list.missionId;
        } else if (missionId) {
            // Creating a new list: there's no listId yet, so "same list" has no matches —
            // resolveCompanyMatches still needs *a* listId to exclude from the mission-wide
            // query; passing an id that can't match anything ("") keeps the query well-formed.
            listId = "";
        } else {
            return NextResponse.json(
                { success: false, error: "listId ou missionId requis" },
                { status: 400 }
            );
        }

        const uniqueNormalized = [...new Set(companyNames.map((n) => normalizeCompanyName(n)))];
        const originalByNormalized = new Map<string, string>();
        for (const n of companyNames) {
            const key = normalizeCompanyName(n);
            if (!originalByNormalized.has(key)) originalByNormalized.set(key, n);
        }

        const matches = await resolveCompanyMatches({
            listId,
            missionId,
            scope,
            normalizedNames: uniqueNormalized,
        });

        let alreadyWorked = 0;
        for (const match of matches.values()) {
            if (match.hasActions) alreadyWorked++;
        }

        const matchedListIds = [...new Set([...matches.values()].map((m) => m.listId))];
        const listNames = matchedListIds.length
            ? await prisma.list.findMany({
                  where: { id: { in: matchedListIds } },
                  select: { id: true, name: true },
              })
            : [];
        const listNameById = new Map(listNames.map((l) => [l.id, l.name]));

        const sampleMatches = [...matches.entries()]
            .slice(0, SAMPLE_SIZE)
            .map(([key, match]) => ({
                csvName: originalByNormalized.get(key) ?? match.name,
                matchedCompanyId: match.id,
                listName: listNameById.get(match.listId) ?? null,
                crossList: match.crossList,
                alreadyWorked: match.hasActions,
            }));

        return NextResponse.json({
            success: true,
            data: {
                newCompanies: uniqueNormalized.length - matches.size,
                existingCompanies: matches.size,
                alreadyWorked,
                sampleMatches,
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Erreur lors de la simulation";
        console.error("Import simulation error:", error);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
