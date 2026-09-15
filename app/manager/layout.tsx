"use client";

import { AppLayoutShell } from "@/components/layout/AppLayoutShell";
import { MANAGER_NAV } from "@/lib/navigation/config";
import AssistantLauncher from "@/components/assistant-projet/AssistantLauncher";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
    return (
        <AppLayoutShell
            allowedRoles={["MANAGER"]}
            customNavigation={MANAGER_NAV}
        >
            {children}
            {/* Manager-only by construction: this layout already gates on the role,
                and every tool in the registry is MANAGER-only besides. */}
            <AssistantLauncher />
        </AppLayoutShell>
    );
}
