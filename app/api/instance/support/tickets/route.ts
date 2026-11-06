import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardInstanceRequest, instanceError, instanceJson } from "@/lib/instance/respond";
import { encodeSupportCursor, parseSupportListQuery, serializeSupportTicket, supportListWhere } from "@/lib/instance/support";
import { findPlatformSupportUserId, getSupportCounts } from "@/lib/instance/support-server";
import { TICKET_LIST_INCLUDE } from "@/lib/tickets/service";

// Support Technique tickets of this agency, for the Console's fleet inbox. HMAC-signed.
//   GET ?status=NEW,TODO&priority=&category=&scope=&validation=&open=true
//       &q=<text or TC-0012>&updatedSince=<ISO>&limit=1..200&cursor=<opaque>
//     → { ok, tickets: SupportTicketSummary[], nextCursor, counts, serverTime }
// Order: most recently updated first. For incremental sync, pass the previous
// `serverTime` as `updatedSince` and follow `nextCursor` until it is null.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "support");
    if (!guard.ok) return guard.response;

    const parsed = parseSupportListQuery(new URL(request.url).searchParams);
    if (!parsed.ok) return instanceError(422, "validation_failed", { errors: parsed.errors });
    const q = parsed.value;

    const serverTime = new Date().toISOString();
    try {
        const [rows, counts] = await Promise.all([
            prisma.ticket.findMany({
                where: supportListWhere(q),
                include: TICKET_LIST_INCLUDE,
                orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
                take: q.limit + 1,
            }),
            getSupportCounts(),
        ]);
        const page = rows.slice(0, q.limit);
        const last = page[page.length - 1];
        const nextCursor = rows.length > q.limit && last ? encodeSupportCursor({ updatedAt: last.updatedAt, id: last.id }) : null;

        // When the platform last answered each ticket of the page: one grouped query, not one per ticket.
        const platformUserId = page.length ? await findPlatformSupportUserId() : null;
        const replies = platformUserId
            ? await prisma.ticketComment.groupBy({
                  by: ["ticketId"],
                  where: { userId: platformUserId, ticketId: { in: page.map((t) => t.id) } },
                  _max: { createdAt: true },
              })
            : [];
        const lastReply = new Map(replies.map((r) => [r.ticketId, r._max.createdAt]));

        return instanceJson({
            ok: true,
            tickets: page.map((t) => serializeSupportTicket(t, undefined, lastReply.get(t.id) ?? null)),
            nextCursor,
            counts,
            serverTime,
        });
    } catch (err) {
        console.error("[instance-api] support list", err);
        return instanceError(500, "database_error");
    }
}
