"use client";
import { use } from "react";
import { ClientDetailWorkspace } from "@/components/manager/ClientDetailWorkspace";
export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return <ClientDetailWorkspace clientId={id} />;
}
