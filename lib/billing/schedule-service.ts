import { prisma } from "@/lib/prisma";
import { getFirstCallAtByClient, parisDay } from "@/lib/clients/first-call";
import {
    buildClientSchedule,
    collectTodayItems,
    emptyClientState,
    type BillingTodayItem,
    type ClientSchedule,
    type ScheduleSettings,
} from "./cycle-schedule";
import { getClientStates, getScheduleSettings } from "./schedule-store";

// ============================================
// BILLING SCHEDULE — read side
// Covers ACTIVE clients, plus any other client that already has a stored
// schedule (so a paused or stopped client keeps its history and unpaid cycles
// visible). Only ACTIVE clients feed the home « Facturation » block.
// ============================================

export interface BillingScheduleClient {
    clientId: string;
    clientName: string;
    clientStatus: string;
    firstCallDay: string | null;
    hasActiveMission: boolean;
    anchorOverride: string | null;
    note: string | null;
    schedule: ClientSchedule;
}

export interface BillingSchedule {
    today: string;
    settings: ScheduleSettings;
    clients: BillingScheduleClient[];
    /** Names of the users who ticked rows, by id */
    users: Record<string, string>;
}

export async function getBillingSchedule(today: string = parisDay(new Date())): Promise<BillingSchedule> {
    const [settings, states] = await Promise.all([getScheduleSettings(), getClientStates()]);

    const clients = await prisma.client.findMany({
        where: { OR: [{ status: "ACTIVE" }, { id: { in: Array.from(states.keys()) } }] },
        select: {
            id: true,
            name: true,
            status: true,
            missions: {
                where: { status: "ACTIVE", isActive: true },
                select: { id: true },
                take: 1,
            },
        },
        orderBy: { name: "asc" },
    });

    const firstCalls = await getFirstCallAtByClient(clients.map((c) => c.id));

    const rows: BillingScheduleClient[] = clients.map((client) => {
        const state = states.get(client.id) ?? emptyClientState();
        const firstCallAt = firstCalls.get(client.id);
        const firstCallDay = firstCallAt ? parisDay(firstCallAt) : null;
        const hasActiveMission = client.missions.length > 0;
        return {
            clientId: client.id,
            clientName: client.name,
            clientStatus: client.status,
            firstCallDay,
            hasActiveMission,
            anchorOverride: state.anchorOverride ?? null,
            note: state.note ?? null,
            schedule: buildClientSchedule({ firstCallDay, hasActiveMission, state }, settings, today),
        };
    });

    const userIds = new Set<string>();
    for (const state of states.values()) {
        for (const tick of [state.setup, ...Object.values(state.cycles)]) {
            if (tick?.invoicedBy) userIds.add(tick.invoicedBy);
            if (tick?.paidBy) userIds.add(tick.paidBy);
        }
    }
    const users =
        userIds.size > 0
            ? await prisma.user.findMany({ where: { id: { in: Array.from(userIds) } }, select: { id: true, name: true } })
            : [];

    return {
        today,
        settings,
        clients: rows,
        users: Object.fromEntries(users.map((u) => [u.id, u.name])),
    };
}

/** What the manager home lists under « Facturation »: rows to invoice or chase today. */
export async function getBillingTodayItems(today: string = parisDay(new Date())): Promise<BillingTodayItem[]> {
    const { clients } = await getBillingSchedule(today);
    return collectTodayItems(clients.filter((c) => c.clientStatus === "ACTIVE"));
}

export type { BillingTodayItem };
