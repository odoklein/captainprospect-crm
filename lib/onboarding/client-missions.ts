import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/api-utils";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";
import { missionBriefData, missionBriefSchema, withTerritoryGeography } from "./self-service-schema";

/** Resolve the current account from the DB; never trust a posted clientId or a stale JWT. */
export async function requireClientSpace(userId: string, db = prisma) {
    const user = await db.user.findUnique({
        where: { id: userId },
        select: { role: true, isActive: true, client: { select: { id: true, name: true, status: true, archivedAt: true } } },
    });
    if (!user || user.role !== "CLIENT" || !user.isActive || !user.client || user.client.archivedAt || user.client.status === "STOPPED") {
        throw new AuthError("Votre espace client n’est pas disponible. Contactez l’agence.", 403);
    }
    return user.client;
}

export const clientMissionSelect = {
    id: true, name: true, objective: true, channels: true, status: true, isActive: true,
    startDate: true, endDate: true, targetMeetings: true, playbook: true, createdAt: true,
} satisfies Prisma.MissionSelect;

type SelectedMission = Prisma.MissionGetPayload<{ select: typeof clientMissionSelect }>;

export function clientMissionView(mission: SelectedMission) {
    const { playbook, ...safe } = mission;
    const data = playbook && typeof playbook === "object" && !Array.isArray(playbook) ? playbook : {};
    const brief = missionBriefSchema.safeParse(data.clientBrief);
    return { ...safe, brief: brief.success ? brief.data : null };
}

/** One of the client's own missions (portal-visible), or a 404. */
export async function getClientMission(userId: string, missionId: string, db = prisma) {
    const client = await requireClientSpace(userId, db);
    const mission = await db.mission.findFirst({ where: { id: missionId, clientId: client.id, ...portalVisibleMissionWhere() }, select: clientMissionSelect });
    if (!mission) throw new AuthError("Mission introuvable.", 404);
    return clientMissionView(mission);
}

export async function saveClientMission(userId: string, raw: unknown, missionId?: string, db = prisma) {
    const client = await requireClientSpace(userId, db);
    const input = withTerritoryGeography(missionBriefSchema.parse(raw));
    const fields = missionBriefData(input);
    if (!missionId) {
        const mission = await db.mission.create({
            data: { ...fields, clientId: client.id, status: "DRAFT", isActive: false, playbook: { clientBrief: input } },
            select: clientMissionSelect,
        });
        return clientMissionView(mission);
    }
    return db.$transaction(async (tx) => {
        const mission = await tx.mission.findFirst({ where: { id: missionId, clientId: client.id }, select: { playbook: true } });
        if (!mission) throw new AuthError("Mission introuvable.", 404);
        const previous = mission.playbook && typeof mission.playbook === "object" && !Array.isArray(mission.playbook) ? mission.playbook : {};
        // Include the state in the write itself: activation racing with this save
        // must not let a client overwrite a mission that the agency has launched.
        const saved = await tx.mission.updateMany({
            where: { id: missionId, clientId: client.id, status: "DRAFT", isActive: false },
            data: { ...fields, playbook: { ...previous, clientBrief: input } },
        });
        if (!saved.count) throw new AuthError("Cette mission a été prise en charge. Contactez l’agence pour la modifier.", 409);
        const updated = await tx.mission.findUniqueOrThrow({ where: { id: missionId }, select: clientMissionSelect });
        return clientMissionView(updated);
    });
}
