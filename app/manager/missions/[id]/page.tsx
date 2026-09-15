import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

/**
 * The mission detail page now lives inside the client drawer. We resolve the
 * owning client so an old /manager/missions/<id> link opens that mission's
 * workspace directly instead of dumping people on the client list.
 *
 * Access is already gated by middleware (/manager/* is MANAGER-only), and the
 * only thing exposed here is which client a mission belongs to.
 */
export default async function MissionDetailRedirect({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ tab?: string }>;
}) {
    const { id } = await params;
    const { tab } = await searchParams;

    const mission = await prisma.mission.findUnique({
        where: { id },
        select: { clientId: true },
    });

    if (!mission) redirect("/manager/clients");

    // Tabs the old page linked to that no longer exist as such in the workspace.
    const TAB_ALIASES: Record<string, string> = {
        assignments: "audience",
        campaigns: "strategy",
        lists: "audience",
    };
    const workspaceTab = tab ? TAB_ALIASES[tab] ?? tab : "general";

    redirect(`/manager/clients?client=${mission.clientId}&mission=${id}&tab=${workspaceTab}`);
}
