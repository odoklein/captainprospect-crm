"use client";

/**
 * ============================================================
 * ASSISTANT PROJET — panel
 * ============================================================
 * Embedded Assistant Panel powered by assistant-ui and OpenAI low-cost models.
 * Preserves the fixedClientId / fixedMissionId contract so it can embed anywhere
 * in Dashboard Projet or client detail pages.
 */

import { useEffect, useState } from "react";
import { AssistantThread } from "@/components/assistant-ui/Thread";
import type { ClientOption } from "@/components/assistant-ui/types";

export interface AssistantProjetPanelProps {
    /** Locks the panel to one client (e.g. embedded in a client page). */
    fixedClientId?: string;
    /** Locks the mission too — used when opening from a specific mission row. */
    fixedMissionId?: string;
    className?: string;
    /** Called after any action that changed data, so the host page can refetch. */
    onDataChanged?: () => void;
}

export default function AssistantProjetPanel({
    fixedClientId,
    fixedMissionId,
    className,
    onDataChanged,
}: AssistantProjetPanelProps) {
    const [clients, setClients] = useState<ClientOption[]>([]);
    const [clientId, setClientId] = useState(fixedClientId ?? "");
    const [missionId, setMissionId] = useState(fixedMissionId ?? "");

    useEffect(() => {
        if (fixedClientId) {
            setClientId(fixedClientId);
            setMissionId(fixedMissionId ?? "");
            return;
        }

        fetch("/api/manager/assistant/conversations")
            .then((res) => (res.ok ? res.json() : null))
            .then((payload) => {
                if (!payload) return;
                const data = payload.data ?? payload;
                if (data.clients) setClients(data.clients);
            })
            .catch(() => {});
    }, [fixedClientId, fixedMissionId]);

    return (
        <AssistantThread
            clientId={clientId}
            missionId={missionId}
            clients={clients}
            onScopeChange={(c, m) => {
                setClientId(c);
                setMissionId(m);
            }}
            fixedClientId={fixedClientId}
            fixedMissionId={fixedMissionId}
            onDataChanged={onDataChanged}
            className={className}
        />
    );
}
