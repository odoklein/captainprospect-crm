"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarClock, MessageSquare } from "lucide-react";
import { Badge, Button, Callout, Modal, ModalFooter } from "@/components/ui";
import { formatNoShowCountdown } from "@/lib/meetings/feedbackReminder";

/**
 * « Mon avis » reminder of the client / commercial portal.
 *
 * A no-show not reported within 48 h of the meeting counts as honoured (and is
 * billed), so past confirmed RDVs without feedback are chased in two ways:
 *  - a modal, once per browser session, while at least one 48 h window is open;
 *  - a banner above every page while any feedback is missing.
 * Nothing is blocked: « Plus tard » snoozes the modal for the session.
 *
 * On the client portal the modal waits for the access gate to be gone
 * (`cp:portal-access-ready`), so the two full-screen layers never stack.
 */

const SNOOZE_KEY = "cp_feedback_reminder_snoozed";
const ACCESS_GATE_SEEN_KEY = "cp_portal_access_checked";
const REFRESH_MS = 5 * 60 * 1000;

export const MEETING_FEEDBACK_SAVED_EVENT = "cp:meeting-feedback-saved";
export const OPEN_MEETING_FEEDBACK_EVENT = "cp:open-meeting-feedback";
export const PORTAL_ACCESS_READY_EVENT = "cp:portal-access-ready";

interface PendingItem {
    actionId: string;
    meetingAt: string;
    contactName: string | null;
    companyName: string | null;
    missionName: string;
    interlocuteurName: string | null;
    noShowDeadline: string;
    windowOpen: boolean;
    hoursLeft: number;
}

interface PendingData {
    items: PendingItem[];
    total: number;
    urgentCount: number;
}

function readSession(key: string): boolean {
    try {
        return sessionStorage.getItem(key) === "1";
    } catch {
        return false;
    }
}

function formatMeetingAt(iso: string): string {
    return new Date(iso).toLocaleString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Paris",
    });
}

function plural(n: number, one: string, many: string): string {
    return `${n} ${n > 1 ? many : one}`;
}

function CountdownBadge({ item }: { item: PendingItem }) {
    const variant = !item.windowOpen ? "default" : item.hoursLeft < 12 ? "danger" : "warning";
    return (
        <Badge variant={variant} size="sm" dot={item.windowOpen}>
            {formatNoShowCountdown(item.hoursLeft)}
        </Badge>
    );
}

export function MeetingFeedbackReminder({ portal }: { portal: "client" | "commercial" }) {
    const router = useRouter();
    const pathname = usePathname();
    const meetingsPath = portal === "client" ? "/client/portal/meetings" : "/commercial/portal/meetings";

    const [data, setData] = useState<PendingData | null>(null);
    // Only the client layout mounts the access gate.
    const [gateReady, setGateReady] = useState(() => portal === "commercial" || readSession(ACCESS_GATE_SEEN_KEY));
    const [modalOpen, setModalOpen] = useState(false);
    const promptedRef = useRef(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/portal/meetings/feedback-pending", { cache: "no-store" });
            const json = await res.json().catch(() => null);
            if (res.ok && json?.success && json.data) setData(json.data as PendingData);
        } catch {
            // Network hiccup: keep what is shown, the next refresh will retry.
        }
    }, []);

    useEffect(() => {
        void load();
        const onFocus = () => void load();
        const timer = window.setInterval(() => void load(), REFRESH_MS);
        window.addEventListener("focus", onFocus);
        window.addEventListener(MEETING_FEEDBACK_SAVED_EVENT, onFocus);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", onFocus);
            window.removeEventListener(MEETING_FEEDBACK_SAVED_EVENT, onFocus);
        };
    }, [load]);

    useEffect(() => {
        if (gateReady) return;
        const onReady = () => setGateReady(true);
        window.addEventListener(PORTAL_ACCESS_READY_EVENT, onReady);
        return () => window.removeEventListener(PORTAL_ACCESS_READY_EVENT, onReady);
    }, [gateReady]);

    useEffect(() => {
        if (promptedRef.current || !gateReady || !data || data.urgentCount === 0) return;
        if (readSession(SNOOZE_KEY)) return;
        promptedRef.current = true;
        setModalOpen(true);
    }, [gateReady, data]);

    const closeModal = useCallback(() => {
        try { sessionStorage.setItem(SNOOZE_KEY, "1"); } catch { /* storage unavailable: shown again next load */ }
        setModalOpen(false);
    }, []);

    const openFeedback = useCallback((actionId: string) => {
        closeModal();
        if (pathname === meetingsPath) {
            // Already on the list: the page opens its own feedback modal.
            window.dispatchEvent(new CustomEvent(OPEN_MEETING_FEEDBACK_EVENT, { detail: { actionId } }));
        } else {
            router.push(`${meetingsPath}?avis=${encodeURIComponent(actionId)}`);
        }
    }, [closeModal, pathname, meetingsPath, router]);

    if (!data || data.total === 0) return null;

    const urgentItems = data.items.filter((i) => i.windowOpen);
    const first = data.items[0];
    const summary = data.urgentCount > 0
        ? `${plural(data.urgentCount, "absence encore signalable", "absences encore signalables")} dans le délai de 48 h`
        : "Délai de signalement d'absence dépassé";

    return (
        <>
            <Callout
                tone={data.urgentCount > 0 ? "warning" : "neutral"}
                icon={CalendarClock}
                className="mb-4"
                title={`${plural(data.total, "rendez-vous sans avis", "rendez-vous sans avis")} · ${summary}`}
                action={
                    first && (
                        <Button size="sm" variant="primary" onClick={() => openFeedback(first.actionId)} leftIcon={<MessageSquare className="size-3.5" />}>
                            Donner mon avis
                        </Button>
                    )
                }
            >
                Un prospect absent doit être signalé dans les 48 h qui suivent le rendez-vous.
            </Callout>

            <Modal
                isOpen={modalOpen}
                onClose={closeModal}
                title="Vos rendez-vous attendent votre avis"
                description="Un prospect absent doit être signalé dans les 48 h qui suivent le rendez-vous. Passé ce délai, le rendez-vous est considéré comme honoré."
                size="lg"
                closeOnOverlay={false}
            >
                <ul className="divide-y divide-line-subtle">
                    {urgentItems.map((item) => (
                        <li key={item.actionId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-ink">
                                    {item.contactName ?? "Contact"}
                                    {item.companyName && <span className="font-normal text-ink-3"> · {item.companyName}</span>}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-ink-3">
                                    {formatMeetingAt(item.meetingAt)} · {item.missionName}
                                    {portal === "client" && item.interlocuteurName && ` · ${item.interlocuteurName}`}
                                </p>
                                <div className="mt-1.5">
                                    <CountdownBadge item={item} />
                                </div>
                            </div>
                            <Button size="sm" variant="primary" onClick={() => openFeedback(item.actionId)}>
                                Donner mon avis
                            </Button>
                        </li>
                    ))}
                </ul>
                {data.total > urgentItems.length && (
                    <p className="mt-4 text-xs text-ink-3">
                        {plural(data.total - urgentItems.length, "autre rendez-vous attend", "autres rendez-vous attendent")} aussi votre avis.
                    </p>
                )}
                <ModalFooter>
                    <Button variant="secondary" onClick={closeModal}>Plus tard</Button>
                </ModalFooter>
            </Modal>
        </>
    );
}

export default MeetingFeedbackReminder;
