"use client";

import { Suspense } from "react";
import { PhonePrefsPanel } from "@/components/settings/PhonePrefsPanel";
import { SettingsPage } from "@/components/settings/SettingsUI";
import { PersonalInfoCard, ProfileHero, SecuritySection } from "@/components/settings/AccountPanels";

// ============================================
// /bd/settings — the BD's personal settings, on one page (same as /sdr/settings,
// without the SDR's call goal). ?section= scrolls to a section.
// ============================================

function BdSettings() {
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
                        </>
                    ),
                },
                { id: "telephone", label: "Ma ligne", description: "Votre numéro, votre messagerie et vos alertes d'appel.", content: <PhonePrefsPanel /> },
                { id: "securite", label: "Sécurité", content: <SecuritySection /> },
            ]}
            aliases={{ alertes: "telephone" }}
        />
    );
}

export default function BdSettingsPage() {
    return (
        <Suspense fallback={null}>
            <BdSettings />
        </Suspense>
    );
}
