"use client";

import { AppLayoutShell } from "@/components/layout/AppLayoutShell";
import { COMMERCIAL_NAV } from "@/lib/navigation/config";
import ClientSupportRoot from "@/components/support/ClientSupportRoot";
import { MeetingFeedbackReminder } from "@/components/portal/MeetingFeedbackReminder";

export default function CommercialLayout({ children }: { children: React.ReactNode }) {
    return (
        <AppLayoutShell
            allowedRoles={["COMMERCIAL"]}
            customNavigation={COMMERCIAL_NAV}
        >
            {/* « Mon avis » owed on past RDVs: modal once per session + banner. */}
            <MeetingFeedbackReminder portal="commercial" />
            {children}
            {/* Global floating support launcher — available on every /commercial/* route. */}
            <ClientSupportRoot />
        </AppLayoutShell>
    );
}
