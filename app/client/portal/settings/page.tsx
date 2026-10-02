"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Bell, CalendarCheck, ExternalLink, Link2, Loader2, ShieldCheck, User } from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Shimmer } from "@/components/accueil/AccueilUI";
import {
    Field, FormStatus, INPUT, SECONDARY_BUTTON, SettingsCard, SettingsShell, useSettingsSection, type SettingsSectionDef,
} from "@/components/settings/SettingsUI";
import {
    AccountHeaderPills, ClientNotificationsSection, PersonalInfoCard, ProfileHero, SecuritySection,
} from "@/components/settings/AccountPanels";

// ============================================
// /client/portal/settings — the client's account: profile (+ the company's
// booking link), notification preferences, security.
// ============================================

const SECTIONS: SettingsSectionDef[] = [
    { id: "profil", label: "Mon profil", hint: "Photo, coordonnées, réservation", icon: User, tone: "indigo", group: "Mon compte" },
    { id: "notifications", label: "Notifications", hint: "Alertes et rappels", icon: Bell, tone: "amber", group: "Mon compte" },
    { id: "securite", label: "Sécurité", hint: "Mot de passe et appareils", icon: ShieldCheck, tone: "violet", group: "Mon compte" },
];

function BookingLinkCard() {
    const { data: session } = useSession();
    const { data, isLoading } = useQuery({
        queryKey: ["client", "me", "settings", session?.user?.id ?? ""],
        enabled: Boolean(session?.user?.id),
        queryFn: async (): Promise<string> => {
            const res = await fetch("/api/client/me/settings");
            const json = await res.json();
            return json.success ? (json.data?.bookingUrl ?? "") : "";
        },
    });
    if (isLoading || data === undefined) return <Shimmer className="h-[180px] rounded-3xl" />;
    return <BookingLinkForm initial={data} />;
}

function BookingLinkForm({ initial }: { initial: string }) {
    const toast = useToast();
    const [baseline, setBaseline] = useState(initial);
    const [url, setUrl] = useState(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const dirty = url.trim() !== baseline;

    const save = async (e: FormEvent) => {
        e.preventDefault();
        if (!dirty) return;
        const value = url.trim();
        if (value && !/^https?:\/\/\S+\.\S+/.test(value)) {
            setError("Saisissez une adresse complète, commençant par https://");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/client/me/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookingUrl: value }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error === "Données invalides" ? "Adresse invalide" : json.error);
            setBaseline(value);
            setUrl(value);
            toast.success("Lien de réservation enregistré", "L'équipe l'utilisera pour planifier vos RDV.");
        } catch (err) {
            setError(err instanceof Error && err.message ? err.message : "Enregistrement impossible");
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsCard
            icon={CalendarCheck}
            tone="emerald"
            title="Lien de réservation"
            subtitle="Utilisé par l'équipe pour planifier vos rendez-vous"
            right={
                baseline ? (
                    <a href={baseline} target="_blank" rel="noopener noreferrer" className={SECONDARY_BUTTON}>
                        <ExternalLink className="w-3.5 h-3.5 text-emerald-600" aria-hidden />
                        Tester le lien
                    </a>
                ) : undefined
            }
        >
            <form onSubmit={save} className="flex flex-col sm:flex-row sm:items-start gap-3">
                <Field label="Adresse de votre agenda" icon={Link2} className="flex-1" hint="Calendly, Google Agenda, HubSpot, Microsoft Bookings…">
                    {(id) => (
                        <input
                            id={id}
                            type="url"
                            inputMode="url"
                            value={url}
                            onChange={(e) => {
                                setUrl(e.target.value);
                                setError(null);
                            }}
                            placeholder="https://calendly.com/votre-lien"
                            className={cn(INPUT, "pl-10")}
                        />
                    )}
                </Field>
                <button
                    type="submit"
                    disabled={!dirty || saving}
                    className={cn(
                        "sm:mt-[26px] inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-black shadow-[0_4px_12px_rgba(9,9,11,0.18)] transition-colors disabled:opacity-40 disabled:pointer-events-none",
                        "outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45 focus-visible:ring-offset-2",
                    )}
                >
                    {saving && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden />}
                    Enregistrer
                </button>
            </form>
            {error && <div className="mt-3"><FormStatus error={error} /></div>}
        </SettingsCard>
    );
}

function ClientSettings() {
    const [active, select] = useSettingsSection(SECTIONS);
    return (
        <SettingsShell
            title="Paramètres"
            subtitle="Gérez vos informations, vos alertes et la sécurité de votre compte."
            pills={<AccountHeaderPills />}
            sections={SECTIONS}
            active={active}
            onSelect={select}
        >
            {active === "profil" && (
                <>
                    <ProfileHero />
                    <PersonalInfoCard />
                    <BookingLinkCard />
                </>
            )}
            {active === "notifications" && <ClientNotificationsSection />}
            {active === "securite" && <SecuritySection />}
        </SettingsShell>
    );
}

export default function ClientPortalSettingsPage() {
    return (
        <Suspense fallback={null}>
            <ClientSettings />
        </Suspense>
    );
}
