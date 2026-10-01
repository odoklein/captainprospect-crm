/**
 * Who may read a support conversation on the client side. Pure (no DB) so the
 * rule is unit-tested and shared by the list, detail and every write route.
 *
 * - Client admins (role CLIENT) reach every conversation of their company.
 * - A commercial reaches only the conversations they created themselves.
 * - A conversation with no creator predates the createdById column and holds
 *   company-level history of several people: admins only, never commercials.
 */

export interface SupportViewer {
    id: string;
    role: string;
    clientId: string | null;
}

export interface SupportConversationOwner {
    clientId: string;
    createdById: string | null;
}

export function canClientSideUserAccess(viewer: SupportViewer, conversation: SupportConversationOwner): boolean {
    if (!viewer.clientId || conversation.clientId !== viewer.clientId) return false;
    if (viewer.role === "CLIENT") return true;
    if (viewer.role === "COMMERCIAL") return conversation.createdById === viewer.id;
    return false;
}

/** Prisma `where` listing exactly the conversations canClientSideUserAccess allows. */
export function clientSideConversationWhere(viewer: { id: string; role: string; clientId: string }) {
    return viewer.role === "COMMERCIAL"
        ? { clientId: viewer.clientId, createdById: viewer.id }
        : { clientId: viewer.clientId };
}
