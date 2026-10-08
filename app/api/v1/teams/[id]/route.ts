import { v1Route } from "@/lib/api-v1/handler";
import { getTeam } from "@/lib/api-v1/services/team";

export const dynamic = "force-dynamic";

export const GET = v1Route("users:read", (ctx, { params }) => getTeam(ctx, params.id));
