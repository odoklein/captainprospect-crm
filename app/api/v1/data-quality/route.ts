import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { getDataQuality, dataQualityParams } from "@/lib/api-v1/services/insights";

export const dynamic = "force-dynamic";

export const GET = v1Route("contacts:read", (ctx, { query }) => getDataQuality(ctx, parseInput(dataQualityParams, query)));
