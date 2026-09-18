// Type-only: client pages import RoadmapItem from here, and a value import of
// @prisma/client would drag the Prisma runtime into the browser bundle.
import type { Prisma } from "@prisma/client";
import { ROADMAP_BUCKET_BY_STATUS, type RoadmapBucket } from "./constants";

/**
 * Everything a client is ever allowed to read from a ticket.
 *
 * This is a `select`, never an `include`: adding a column to Ticket must not
 * silently widen what the roadmap and changelog return. Internal `title` and
 * `description` are deliberately absent — clients only ever see the rewritten
 * `publicTitle` / `publicDescription` a manager approved.
 */
export const CLIENT_TICKET_SELECT = {
    id: true,
    publicTitle: true,
    publicDescription: true,
    status: true,
    completedAt: true,
    updatedAt: true,
} satisfies Prisma.TicketSelect;

export type ClientTicketRow = Prisma.TicketGetPayload<{ select: typeof CLIENT_TICKET_SELECT }>;

/**
 * The only filter clients are served from. `clientId` must come from the
 * session — never from a query parameter — and `scope` is asserted explicitly
 * rather than inferred from `clientId`, so an INTERNAL ticket that happens to
 * reference this client can never surface.
 */
export function clientRoadmapWhere(clientId: string): Prisma.TicketWhereInput {
    return {
        clientId,
        scope: "CLIENT_FACING",
        publishToRoadmap: true,
        publicTitle: { not: null },
    };
}

export function clientChangelogWhere(clientId: string): Prisma.TicketWhereInput {
    return {
        ...clientRoadmapWhere(clientId),
        status: "COMPLETED",
        completedAt: { not: null },
    };
}

export interface RoadmapItem {
    id: string;
    title: string;
    description: string | null;
    bucket: RoadmapBucket;
    completedAt: Date | null;
    updatedAt: Date;
}

/** Second layer after the select: shape the row into exactly what the UI needs. */
export function toRoadmapItem(row: ClientTicketRow): RoadmapItem {
    return {
        id: row.id,
        title: row.publicTitle ?? "",
        description: row.publicDescription,
        bucket: ROADMAP_BUCKET_BY_STATUS[row.status],
        completedAt: row.completedAt,
        updatedAt: row.updatedAt,
    };
}
