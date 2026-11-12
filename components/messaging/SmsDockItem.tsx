"use client";

// Unread SMS in the floating dock: appears only when a prospect replied and
// nobody read it yet; one click opens Messages. Polls while the tab is visible.

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { MessageSquareText } from "lucide-react";
import { useDockItem } from "@/components/layout/FloatingDock";
import { useSoftphone } from "@/components/telephony/SoftphoneProvider";

const POLL_MS = 30_000;

export function SmsDockItem() {
    const { callerId } = useSoftphone();
    const { data: session } = useSession();
    const router = useRouter();
    const pathname = usePathname();
    const [unread, setUnread] = useState(0);
    const base = session?.user?.role === "MANAGER" ? "/manager" : "/sdr";
    const onMessages = pathname.endsWith("/messages");

    useEffect(() => {
        if (!callerId) return; // no Twilio number: no SMS
        let stop = false;
        const tick = async () => {
            if (document.hidden) return;
            try {
                const res = await fetch("/api/messaging/threads?count=1", { cache: "no-store" });
                const json = await res.json().catch(() => null);
                if (!stop && json?.success) setUnread(json.data.unread ?? 0);
            } catch {
                /* offline: keep the last count */
            }
        };
        void tick();
        const t = setInterval(tick, POLL_MS);
        return () => {
            stop = true;
            clearInterval(t);
        };
    }, [callerId, pathname]);

    useDockItem(
        "sms",
        unread > 0 && !onMessages
            ? {
                  label: `${unread} SMS non lu${unread > 1 ? "s" : ""}`,
                  icon: MessageSquareText,
                  badge: unread,
                  tone: "danger",
                  order: 15,
                  onClick: () => router.push(`${base}/messages`),
              }
            : null,
    );
    return null;
}
