import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { searchUsers, searchUsersParams } from "@/lib/api-v1/services/team";

export const dynamic = "force-dynamic";

export const GET = v1Route("users:read", (ctx, { query }) =>
  searchUsers(ctx, parseInput(searchUsersParams, query)),
);
