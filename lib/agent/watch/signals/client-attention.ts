/**
 * The "client needs a look" signals, shared by the assistant tool
 * `list_clients_needing_attention` and the watch rule `client_at_risk`, so
 * the chat and the agent can never disagree about who is at risk.
 *
 *   - active missions but no RDV booked in the window
 *   - contracted days per week not filled in
 *   - commercial contacts without a portal account
 *   - no active mission at all
 */

import { prisma } from "@/lib/prisma";

export interface ClientAttention {
    clientId: string;
    nom: string;
    missionsActives: number;
    rdvSurLaPeriode: number;
    commerciauxSansAcces: number;
    joursContractuelsManquants: boolean;
    /** French, one line per signal, in the order the tool has always shown them. */
    alertes: string[];
}

export interface ClientAttentionResult {
    periodeJours: number;
    /** Flagged clients, most alerts first. */
    clients: ClientAttention[];
    totalClientsActifs: number;
}

/** The three reads the signal needs; a test injects plain functions. */
export interface ClientAttentionDb {
    listActiveClients(clientId: string | null): Promise<
        Array<{
            id: string;
            name: string;
            contractedDaysPerWeek: number | null;
            missions: Array<{ id: string; name: string }>;
            interlocuteurs: Array<{ id: string; portalUser: { id: string } | null }>;
        }>
    >;
    countMeetingsByCampaign(since: Date): Promise<Array<{ campaignId: string; count: number }>>;
    missionsOfCampaigns(campaignIds: string[]): Promise<Array<{ id: string; missionId: string }>>;
}

export const prismaClientAttentionDb: ClientAttentionDb = {
    listActiveClients: (clientId) =>
        prisma.client.findMany({
            where: { archivedAt: null, status: "ACTIVE", ...(clientId ? { id: clientId } : {}) },
            select: {
                id: true,
                name: true,
                contractedDaysPerWeek: true,
                missions: { where: { isActive: true }, select: { id: true, name: true } },
                interlocuteurs: { where: { isActive: true }, select: { id: true, portalUser: { select: { id: true } } } },
            },
        }),
    countMeetingsByCampaign: async (since) => {
        // One grouped query rather than one per client: this runs on every
        // "how are things going" question and must stay cheap.
        const rows = await prisma.action.groupBy({
            by: ["campaignId"],
            where: { result: "MEETING_BOOKED", createdAt: { gte: since } },
            _count: { _all: true },
        });
        return rows.map((r) => ({ campaignId: r.campaignId, count: r._count._all }));
    },
    missionsOfCampaigns: (campaignIds) =>
        campaignIds.length === 0
            ? Promise.resolve([])
            : prisma.campaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, missionId: true } }),
};

export async function collectClientAttention(
    options: { days: number; clientId?: string | null; now?: Date },
    db: ClientAttentionDb = prismaClientAttentionDb,
): Promise<ClientAttentionResult> {
    const days = options.days;
    const now = options.now ?? new Date();
    const since = new Date(now.getTime() - days * 86_400_000);

    const clients = await db.listActiveClients(options.clientId ?? null);
    const recentMeetings = await db.countMeetingsByCampaign(since);
    const campaigns = await db.missionsOfCampaigns(recentMeetings.map((m) => m.campaignId));
    const missionMeetingCount = new Map<string, number>();
    for (const row of recentMeetings) {
        const missionId = campaigns.find((c) => c.id === row.campaignId)?.missionId;
        if (!missionId) continue;
        missionMeetingCount.set(missionId, (missionMeetingCount.get(missionId) ?? 0) + row.count);
    }

    const flagged = clients
        .map((client): ClientAttention => {
            const meetings = client.missions.reduce((sum, m) => sum + (missionMeetingCount.get(m.id) ?? 0), 0);
            const sansAcces = client.interlocuteurs.filter((i) => !i.portalUser).length;
            const alertes: string[] = [];
            if (client.missions.length > 0 && meetings === 0) alertes.push(`aucun RDV depuis ${days} jours`);
            if (client.contractedDaysPerWeek === null) alertes.push("jours/semaine non renseignés");
            if (sansAcces > 0) alertes.push(`${sansAcces} commercial(aux) sans accès portail`);
            if (client.missions.length === 0) alertes.push("aucune mission active");
            return {
                clientId: client.id,
                nom: client.name,
                missionsActives: client.missions.length,
                rdvSurLaPeriode: meetings,
                commerciauxSansAcces: sansAcces,
                joursContractuelsManquants: client.contractedDaysPerWeek === null,
                alertes,
            };
        })
        .filter((c) => c.alertes.length > 0)
        .sort((a, b) => b.alertes.length - a.alertes.length);

    return { periodeJours: days, clients: flagged, totalClientsActifs: clients.length };
}
