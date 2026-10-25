import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// The sidebar's "Email Hub" points here. People with their own mailbox (BDs
// today) mostly read replies, so they land on the inbox; SDRs send from the
// call screen through a mission mailbox, so they land on "Mes envois".
export default async function SdrEmailsPage() {
    const session = await getServerSession(authOptions);
    const ownsMailbox = session?.user?.id
        ? await prisma.mailbox.count({ where: { ownerId: session.user.id, isActive: true } }).catch(() => 0)
        : 0;
    redirect(ownsMailbox > 0 ? "/sdr/emails/inbox" : "/sdr/emails/sent");
}
