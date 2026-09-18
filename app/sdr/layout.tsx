"use client";

import { AppLayoutShell } from "@/components/layout/AppLayoutShell";
import { SDR_NAV } from "@/lib/navigation/config";
import { SdrSuggestionLauncher } from "@/components/sdr/SdrSuggestionLauncher";

export default function SDRLayout({ children }: { children: React.ReactNode }) {
    return (
        <AppLayoutShell
            allowedRoles={["SDR", "BUSINESS_DEVELOPER", "BOOKER"]}
            customNavigation={SDR_NAV}
        >
            {children}
            <SdrSuggestionLauncher />
        </AppLayoutShell>
    );
}
