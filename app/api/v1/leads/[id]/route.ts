import { v1Route } from "@/lib/api-v1/handler";
import { getLead } from "@/lib/api-v1/services/leads";

export const dynamic = "force-dynamic";

export const GET = v1Route("leads:read", (ctx, { params }) => getLead(ctx, params.id));
