import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { searchAppointments, searchAppointmentsParams } from "@/lib/api-v1/services/actions";

export const dynamic = "force-dynamic";

export const GET = v1Route("appointments:read", (ctx, { query }) =>
  searchAppointments(ctx, parseInput(searchAppointmentsParams, query)),
);
