import { v1Route } from "@/lib/api-v1/handler";
import { getAccount } from "@/lib/api-v1/services/account";

export const dynamic = "force-dynamic";

// Who this key is, what it can see, today's date (Paris). Any valid key.
export const GET = v1Route(null, (ctx) => getAccount(ctx));
