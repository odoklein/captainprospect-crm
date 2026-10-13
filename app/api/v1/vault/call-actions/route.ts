import { v1Route, parseInput } from "@/lib/api-v1/handler";
import { listVaultCallActions, vaultCallActionsParams } from "@/lib/api-v1/services/vault-sync";

export const dynamic = "force-dynamic";

/** Internal (all-clients) keys only — see lib/api-v1/services/vault-sync.ts. */
export const GET = v1Route("calls:read", (ctx, { query }) => listVaultCallActions(ctx, parseInput(vaultCallActionsParams, query)));
