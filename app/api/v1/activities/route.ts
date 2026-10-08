import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { searchActivities, searchActivitiesParams } from "@/lib/api-v1/services/actions";

export const dynamic = "force-dynamic";

export const GET = v1Route("activities:read", (ctx, { query }) =>
  searchActivities(ctx, parseInput(searchActivitiesParams, query)),
);
