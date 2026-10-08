import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { getDailyReports, dailyReportsParams } from "@/lib/api-v1/services/insights";

export const dynamic = "force-dynamic";

export const GET = v1Route("reports:read", (ctx, { query }) => getDailyReports(ctx, parseInput(dailyReportsParams, query)));
