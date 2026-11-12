import { prisma } from "@/lib/prisma";

/**
 * Whether a client may download its data from the portal. Off until a manager
 * switches it on. Kept in the onboarding JSON next to `icp` and
 * `defaultMailboxId`, so it needs no migration.
 */
export async function clientMayExport(clientId: string): Promise<boolean> {
    const row = await prisma.clientOnboarding.findUnique({
        where: { clientId },
        select: { onboardingData: true },
    });
    const data = row?.onboardingData as Record<string, unknown> | null;
    return data?.portalAllowExport === true;
}
