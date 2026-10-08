import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Principal } from "./auth";

/**
 * The ONLY place tenant filters are built. Every service query starts from one
 * of these, and the client always comes from the authenticated principal —
 * never from a query parameter, a body or a tool argument.
 *
 *   Contact → Company → List → Mission → Client (tenant)
 *   Action  → Campaign → Mission → Client
 *
 * A client-bound key is always filtered on its client. An internal all-clients
 * key (issued by a manager, see auth.ts) has no client filter. In both cases the
 * optional `client_id` argument can only NARROW the result, never widen it:
 * for a client-bound key, a different client_id simply matches nothing.
 */

export const clientFilterParam = z
  .string()
  .max(40)
  .optional()
  .describe("Narrow to one client (id from list_clients). Only useful with an all-clients key; a client-bound key always sees its own client only.");

/** Prisma filter on `Mission.clientId` for this principal (+ optional narrowing). */
const clientIs = (p: Principal, narrow?: string): Prisma.MissionWhereInput[] => [
  ...(p.clientId ? [{ clientId: p.clientId }] : []),
  ...(narrow ? [{ clientId: narrow }] : []),
];

export const missionScope = (p: Principal, narrow?: string): Prisma.MissionWhereInput => ({
  AND: [...clientIs(p, narrow), ...(p.missionId ? [{ id: p.missionId }] : [])],
});

export const companyScope = (p: Principal, narrow?: string): Prisma.CompanyWhereInput => ({
  list: { mission: missionScope(p, narrow) },
});

export const contactScope = (p: Principal, narrow?: string): Prisma.ContactWhereInput => ({
  company: companyScope(p, narrow),
});

export const actionScope = (p: Principal, narrow?: string): Prisma.ActionWhereInput => ({
  campaign: { mission: missionScope(p, narrow) },
});

export const opportunityScope = (p: Principal, narrow?: string): Prisma.OpportunityWhereInput => ({
  company: companyScope(p, narrow),
});

/** Prisma filter on `Client` rows. */
export const clientScope = (p: Principal, narrow?: string): Prisma.ClientWhereInput => ({
  AND: [...(p.clientId ? [{ id: p.clientId }] : []), ...(narrow ? [{ id: narrow }] : [])],
});

/**
 * Users visible to a principal: a client-bound key sees that client's own users
 * plus the SDRs staffed on its missions; an all-clients key sees every user.
 * Only names and roles are ever returned.
 */
export const userScope = (p: Principal): Prisma.UserWhereInput =>
  p.clientId
    ? {
        OR: [
          { clientId: p.clientId },
          { assignedMissions: { some: { mission: missionScope(p) } } },
          { missionsAsTeamLead: { some: missionScope(p) } },
        ],
      }
    : {};

/**
 * SQL equivalent of `missionScope`'s client part, for the raw queries.
 * `alias` is a fixed identifier written in this codebase (never user input);
 * the client ids are bound as parameters.
 */
export function clientSql(p: Principal, alias: string, narrow?: string): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (p.clientId) parts.push(Prisma.sql`${Prisma.raw(alias)}."clientId" = ${p.clientId}`);
  if (narrow) parts.push(Prisma.sql`${Prisma.raw(alias)}."clientId" = ${narrow}`);
  return parts.length ? Prisma.join(parts, " AND ") : Prisma.sql`TRUE`;
}
