"use client";

import { Suspense } from "react";
import { BellRing, Key, Link2, Mail, Palette, Plug, ShieldCheck, Target, User } from "lucide-react";
import { SettingsShell, useSettingsSection, type SettingsSectionDef } from "@/components/settings/SettingsUI";
import { LEEXI_SETTINGS_ANCHOR } from "@/lib/notetakers/guide";
import {
    AccountHeaderPills, DesktopNotificationsCard, PersonalInfoCard, ProfileHero, SecuritySection,
} from "@/components/settings/AccountPanels";
import { BrandingPanel } from "./BrandingPanel";
import { IntegrationKeysPanel } from "./IntegrationKeysPanel";
import { McpPanel } from "./McpPanel";
import { EmailsPanel, IntegrationsPanel, MasterPasswordPanel, TeamGoalsPanel } from "./PlatformPanels";

// ============================================
// /manager/settings — the manager's own account (profile, alerts, security) and
// the platform configuration (team objective, transactional emails, Leexi,
// master password). Sub-pages (statuts, emails de sécurité) stay where they were.
// ============================================

const SECTIONS: SettingsSectionDef[] = [
    { id: "profil", label: "Profil", hint: "Photo et coordonnées", icon: User, tone: "indigo", group: "Mon compte" },
    { id: "alertes", label: "Alertes", hint: "Notifications du bureau", icon: BellRing, tone: "amber", group: "Mon compte" },
    { id: "securite", label: "Sécurité", hint: "Mot de passe et appareils", icon: ShieldCheck, tone: "violet", group: "Mon compte" },
    { id: "identite", label: "Identité", hint: "Nom, couleurs, logos", icon: Palette, tone: "violet", group: "Plateforme" },
    { id: "equipe", label: "Équipe & objectifs", hint: "Quota d'appels, statuts", icon: Target, tone: "emerald", group: "Plateforme" },
    { id: "emails", label: "Emails & modèles", hint: "Expéditeur, email de RDV", icon: Mail, tone: "indigo", group: "Plateforme" },
    { id: "integrations", label: "Intégrations", hint: "Clés OpenAI, Allo, enregistreurs…", icon: Link2, tone: "teal", group: "Plateforme" },
    { id: "mcp", label: "Connexion IA (MCP)", hint: "Clé pour ChatGPT, Claude", icon: Plug, tone: "violet", group: "Plateforme" },
    { id: "acces", label: "Accès maître", hint: "Mot de passe maître", icon: Key, tone: "amber", group: "Plateforme" },
];

function ManagerSettings() {
    const [active, select] = useSettingsSection(SECTIONS);
    return (
        <SettingsShell
            title="Paramètres"
            subtitle="Votre compte, et la configuration de la plateforme pour toute l'équipe."
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
            {active === "identite" && <BrandingPanel />}
            {active === "equipe" && <TeamGoalsPanel />}
            {active === "emails" && <EmailsPanel />}
            {active === "integrations" && (
                <>
                    <IntegrationKeysPanel />
                    <div id={LEEXI_SETTINGS_ANCHOR} className="scroll-mt-24">
                        <IntegrationsPanel />
                    </div>
                </>
            )}
            {active === "mcp" && <McpPanel />}
            {active === "acces" && <MasterPasswordPanel />}
        </SettingsShell>
    );
}

export default function ManagerSettingsPage() {
    return (
        <Suspense fallback={null}>
            <ManagerSettings />
        </Suspense>
    );
}
