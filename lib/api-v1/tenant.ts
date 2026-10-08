import type { Prisma } from "@prisma/client";
import type { Principal } from "./auth";

/**
 * The ONLY place tenant filters are built. Every service query starts from one
 * of these, and `clientId` always comes from the authenticated principal —
 * never from a query parameter, a body or a tool argument.
 *
 *   Contact → Company → List → Mission → Client (tenant)
 *   Action  → Campaign → Mission → Client
 */
export const missionScope = (p: Principal): Prisma.MissionWhereInput => ({
  clientId: p.clientId,
  ...(p.missionId ? { id: p.missionId } : {}),
});

export const companyScope = (p: Principal): Prisma.CompanyWhereInput => ({
  list: { mission: missionScope(p) },
});

export const contactScope = (p: Principal): Prisma.ContactWhereInput => ({
  company: companyScope(p),
});

export const actionScope = (p: Principal): Prisma.ActionWhereInput => ({
  campaign: { mission: missionScope(p) },
});

export const opportunityScope = (p: Principal): Prisma.OpportunityWhereInput => ({
  company: companyScope(p),
});

/** Users visible to a tenant: its own client users, plus SDRs staffed on its missions. */
export const userScope = (p: Principal): Prisma.UserWhereInput => ({
  OR: [
    { clientId: p.clientId },
    { assignedMissions: { some: { mission: missionScope(p) } } },
    { missionsAsTeamLead: { some: missionScope(p) } },
  ],
});
