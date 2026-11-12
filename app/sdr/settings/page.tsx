"use client";

import { Suspense } from "react";
import { PhonePrefsPanel } from "@/components/settings/PhonePrefsPanel";
import { CalendarClock, Phone, ShieldCheck, User } from "lucide-react";
import { SettingsShell, useSettingsSection, type SettingsSectionDef } from "@/components/settings/SettingsUI";
import {
    AccountHeaderPills, PersonalInfoCard, ProfileHero, SecuritySection, WorkdaySection,
} from "@/components/settings/AccountPanels";

// ============================================
// /sdr/settings — personal settings of SDRs, Bookers and BDs (all three use /sdr).
// Opened from the profile button at the bottom of the sidebar.
// ============================================

const SECTIONS: SettingsSectionDef[] = [
    { id: "profil", label: "Profil", hint: "Photo et coordonnées", icon: User, tone: "indigo", group: "Mon compte" },
    { id: "journee", label: "Ma journée", hint: "Objectif, ligne, alertes", icon: CalendarClock, tone: "emerald", group: "Mon compte" },
    { id: "telephone", label: "Téléphone", hint: "Appels entrants, messagerie", icon: Phone, tone: "teal", group: "Mon compte" },
    { id: "securite", label: "Sécurité", hint: "Mot de passe et appareils", icon: ShieldCheck, tone: "violet", group: "Mon compte" },
];

function SdrSettings() {
    const [active, select] = useSettingsSection(SECTIONS);
    return (
        <SettingsShell
            title="Paramètres"
            subtitle="Votre profil, votre journée de travail et la sécurité de votre compte."
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
            {active === "journee" && <WorkdaySection />}
            {active === "telephone" && <PhonePrefsPanel />}
            {active === "securite" && <SecuritySection />}
        </SettingsShell>
    );
}

export default function SdrSettingsPage() {
    return (
        <Suspense fallback={null}>
            <SdrSettings />
        </Suspense>
    );
}
