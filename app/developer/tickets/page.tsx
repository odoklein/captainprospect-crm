"use client";

import { useSession } from "next-auth/react";
import { LoadingState } from "@/components/ui";
import { TicketWorkspace } from "@/components/tickets/TicketWorkspace";

export default function DeveloperTicketsPage() {
    const { data: session, status } = useSession();

    if (status === "loading" || !session?.user?.id) {
        return <LoadingState />;
    }

    return (
        <TicketWorkspace
            currentUserId={session.user.id}
            isManager={false}
            developers={[]}
            clients={[]}
            defaultOnlyMine={true}
        />
    );
}
