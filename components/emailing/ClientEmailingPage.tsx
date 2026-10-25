"use client";

// ============================================
// CLIENT PORTAL — Emailing (/client/portal/emailing?tab=campaigns|sent)
// One page, two tabs: ReachInbox campaigns linked to the client, and the
// emails the team sent one by one for the client's missions.
// ============================================

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Megaphone, Send } from "lucide-react";
import { Tabs } from "@/components/ui";
import { ReachInboxWorkspace } from "./ReachInboxWorkspace";
import { ClientSentEmails } from "./ClientSentEmails";

type Tab = "campaigns" | "sent";

export function ClientEmailingPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const tab: Tab = searchParams.get("tab") === "sent" ? "sent" : "campaigns";

    const setTab = (next: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (next === "campaigns") params.delete("tab");
        else params.set("tab", next);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };

    return (
        <div className="min-h-full bg-canvas">
            <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6">
                <div className="mb-4">
                    <h1 className="text-xl font-bold tracking-tight text-ink">Emailing</h1>
                    <p className="mt-0.5 max-w-2xl text-[13px] text-ink-3">
                        Les campagnes emailing menées pour vous et les emails envoyés par l&apos;équipe, avec leurs ouvertures et leurs réponses.
                    </p>
                </div>
                <Tabs
                    className="mb-5"
                    activeTab={tab}
                    onTabChange={setTab}
                    tabs={[
                        { id: "campaigns", label: "Campagnes", icon: <Megaphone className="size-4" aria-hidden /> },
                        { id: "sent", label: "Emails envoyés", icon: <Send className="size-4" aria-hidden /> },
                    ]}
                />
                {tab === "campaigns" ? <ReachInboxWorkspace variant="client" /> : <ClientSentEmails />}
            </div>
        </div>
    );
}

export default ClientEmailingPage;
