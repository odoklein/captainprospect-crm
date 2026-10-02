"use client";

import { Suspense } from "react";
import { BellRing, ShieldCheck, User } from "lucide-react";
import { SettingsShell, useSettingsSection, type SettingsSectionDef } from "@/components/settings/SettingsUI";
import {
    AccountHeaderPills, DesktopNotificationsCard, PersonalInfoCard, ProfileHero, SecuritySection,
} from "@/components/settings/AccountPanels";

// ============================================
// /bd/settings — "Mon profil" of the BD navigation (the link existed, the page didn't).
// ============================================

const SECTIONS: SettingsSectionDef[] = [
    { id: "profil", label: "Profil", hint: "Photo et coordonnées", icon: User, tone: "indigo", group: "Mon compte" },
    { id: "alertes", label: "Alertes", hint: "Notifications du bureau", icon: BellRing, tone: "amber", group: "Mon compte" },
    { id: "securite", label: "Sécurité", hint: "Mot de passe et appareils", icon: ShieldCheck, tone: "violet", group: "Mon compte" },
];

function BdSettings() {
    const [active, select] = useSettingsSection(SECTIONS);
    return (
        <SettingsShell
            title="Mon profil"
            subtitle="Votre profil, vos alertes et la sécurité de votre compte."
            pills={<AccountHeaderPills />}
            sections={SECTIONS}
            active={active}
            onSelect={select}
        >
            {active === "profil" && (
                <>
                    <ProfileHero />
                    <PersonalInfoCard />
                </>
            )}
            {active === "alertes" && <DesktopNotificationsCard />}
            {active === "securite" && <SecuritySection />}
        </SettingsShell>
    );
}

export default function BdSettingsPage() {
    return (
        <Suspense fallback={null}>
            <BdSettings />
        </Suspense>
    );
}
