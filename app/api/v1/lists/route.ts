import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { searchLists, searchListsParams } from "@/lib/api-v1/services/lists";

export const dynamic = "force-dynamic";

export const GET = v1Route("lists:read", (ctx, { query }) => searchLists(ctx, parseInput(searchListsParams, query)));
