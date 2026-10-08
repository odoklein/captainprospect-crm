import { v1Route } from "@/lib/api-v1/handler";
import { getList } from "@/lib/api-v1/services/lists";

export const dynamic = "force-dynamic";

export const GET = v1Route("lists:read", (ctx, { params }) => getList(ctx, params.id));
