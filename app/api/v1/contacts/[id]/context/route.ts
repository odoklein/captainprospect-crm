import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { getContactContext, contactContextParams } from "@/lib/api-v1/services/contacts";

export const dynamic = "force-dynamic";

// One call = the whole commercial picture of a contact. Query: calls_limit, activities_limit,
// notes_limit, include_notes, include_appointments.
export const GET = v1Route("contacts:read", (ctx, { params, query }) =>
  getContactContext(ctx, params.id, parseInput(contactContextParams, query)),
);
