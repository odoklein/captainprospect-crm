import { v1Route } from "@/lib/api-v1/handler";
import { getUser } from "@/lib/api-v1/services/team";

export const dynamic = "force-dynamic";

export const GET = v1Route("users:read", (ctx, { params }) => getUser(ctx, params.id));
