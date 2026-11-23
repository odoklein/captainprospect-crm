import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findLiveCallbacks, type CallbackScope } from "@/lib/callbacks/pending";
import { getSdrMissionScope } from "@/lib/sdr-today-missions";

// ============================================
// GET /api/sdr/callbacks
// Fetch pending callbacks for the current SDR or BD.
// BD sees callbacks by mission (campaign.missionId), not by SDR assignment:
// if an SDR is reassigned/removed, their past callbacks remain visible to BD
// because they are tied to the mission.
// An SDR sees only their own callbacks unless `includeOthers=true` ("Voir les
// rappels des autres"), which adds teammates' callbacks on the SDR's missions.
// ============================================

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: "Non autorisé" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        // 0 or omitted = no limit (return all); otherwise cap at 50k for safety
        const limitParam = searchParams.get("limit");
        const limit =
            limitParam === null || limitParam === "" || limitParam === "0"
                ? 0
                : Math.min(Math.max(1, parseInt(limitParam, 10) || 0), 50_000);
        const skip = Math.max(0, parseInt(searchParams.get("skip") || "0", 10));
        const missionIdParam = searchParams.get("missionId") || undefined;
        const listIdParam = searchParams.get("listId") || undefined;
        const dateFromParam = searchParams.get("dateFrom") || undefined;
        const dateToParam = searchParams.get("dateTo") || undefined;
        const includeOthers = searchParams.get("includeOthers") === "true";
        // Dashboard: hide callbacks of missions the SDR is not planned on today.
        const plannedTodayOnly = searchParams.get("plannedToday") === "true";

        const userRole = (session.user as { role?: string }).role;
        const isBusinessDeveloper = userRole === "BUSINESS_DEVELOPER";
        const isBooker = userRole === "BOOKER";

        // Missions assigned to current user (for SDR/BD). Bookers see all missions.
        const assignedMissionIds = isBooker
            ? []
            : (
                  await prisma.sDRAssignment.findMany({
                      where: { sdrId: session.user.id },
                      select: { missionId: true },
                  })
              ).map((a) => a.missionId);

        // Missions where current user is team lead (can see all teammates' callbacks)
        const teamLeadMissions = await prisma.mission.findMany({
            where: { teamLeadSdrId: session.user.id },
            select: { id: true },
        });
        const teamLeadMissionIds = teamLeadMissions.map((m) => m.id);

        // Who and which missions — see lib/callbacks/pending.ts for what "pending" means.
        const scope: CallbackScope = {};
        const empty = () => NextResponse.json({
            success: true,
            data: [],
            pagination: { limit: limit || null, skip, hasMore: false },
        });

        if (isBusinessDeveloper) {
            if (assignedMissionIds.length === 0) return empty();
            scope.missionIds = missionIdParam && assignedMissionIds.includes(missionIdParam)
                ? [missionIdParam]
                : assignedMissionIds;
        } else if (!isBooker) {
            if (includeOthers) {
                // Teammates' callbacks, limited to missions this SDR works on: assigned,
                // team-lead, or planned today (the missions the page's filter offers).
                const allowedMissionIds = [...new Set([
                    ...assignedMissionIds,
                    ...teamLeadMissionIds,
                    ...(await getSdrMissionScope(session.user.id)),
                ])];
                const scopedMissionIds = missionIdParam
                    ? allowedMissionIds.filter((id) => id === missionIdParam)
                    : allowedMissionIds;
                if (scopedMissionIds.length === 0) return empty();
                scope.missionIds = scopedMissionIds;
            } else {
                // Default: the SDR's own callbacks, plus orphaned callbacks (author
                // removed from the mission or disabled) on missions they are assigned to.
                scope.sdrIds = [session.user.id];
                scope.orphanMissionIds = assignedMissionIds;
                if (plannedTodayOnly) {
                    const plannedIds = await getSdrMissionScope(session.user.id);
                    const scopedIds = missionIdParam
                        ? plannedIds.filter((id) => id === missionIdParam)
                        : plannedIds;
                    if (scopedIds.length === 0) return empty();
                    scope.missionIds = scopedIds;
                } else if (missionIdParam) {
                    scope.missionIds = [missionIdParam];
                }
            }
        } else if (missionIdParam) {
            // Booker: every mission, optionally one.
            scope.missionIds = [missionIdParam];
        }

        if (dateFromParam) scope.dateFrom = new Date(dateFromParam);
        if (dateToParam) scope.dateTo = new Date(dateToParam);
        if (listIdParam) scope.listId = listIdParam;

        const live = await findLiveCallbacks(scope);
        const page = limit > 0 ? live.slice(skip, skip + limit) : live.slice(skip);
        if (page.length === 0) return empty();
        const liveById = new Map(page.map((r) => [r.id, r]));

        // Name whose callback it is whenever the list can hold someone else's.
        const showSdrName = true;

        const fetched = await prisma.action.findMany({
            where: { id: { in: page.map((r) => r.id) } },
            include: {
                sdr: showSdrName
                    ? { select: { id: true, name: true } }
                    : false,
                contact: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        title: true,
                        phone: true,
                        email: true,
                        company: {
                            select: {
                                id: true,
                                name: true,
                            }
                        }
                    }
                },
                company: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                    }
                },
                campaign: {
                    select: {
                        id: true,
                        name: true,
                        mission: {
                            select: {
                                id: true,
                                name: true,
                                channel: true,
                                client: {
                                    select: {
                                        name: true
                                    }
                                }
                            }
                        }
                    }
                }
            },
        });
        const order = new Map(page.map((r, i) => [r.id, i]));
        const callbacks = fetched.sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));

        type CallbackItem = {
            id: string;
            campaignId: string;
            channel: string;
            result: string;
            createdAt: Date;
            callbackDate: Date | null;
            note: string | null;
            contact: typeof callbacks[0]["contact"];
            company: typeof callbacks[0]["company"];
            mission: { id: string; name: string; client: { name: string } } | null;
            sdr?: { id: string; name: string | null };
            orphan: boolean;
        };
        const activeCallbacks: CallbackItem[] = [];

        for (const action of callbacks) {
            const item: CallbackItem = {
                id: action.id,
                campaignId: action.campaignId,
                channel: (action.campaign?.mission as { channel?: string })?.channel ?? "CALL",
                result: action.result,
                orphan: liveById.get(action.id)?.orphan ?? false,
                createdAt: action.createdAt,
                callbackDate: action.callbackDate,
                note: action.note,
                contact: action.contact,
                company: action.company,
                mission: action.campaign?.mission ? {
                    id: action.campaign.mission.id || action.campaignId,
                    name: action.campaign.mission.name,
                    client: action.campaign.mission.client,
                } : null,
            };
            if (showSdrName && action.sdr) {
                item.sdr = { id: action.sdr.id, name: action.sdr.name };
            }
            activeCallbacks.push(item);
        }

        return NextResponse.json({
            success: true,
            data: activeCallbacks,
            pagination: { limit: limit || null, skip, total: live.length, hasMore: limit > 0 ? skip + limit < live.length : false },
        });

    } catch (error) {
        console.error("Error fetching SDR callbacks:", error);
        return NextResponse.json(
            { success: false, error: "Erreur serveur" },
            { status: 500 }
        );
    }
}
