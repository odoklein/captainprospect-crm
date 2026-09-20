"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { LoadingState } from "@/components/ui";
import { TicketWorkspace } from "@/components/tickets/TicketWorkspace";

interface Option {
    id: string;
    name: string;
}

export default function ManagerTicketsPage() {
    const { data: session, status } = useSession();
    const [developers, setDevelopers] = useState<Option[]>([]);
    const [clients, setClients] = useState<Option[]>([]);

    useEffect(() => {
        const load = async () => {
            const [usersResponse, clientsResponse] = await Promise.all([
                fetch("/api/users?role=DEVELOPER,MANAGER&excludeSelf=false&limit=100"),
                fetch("/api/clients?limit=200"),
            ]);

            const usersResult = await usersResponse.json();
            if (usersResponse.ok && usersResult.success) {
                const userList = Array.isArray(usersResult.data?.users)
                    ? usersResult.data.users
                    : Array.isArray(usersResult.data)
                    ? usersResult.data
                    : [];
                setDevelopers(
                    userList.map((user: { id: string; name?: string | null; email?: string | null }) => ({
                        id: user.id,
                        name: user.name?.trim() || user.email?.trim() || "Utilisateur",
                    })),
                );
            }

            const clientsResult = await clientsResponse.json();
            if (clientsResponse.ok && clientsResult.success) {
                const clientList = Array.isArray(clientsResult.data)
                    ? clientsResult.data
                    : Array.isArray(clientsResult.data?.clients)
                    ? clientsResult.data.clients
                    : [];
                setClients(
                    clientList.map((client: { id: string; name?: string | null }) => ({
                        id: client.id,
                        name: client.name?.trim() || "Client",
                    })),
                );
            }
        };

        load().catch(() => {
            // The board still works without these lists; only the create form degrades.
        });
    }, []);

    if (status === "loading" || !session?.user?.id) {
        return <LoadingState />;
    }

    return (
        <TicketWorkspace
            currentUserId={session.user.id}
            isManager
            developers={developers}
            clients={clients}
        />
    );
}
