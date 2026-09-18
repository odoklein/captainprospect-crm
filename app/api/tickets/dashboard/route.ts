import { NextRequest } from "next/server";
import { AuthError, requireAuth, successResponse, withErrorHandler } from "@/lib/api-utils";
import { canAccessTickets, type TicketActor } from "@/lib/tickets/permissions";
import { getTicketDashboardCounts } from "@/lib/tickets/service";

// GET /api/tickets/dashboard — urgent / blocked / active / overdue counters
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const actor: TicketActor = { id: session.user.id, role: session.user.role as TicketActor["role"] };

    if (!canAccessTickets(actor)) {
        throw new AuthError("Accès non autorisé", 403);
    }

    return successResponse(await getTicketDashboardCounts());
});
