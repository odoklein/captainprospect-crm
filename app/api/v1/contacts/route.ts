import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { searchContacts, searchContactsParams } from "@/lib/api-v1/services/contacts";

export const dynamic = "force-dynamic";

export const GET = v1Route("contacts:read", (ctx, { query }) =>
  searchContacts(ctx, parseInput(searchContactsParams, query)),
);
