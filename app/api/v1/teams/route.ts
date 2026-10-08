import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { searchTeams, searchTeamsParams } from "@/lib/api-v1/services/team";

export const dynamic = "force-dynamic";

export const GET = v1Route("users:read", (ctx, { query }) =>
  searchTeams(ctx, parseInput(searchTeamsParams, query)),
);
