"use client";

import { AppLayoutShell } from "@/components/layout/AppLayoutShell";
import { MANAGER_NAV } from "@/lib/navigation/config";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
    return (
        <AppLayoutShell
            allowedRoles={["MANAGER"]}
            customNavigation={MANAGER_NAV}
        >
            {children}
        </AppLayoutShell>
    );
}
