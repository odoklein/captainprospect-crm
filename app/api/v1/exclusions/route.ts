import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { searchExclusions, searchExclusionsParams } from "@/lib/api-v1/services/insights";

export const dynamic = "force-dynamic";

export const GET = v1Route("contacts:read", (ctx, { query }) => searchExclusions(ctx, parseInput(searchExclusionsParams, query)));
