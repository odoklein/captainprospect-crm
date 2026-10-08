import { v1Route } from "@/lib/api-v1/handler";
import { getCall } from "@/lib/api-v1/services/actions";

export const dynamic = "force-dynamic";

export const GET = v1Route("calls:read", (ctx, { params }) => getCall(ctx, params.id));
