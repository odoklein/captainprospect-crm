import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SDR_VISIBLE_MISSION_STATUSES } from "@/lib/constants/missionStatus";
import { getTodaySdrMissionIds } from "@/lib/sdr-today-missions";

// ============================================
// GET /api/sdr/missions
// Fetch missions assigned to current SDR
// ============================================

export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: "Non autorisé" },
                { status: 401 }
            );
        }

        const role = session.user.role;
        if (role !== "SDR" && role !== "BOOKER") {
            return NextResponse.json(
                { success: false, error: "Accès non autorisé" },
                { status: 403 }
            );
        }

        const baseMissionInclude = {
            client: { select: { id: true, name: true } },
            lists: {
                select: {
                    id: true,
                    name: true,
                    _count: { select: { companies: true } },
                },
            },
            _count: { select: { campaigns: true, lists: true } },
            defaultMailbox: { select: { id: true, email: true, displayName: true } },
        } as const;

        // SDRs are strictly limited to missions in today's planning (ScheduleBlock) —
        // never other missions they happen to be assigned to but aren't working today.
        let todayMissionIds: string[] | null = null;
        if (role === "SDR") {
            todayMissionIds = await getTodaySdrMissionIds(session.user.id);
            if (todayMissionIds.length === 0) {
                return NextResponse.json({ success: true, data: [] });
            }
        }

        const missionsRaw = await prisma.mission.findMany({
            where: {
                status: { in: SDR_VISIBLE_MISSION_STATUSES },
                startDate: { lte: new Date() },
                endDate: { gte: new Date() },
                ...(todayMissionIds ? { id: { in: todayMissionIds } } : {}),
            },
            include: baseMissionInclude,
            orderBy: { createdAt: "desc" },
        });

        if (missionsRaw.length === 0) {
            return NextResponse.json({
                success: true,
                data: [],
            });
        }

        const missionIds = missionsRaw.map((mission) => mission.id);
        const [totalsRows, actionedRows] = await Promise.all([
            prisma.$queryRaw<Array<{ missionId: string; count: bigint }>>`
                SELECT
                    l."missionId" AS "missionId",
                    COUNT(*)::bigint AS count
                FROM "Contact" c
                INNER JOIN "Company" co ON co.id = c."companyId"
                INNER JOIN "List" l ON l.id = co."listId"
                WHERE l."missionId" IN (${Prisma.join(missionIds)})
                GROUP BY l."missionId"
            `,
            prisma.$queryRaw<Array<{ missionId: string; count: bigint }>>`
                SELECT
                    l."missionId" AS "missionId",
                    COUNT(DISTINCT c.id)::bigint AS count
                FROM "Contact" c
                INNER JOIN "Company" co ON co.id = c."companyId"
                INNER JOIN "List" l ON l.id = co."listId"
                WHERE l."missionId" IN (${Prisma.join(missionIds)})
                  AND EXISTS (
                    SELECT 1
                    FROM "Action" a
                    WHERE a."contactId" = c.id
                  )
                GROUP BY l."missionId"
            `,
        ]);

        const totalsByMission = new Map(totalsRows.map((row) => [row.missionId, Number(row.count)]));
        const actionedByMission = new Map(actionedRows.map((row) => [row.missionId, Number(row.count)]));

        const missions = missionsRaw.map((mission) => {
            const totalContacts = totalsByMission.get(mission.id) ?? 0;
            const actionedContacts = actionedByMission.get(mission.id) ?? 0;
            const progress = totalContacts > 0
                ? Math.round((actionedContacts / totalContacts) * 100)
                : 0;

            return {
                id: mission.id,
                name: mission.name,
                channel: mission.channel,
                client: mission.client,
                defaultMailboxId: mission.defaultMailboxId ?? null,
                progress,
                contactsRemaining: totalContacts - actionedContacts,
                _count: mission._count,
                lists: mission.lists.map((l) => ({ id: l.id, name: l.name })), // Include lists for import modal
            };
        });

        return NextResponse.json({
            success: true,
            data: missions,
        });
    } catch (error) {
        console.error("Error fetching SDR missions:", error);
        return NextResponse.json(
            { success: false, error: "Erreur serveur" },
            { status: 500 }
        );
    }
}
