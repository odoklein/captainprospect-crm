import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { searchLeads, searchLeadsParams } from "@/lib/api-v1/services/leads";

export const dynamic = "force-dynamic";

export const GET = v1Route("leads:read", (ctx, { query }) =>
  searchLeads(ctx, parseInput(searchLeadsParams, query)),
);
