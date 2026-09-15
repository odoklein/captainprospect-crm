import { redirect } from "next/navigation";

/**
 * The missions index moved into the client drawer: missions are now managed from
 * /manager/clients, where clicking a client opens its mission workspace. This
 * route is kept only so older links and bookmarks still land somewhere useful.
 */
export default async function MissionsIndexRedirect({
    searchParams,
}: {
    searchParams: Promise<{ clientId?: string }>;
}) {
    const { clientId } = await searchParams;
    redirect(clientId ? `/manager/clients?client=${clientId}` : "/manager/clients");
}
