import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { globalSearch, globalSearchParams } from "@/lib/api-v1/services/account";

export const dynamic = "force-dynamic";

// One text → matching contacts, companies and teams (each section gated by its scope).
export const GET = v1Route(null, (ctx, { query }) => globalSearch(ctx, parseInput(globalSearchParams, query)));
