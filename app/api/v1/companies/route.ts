import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { searchCompanies, searchCompaniesParams } from "@/lib/api-v1/services/companies";

export const dynamic = "force-dynamic";

export const GET = v1Route("companies:read", (ctx, { query }) =>
  searchCompanies(ctx, parseInput(searchCompaniesParams, query)),
);
