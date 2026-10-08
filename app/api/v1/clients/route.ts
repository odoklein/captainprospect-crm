import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { searchClients, searchClientsParams } from "@/lib/api-v1/services/campaigns";

export const dynamic = "force-dynamic";

export const GET = v1Route("missions:read", (ctx, { query }) => searchClients(ctx, parseInput(searchClientsParams, query)));
