"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { CalendarCheck, ExternalLink, Link2, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Shimmer } from "@/components/accueil/AccueilUI";
import {
    Field, FormStatus, INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON, SettingsCard, SettingsPage,
} from "@/components/settings/SettingsUI";
import {
    ClientNotificationsSection, PersonalInfoCard, ProfileHero, SecuritySection,
} from "@/components/settings/AccountPanels";

// ============================================
// /client/portal/settings — the client's account: profile (+ the company's
// booking link), notification preferences, security.
// ============================================


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
                <button type="submit" disabled={!dirty || saving} className={cn(PRIMARY_BUTTON, "sm:mt-7")}>
                    {saving && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden />}
                    Enregistrer
                </button>
            </form>
            {error && <div className="mt-3"><FormStatus error={error} /></div>}
        </SettingsCard>
    );
}

function ClientSettings() {
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
                            <BookingLinkCard />
                        </>
                    ),
                },
                { id: "notifications", label: "Notifications", content: <ClientNotificationsSection /> },
                { id: "securite", label: "Sécurité", content: <SecuritySection /> },
            ]}
        />
    );
}

export default function ClientPortalSettingsPage() {
    return (
        <Suspense fallback={null}>
            <ClientSettings />
        </Suspense>
    );
}
