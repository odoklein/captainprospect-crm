"use client";

import { AppLayoutShell } from "@/components/layout/AppLayoutShell";
import { SDR_NAV } from "@/lib/navigation/config";
import { SdrSuggestionLauncher } from "@/components/sdr/SdrSuggestionLauncher";
import { SdrPaceProvider } from "@/components/sdr/SdrPaceProvider";

export default function SDRLayout({ children }: { children: React.ReactNode }) {
    return (
        <AppLayoutShell
            allowedRoles={["SDR", "BUSINESS_DEVELOPER", "BOOKER"]}
            customNavigation={SDR_NAV}
        >
            <SdrPaceProvider>
                {children}
            </SdrPaceProvider>
            <SdrSuggestionLauncher />
        </AppLayoutShell>
    );
}
