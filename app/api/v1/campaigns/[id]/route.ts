import { v1Route } from "@/lib/api-v1/handler";
import { getCampaign } from "@/lib/api-v1/services/campaigns";

export const dynamic = "force-dynamic";

export const GET = v1Route("missions:read", (ctx, { params }) => getCampaign(ctx, params.id));
