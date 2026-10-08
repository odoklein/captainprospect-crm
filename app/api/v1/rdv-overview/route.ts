import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { getRdvOverview, rdvOverviewParams } from "@/lib/api-v1/services/insights";

export const dynamic = "force-dynamic";

export const GET = v1Route("appointments:read", (ctx, { query }) => getRdvOverview(ctx, parseInput(rdvOverviewParams, query)));
