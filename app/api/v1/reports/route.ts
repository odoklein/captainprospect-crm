import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { getSalesReport, salesReportParams } from "@/lib/api-v1/services/reports";

export const dynamic = "force-dynamic";

export const GET = v1Route("reports:read", (ctx, { query }) =>
  getSalesReport(ctx, parseInput(salesReportParams, query)),
);
