import { v1Route } from "@/lib/api-v1/handler";
import { getCompany } from "@/lib/api-v1/services/companies";

export const dynamic = "force-dynamic";

export const GET = v1Route("companies:read", (ctx, { params }) => getCompany(ctx, params.id));
