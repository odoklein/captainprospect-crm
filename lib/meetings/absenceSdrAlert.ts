import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

/**
 * Tells the SDR who booked a RDV that the client (or commercial) reported the
 * prospect absent and wants them called back. The red banner in the action
 * drawer and the call queue already surface it; this makes sure the SDR hears
 * about it without having to open the prospect first. Never throws.
 */
export async function notifySdrOfAbsence(actionId: string, recontact: string, by: "client" | "commercial"): Promise<void> {
    if (recontact !== "YES" && recontact !== "MAYBE") return;
    try {
        const action = await prisma.action.findUnique({
            where: { id: actionId },
            select: {
                sdrId: true,
                callbackDate: true,
                contact: { select: { firstName: true, lastName: true, company: { select: { name: true } } } },
                company: { select: { name: true } },
            },
        });
        if (!action?.sdrId) return;

        const contactName = [action.contact?.firstName, action.contact?.lastName].filter(Boolean).join(" ") || "Le prospect";
        const companyName = action.contact?.company?.name ?? action.company?.name ?? null;
        const date = action.callbackDate
            ? action.callbackDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
            : null;

        await createNotification({
            userId: action.sdrId,
            title: recontact === "YES" ? "RDV absent — à recontacter" : "RDV absent — peut-être à recontacter",
            message: `${contactName}${companyName ? ` (${companyName})` : ""} était absent${date ? ` au RDV du ${date}` : ""}. `
                + `Le ${by} ${recontact === "YES" ? "demande" : "envisage"} de le recontacter : reprenez un RDV, il repassera « À venir ».`,
            type: "warning",
            link: "/sdr/meetings",
        });
    } catch (err) {
        console.warn(`[absenceSdrAlert] SDR not notified for ${actionId}:`, err);
    }
}
