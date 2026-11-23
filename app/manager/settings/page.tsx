"use client";

import { Suspense } from "react";
import { PhonePrefsPanel } from "@/components/settings/PhonePrefsPanel";
import { BellRing, Key, Phone, Link2, Mail, Palette, PhoneCall, Plug, ShieldCheck, Target, User } from "lucide-react";
import { SettingsShell, useSettingsSection, type SettingsSectionDef } from "@/components/settings/SettingsUI";
import { LEEXI_SETTINGS_ANCHOR } from "@/lib/notetakers/guide";
import {
    DesktopNotificationsCard, PersonalInfoCard, ProfileHero, SecuritySection,
} from "@/components/settings/AccountPanels";
import { BrandingPanel } from "./BrandingPanel";
import { IntegrationKeysPanel } from "./IntegrationKeysPanel";
import { McpPanel } from "./McpPanel";
import { TelephonyPanel } from "./TelephonyPanel";
import { EmailsPanel, IntegrationsPanel, MasterPasswordPanel, TeamGoalsPanel } from "./PlatformPanels";

// ============================================
// /manager/settings — the manager's own account (profile, alerts, security) and
// the platform configuration (team objective, transactional emails, Leexi,
// master password). Sub-pages (statuts, emails de sécurité) stay where they were.
// ============================================

const SECTIONS: SettingsSectionDef[] = [
    { id: "profil", label: "Profil", hint: "Photo, nom, téléphone", icon: User, tone: "indigo", group: "Mon compte",
      description: "Votre photo et vos coordonnées.", keywords: "nom email photo avatar fuseau" },
    { id: "alertes", label: "Notifications", hint: "Alertes du bureau", icon: BellRing, tone: "amber", group: "Mon compte",
      description: "Ce qui vous prévient pendant la journée.", keywords: "alertes notifications bureau" },
    { id: "telephone", label: "Mon téléphone", hint: "Appels entrants, messagerie", icon: Phone, tone: "teal", group: "Mon compte",
      description: "Comment vos appels entrants vous arrivent.", keywords: "appels entrants messagerie sonnerie" },
    { id: "securite", label: "Sécurité", hint: "Mot de passe, appareils", icon: ShieldCheck, tone: "violet", group: "Mon compte",
      description: "Mot de passe, appareils connectés et historique de connexion.", keywords: "mot de passe appareils connexion" },
    { id: "identite", label: "Identité de l'agence", hint: "Nom, couleurs, logos", icon: Palette, tone: "violet", group: "Agence",
      description: "Le nom, les couleurs et les logos que voit toute l'équipe.", keywords: "marque logo couleurs branding" },
    { id: "equipe", label: "Équipe & objectifs", hint: "Quota d'appels, statuts", icon: Target, tone: "emerald", group: "Agence",
      description: "Les objectifs de l'équipe et les statuts d'appel.", keywords: "objectifs quota statuts" },
    { id: "emails", label: "Emails", hint: "Expéditeur, modèles", icon: Mail, tone: "indigo", group: "Agence",
      description: "L'expéditeur et les modèles des emails envoyés par la plateforme.", keywords: "smtp expediteur modeles rdv" },
    { id: "integrations", label: "Intégrations", hint: "Onoff, OpenAI, Allo…", icon: Link2, tone: "teal", group: "Connexions",
      description: "Les outils branchés au CRM : téléphonie, IA, enregistreurs, données.",
      keywords: "cle api onoff openai allo mistral leexi fireflies gong serper historique appels enregistrements" },
    { id: "telephonie", label: "Téléphone intégré", hint: "Numéros Twilio par personne", icon: PhoneCall, tone: "emerald", group: "Connexions",
      description: "Les numéros Twilio attribués à chaque personne pour appeler depuis le CRM.", keywords: "twilio numeros softphone" },
    { id: "mcp", label: "Connexion IA (MCP)", hint: "ChatGPT, Claude", icon: Plug, tone: "violet", group: "Connexions",
      description: "Une clé pour brancher ChatGPT ou Claude sur vos données.", keywords: "mcp chatgpt claude cle" },
    { id: "acces", label: "Accès maître", hint: "Mot de passe maître", icon: Key, tone: "amber", group: "Avancé",
      description: "Le mot de passe qui ouvre n'importe quel compte, pour le support.", keywords: "master mot de passe support" },
];

function ManagerSettings() {
    const [active, select] = useSettingsSection(SECTIONS);
    return (
        <SettingsShell
            title="Paramètres"
            subtitle="Votre compte et la configuration de l'agence."
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
            {active === "telephone" && <PhonePrefsPanel />}
            {active === "securite" && <SecuritySection />}
            {active === "identite" && <BrandingPanel />}
            {active === "equipe" && <TeamGoalsPanel />}
            {active === "emails" && <EmailsPanel />}
            {active === "telephonie" && <TelephonyPanel />}
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
