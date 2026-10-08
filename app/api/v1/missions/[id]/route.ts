import { v1Route } from "@/lib/api-v1/handler";
import { getMission } from "@/lib/api-v1/services/missions";

export const dynamic = "force-dynamic";

export const GET = v1Route("missions:read", (ctx, { params }) => getMission(ctx, params.id));
