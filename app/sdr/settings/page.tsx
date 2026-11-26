"use client";

import { Suspense } from "react";
import { PhonePrefsPanel } from "@/components/settings/PhonePrefsPanel";
import { SettingsPage } from "@/components/settings/SettingsUI";
import { ManagerSetCard, PersonalInfoCard, ProfileHero, SecuritySection } from "@/components/settings/AccountPanels";

// ============================================
// /sdr/settings — personal settings of SDRs, Bookers and BDs, on one page.
// What an SDR changes every day (pause the line, switch headset, allow alerts)
// is on the sidebar avatar; what the manager sets is one read-only card in the
// profile. What is left is written once: hence no section navigation.
// ?section= (from the account menu) scrolls to a section; old ids still land.
// ============================================

function SdrSettings() {
    return (
        <SettingsPage
            title="Paramètres"
            sections={[
                {
                    id: "profil",
                    label: "Profil",
                    content: (
                        <>
                            <ProfileHero />
                            <PersonalInfoCard />
                            <ManagerSetCard />
                        </>
                    ),
                },
                { id: "telephone", label: "Ma ligne", description: "Votre numéro, votre messagerie et vos alertes d'appel.", content: <PhonePrefsPanel /> },
                { id: "securite", label: "Sécurité", content: <SecuritySection /> },
            ]}
            aliases={{ journee: "profil", alertes: "telephone" }}
        />
    );
}

export default function SdrSettingsPage() {
    return (
        <Suspense fallback={null}>
            <SdrSettings />
        </Suspense>
    );
}
