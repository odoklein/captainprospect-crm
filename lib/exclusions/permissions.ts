import type { ExclusionScope, UserRole } from "@prisma/client";

/**
 * Who may exclude what, as pure functions so every route enforces the same
 * matrix and the negative cases can be unit tested.
 *
 * The asymmetry is deliberate: creating an exclusion is cheap and reversible,
 * so the people closest to the prospect (SDRs, and the client themselves) may
 * do it. Widening one to GLOBAL, or lifting one, puts prospects back on the
 * phone — that stays with managers.
 */

export interface ExclusionActor {
    id: string;
    role: UserRole;
    /** Set for CLIENT / COMMERCIAL sessions; the only client they may act on. */
    clientId?: string | null;
}

export interface ExclusionRuleRef {
    scope: ExclusionScope;
    scopeId: string | null;
    createdById: string;
}

/** Roles working prospects day to day: they exclude at CLIENT or MISSION level. */
const SALES_ROLES: UserRole[] = ["SDR", "BUSINESS_DEVELOPER", "BOOKER"];

/** Client-side roles: confined to their own clientId, CLIENT scope only. */
const CLIENT_ROLES: UserRole[] = ["CLIENT", "COMMERCIAL"];

export function canViewExclusions(actor: ExclusionActor): boolean {
    return (
        actor.role === "MANAGER" ||
        SALES_ROLES.includes(actor.role) ||
        CLIENT_ROLES.includes(actor.role)
    );
}

/** The manager console: the full journal across every client. */
export function canViewAllExclusions(actor: ExclusionActor): boolean {
    return actor.role === "MANAGER";
}

/**
 * GLOBAL is a legal-grade decision — it removes the prospect from every
 * client's prospection at once — so only a manager may reach for it.
 */
export function canCreateExclusion(actor: ExclusionActor, scope: ExclusionScope): boolean {
    if (actor.role === "MANAGER") return true;

    if (SALES_ROLES.includes(actor.role)) return scope === "CLIENT" || scope === "MISSION";

    if (CLIENT_ROLES.includes(actor.role)) return scope === "CLIENT";

    return false;
}

/**
 * A client session may only ever act inside its own clientId, whatever the
 * payload claims. Managers and sales roles are not bound to one client.
 */
export function canActOnClient(actor: ExclusionActor, clientId: string | null): boolean {
    if (actor.role === "MANAGER" || SALES_ROLES.includes(actor.role)) return true;

    if (CLIENT_ROLES.includes(actor.role)) {
        return !!clientId && !!actor.clientId && actor.clientId === clientId;
    }

    return false;
}

/**
 * Lifting puts people back on the phone, so it is a manager decision — with one
 * exception: whoever created a rule may undo their own, which is what makes a
 * mis-click in the SDR drawer recoverable without a ticket. A client may
 * likewise lift the exclusions they created themselves.
 */
export function canLiftExclusion(actor: ExclusionActor, rule: ExclusionRuleRef): boolean {
    if (actor.role === "MANAGER") return true;
    if (rule.scope === "GLOBAL") return false;

    if (CLIENT_ROLES.includes(actor.role)) {
        return rule.createdById === actor.id && canActOnClient(actor, rule.scopeId);
    }

    return SALES_ROLES.includes(actor.role) && rule.createdById === actor.id;
}

/** Scopes offered in the UI for this actor, in the order they should be shown. */
export function allowedScopesFor(actor: ExclusionActor): ExclusionScope[] {
    const scopes: ExclusionScope[] = ["CLIENT", "MISSION", "GLOBAL"];
    return scopes.filter((scope) => canCreateExclusion(actor, scope));
}
