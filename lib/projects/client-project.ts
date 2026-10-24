import { prisma } from "@/lib/prisma";

/**
 * The project that holds a client's tasks (session CR action items, onboarding
 * checklist). One per client: an ACTIVE project named after the client is
 * preferred, then the oldest active project of that client; created when none.
 * The caller is added as a member so the project shows in their « Projets ».
 */
export async function findOrCreateClientProject(
    clientId: string,
    userId: string,
    options: { description?: string } = {},
): Promise<{ id: string; name: string }> {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
    if (!client) throw new Error("Client introuvable");

    const candidates = await prisma.project.findMany({
        where: { clientId, status: "ACTIVE", archivedAt: null },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
    });
    let project = candidates.find((p) => p.name === client.name) ?? candidates[0] ?? null;

    if (!project) {
        project = await prisma.project.create({
            data: {
                name: client.name,
                description: options.description ?? "Projet du client : CR de sessions, onboarding et suivi.",
                clientId,
                ownerId: userId,
                members: { create: { userId, role: "owner" } },
            },
            select: { id: true, name: true },
        });
        return project;
    }

    await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId } },
        create: { projectId: project.id, userId, role: "member" },
        update: {},
    });
    return project;
}
