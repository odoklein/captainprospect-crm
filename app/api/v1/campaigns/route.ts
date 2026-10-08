import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { searchCampaigns, searchCampaignsParams } from "@/lib/api-v1/services/campaigns";

export const dynamic = "force-dynamic";

export const GET = v1Route("missions:read", (ctx, { query }) => searchCampaigns(ctx, parseInput(searchCampaignsParams, query)));
