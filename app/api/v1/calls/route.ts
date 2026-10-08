import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { searchCalls, searchCallsParams } from "@/lib/api-v1/services/actions";

export const dynamic = "force-dynamic";

export const GET = v1Route("calls:read", (ctx, { query }) =>
  searchCalls(ctx, parseInput(searchCallsParams, query)),
);
