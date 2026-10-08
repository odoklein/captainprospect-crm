import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { searchMissions, searchMissionsParams } from "@/lib/api-v1/services/missions";

export const dynamic = "force-dynamic";

export const GET = v1Route("missions:read", (ctx, { query }) => searchMissions(ctx, parseInput(searchMissionsParams, query)));
