"use client";
import { useEffect, useState } from "react";
import type { ActivityEvent } from "./ActivityTimeline";

interface ThreadActivity {
    id: string; subject: string; snippet?: string | null; lastEmailAt: string;
    contact?: { firstName?: string | null; lastName?: string | null } | null;
    latestEmail?: { direction: string; date: string; status: string } | null;
}

/** Reuses the mailbox API's existing access controls; never queries mail directly. */
export function useMailboxActivity(companyId?: string) {
    const [snapshot, setSnapshot] = useState<{ key: string; events: ActivityEvent[]; failed: boolean } | null>(null);
    useEffect(() => {
        if (!companyId) return;
        const controller = new AbortController();
        fetch(`/api/email/threads?companyId=${encodeURIComponent(companyId)}&limit=20`, { signal: controller.signal })
            .then(async response => {
                if (!response.ok) throw new Error("Mailbox unavailable");
                const body = await response.json();
                if (!body.success || !Array.isArray(body.data?.threads)) throw new Error("Invalid mailbox response");
                const events: ActivityEvent[] = (body.data.threads as ThreadActivity[])
                    .filter(thread => thread.latestEmail && thread.latestEmail.status !== "DRAFT")
                    .map(thread => ({ id: `email:${thread.id}`, kind: "email", at: thread.latestEmail!.date || thread.lastEmailAt,
                        title: thread.subject || "Sans objet", note: thread.snippet,
                        actor: thread.latestEmail!.direction === "INBOUND" ? "Email reçu" : "Email envoyé",
                        contactName: [thread.contact?.firstName, thread.contact?.lastName].filter(Boolean).join(" ") }));
                if (!controller.signal.aborted) setSnapshot({ key: companyId, events, failed: false });
            }).catch(() => { if (!controller.signal.aborted) setSnapshot({ key: companyId, events: [], failed: true }); });
        return () => controller.abort();
    }, [companyId]);
    const current = snapshot?.key === companyId ? snapshot : null;
    return { events: current?.events ?? [], failed: current?.failed ?? false, loading: !!companyId && !current };
}
