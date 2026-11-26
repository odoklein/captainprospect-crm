"use client";

import { Suspense } from "react";
import { Code2, Link2, ListOrdered, Mail, Palette, PhoneCall, ScrollText, ShieldCheck, Target, User, UserCog } from "lucide-react";
import { PhonePrefsPanel } from "@/components/settings/PhonePrefsPanel";
import {
    SettingsLinkRow, SettingsShell, useSettingsSection, type SectionAliases, type SettingsSectionDef,
} from "@/components/settings/SettingsUI";
import { LEEXI_SETTINGS_ANCHOR } from "@/lib/notetakers/guide";
import { PersonalInfoCard, ProfileHero, SecuritySection } from "@/components/settings/AccountPanels";
import { BrandingPanel } from "./BrandingPanel";
import { IntegrationKeysPanel } from "./IntegrationKeysPanel";
import { McpPanel } from "./McpPanel";
import { SalesEnginePanel } from "./SalesEnginePanel";
import { TELEPHONY_LINES_ANCHOR, TelephonyPanel } from "./TelephonyPanel";
import { EmailsPanel, IntegrationsPanel, MasterPasswordPanel, TeamGoalsPanel } from "./PlatformPanels";

// ============================================
// /manager/settings — the agency's settings first, ordered by how often a manager
// comes back to them (the team's goal, who calls with which number, how calls
// are dialed and classified), then the set-once ones (messages, brand, tools),
// then the manager's own account at the bottom.
//
// Each subject has one home: everything telephony is under Téléphonie (numbers,
// dialing, after-call, statuses, the line providers' keys), the email sender is
// only under Messages, every key that plugs a tool in is under Intégrations.
// Old ?section= ids keep working through the aliases.
// ============================================

const SECTIONS: SettingsSectionDef[] = [
    { id: "equipe", label: "Équipe", hint: "Objectif d'appels et rythme", icon: Target, group: "Agence",
      keywords: "objectif quota rythme appels par jour heures sdr" },
    { id: "telephonie", label: "Téléphonie", hint: "Numéros, numérotation, statuts, lignes", icon: PhoneCall, group: "Agence",
      keywords: "twilio numeros qui appelle parallele numerotation plages horaires abandons apres l'appel automatisation statuts categories resultat onoff allo lignes fournisseurs" },
    { id: "emails", label: "Messages", hint: "Expéditeur et modèles d'emails", icon: Mail, group: "Agence",
      keywords: "email expediteur from smtp modele confirmation rdv securite mot de passe otp notifications boites mail" },
    { id: "identite", label: "Marque", hint: "Nom, couleurs, logos, langue", icon: Palette, group: "Agence",
      keywords: "marque identite logo couleurs police langue region devise url site" },
    { id: "integrations", label: "Intégrations", hint: "IA, enregistreurs, données, MCP", icon: Link2, group: "Agence",
      keywords: "cle api openai mistral deepseek leexi fireflies gong serper mcp chatgpt claude cursor api rest" },
    { id: "acces", label: "Sécurité de l'agence", hint: "Mot de passe maître, journal d'audit", icon: ShieldCheck, group: "Agence",
      keywords: "master mot de passe maitre support audit journal" },
    { id: "profil", label: "Profil", hint: "Photo, nom, téléphone", icon: User, group: "Mon compte",
      keywords: "nom email photo avatar fuseau horaire" },
    { id: "telephone", label: "Ma ligne", hint: "Messagerie, SMS, audio", icon: UserCog, group: "Mon compte",
      keywords: "messagerie repondeur sms signature micro casque audio appels entrants notifications" },
    { id: "securite", label: "Sécurité", hint: "Mot de passe, appareils", icon: ShieldCheck, group: "Mon compte",
      keywords: "mot de passe appareils connexion historique" },
];

const ALIASES: SectionAliases = {
    mcp: "integrations#mcp",
    alertes: "telephone",
    statuts: "telephonie#statuts",
    lignes: `telephonie#${TELEPHONY_LINES_ANCHOR}`,
};

function ManagerSettings() {
    const [active, select] = useSettingsSection(SECTIONS, ALIASES);
    return (
        <SettingsShell title="Paramètres" subtitle="L'agence, puis votre compte." sections={SECTIONS} active={active} onSelect={select}>
            {active === "equipe" && <TeamGoalsPanel />}
            {active === "telephonie" && (
                <>
                    <TelephonyPanel />
                    <SalesEnginePanel />
                    <div id="statuts" className="scroll-mt-6">
                        <SettingsLinkRow
                            href="/manager/settings/statuses"
                            icon={ListOrdered}
                            title="Statuts et catégories de résultat"
                            description="Ce que le SDR choisit à la fin d'un appel (touches 1 à 9), et la catégorie de chaque statut dans les rapports."
                        />
                    </div>
                    <div id={TELEPHONY_LINES_ANCHOR} className="scroll-mt-6 pt-4">
                        <IntegrationKeysPanel groups={["telephony"]} title="Lignes et fournisseurs" />
                    </div>
                </>
            )}
            {active === "emails" && <EmailsPanel />}
            {active === "identite" && <BrandingPanel />}
            {active === "integrations" && (
                <>
                    <IntegrationKeysPanel groups={["ai", "meetings", "data"]} />
                    <div id={LEEXI_SETTINGS_ANCHOR} className="scroll-mt-6">
                        <IntegrationsPanel />
                    </div>
                    <div id="mcp" className="scroll-mt-6 space-y-6">
                        <McpPanel />
                    </div>
                    <SettingsLinkRow
                        href="/manager/api"
                        icon={Code2}
                        title="API REST"
                        description="Les clés de l'API publique, pour relier le CRM à vos propres outils."
                    />
                </>
            )}
            {active === "acces" && (
                <>
                    <MasterPasswordPanel />
                    <SettingsLinkRow
                        href="/manager/audit"
                        icon={ScrollText}
                        title="Journal d'audit"
                        description="Qui a fait quoi dans le CRM, et quand."
                    />
                </>
            )}
            {active === "profil" && (
                <>
                    <ProfileHero />
                    <PersonalInfoCard />
                </>
            )}
            {active === "telephone" && <PhonePrefsPanel />}
            {active === "securite" && <SecuritySection />}
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
