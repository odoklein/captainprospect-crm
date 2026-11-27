"use client";

// Client portal home: « La lettre de la semaine » (components/accueil/ClientHomeView).
// Confirmed RDV are live, so the letter is refetched while the tab is visible;
// every other figure is as of the last Monday 06:00 and does not move in between.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useToast } from "@/components/ui";
import { LaunchWarmupScreen, type PortalLaunchMission } from "@/components/portal/LaunchWarmupScreen";
import { DailyReportLauncher } from "@/components/client/DailyReportLauncher";
import { ClientHomeSkeleton, ClientHomeView } from "@/components/accueil/ClientHomeView";
import type { ClientLetter } from "@/lib/client-portal/letter";

interface PortalSettings {
    portalShowCallHistory: boolean;
    portalShowDatabase: boolean;
}

/** Confirmed RDV are the live part of the letter: refreshed this often while the tab is visible. */
const LIVE_REFRESH_MS = 90_000;

export default function ClientPortal() {
    const { data: session } = useSession();
    const toast = useToast();
    const [letter, setLetter] = useState<ClientLetter | null>(null);
    const [portalSettings, setPortalSettings] = useState<PortalSettings | null>(null);
    const [launchMissions, setLaunchMissions] = useState<PortalLaunchMission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const loaded = useRef(false);

    const userName = session?.user?.name?.split(" ")[0] ?? "";

    const fetchLetter = useCallback(async () => {
        const res = await fetch("/api/client/letter", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error(json?.error ?? "Lettre indisponible");
        setLetter(json.data as ClientLetter);
    }, []);

    const load = useCallback(async () => {
        setIsLoading(true);
        setFailed(false);
        const readJson = (res: Response) => res.json().catch(() => null);
        const [settings, launch, letterResult] = await Promise.allSettled([
            fetch("/api/client/portal/settings").then(readJson),
            fetch("/api/portal/launch-state", { cache: "no-store" }).then(readJson),
            fetchLetter(),
        ]);
        if (settings.status === "fulfilled" && settings.value?.success) setPortalSettings(settings.value.data);
        if (launch.status === "fulfilled" && launch.value?.success) setLaunchMissions(launch.value.data?.missions ?? []);
        if (letterResult.status === "rejected") {
            console.error("Failed to load the client letter:", letterResult.reason);
            setFailed(true);
            toast.error("Erreur de chargement", "Impossible de charger la lettre de la semaine");
        } else {
            loaded.current = true;
        }
        setIsLoading(false);
        // toast only exposes setters; re-creating load on its identity would refetch for nothing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchLetter]);

    useEffect(() => { load(); }, [load]);

    // Live part: refetch while visible, and as soon as the tab comes back.
    useEffect(() => {
        const refresh = () => {
            if (loaded.current && document.visibilityState === "visible") fetchLetter().catch(() => undefined);
        };
        const timer = window.setInterval(refresh, LIVE_REFRESH_MS);
        document.addEventListener("visibilitychange", refresh);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, [fetchLetter]);

    if (isLoading && !letter) return <ClientHomeSkeleton />;

    if (launchMissions.length > 0) {
        return <LaunchWarmupScreen missions={launchMissions} userName={userName || "Client"} />;
    }

    if (!letter && failed) {
        return (
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-5">
                <div>
                    <h2 className="font-semibold text-ink">La lettre de la semaine n’a pas pu être chargée</h2>
                    <p className="mt-1 text-sm text-ink-3">Réessayez dans un instant.</p>
                </div>
                <button type="button" onClick={() => load()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg">Réessayer</button>
            </div>
        );
    }

    if (!letter || !letter.hasMission) {
        return (
            <>
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-5">
                    <div>
                        <h2 className="font-semibold text-ink">Préparons votre prochaine mission</h2>
                        <p className="mt-1 text-sm text-ink-3">Partagez vos objectifs et votre cible avec l’agence. Votre lettre de la semaine démarrera avec la mission.</p>
                    </div>
                    <Link href="/client/missions" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg">Mes missions</Link>
                </div>
                <DailyReportLauncher />
            </>
        );
    }

    return (
        <>
            <ClientHomeView
                letter={letter}
                userName={userName}
                showCallHistory={!!portalSettings?.portalShowCallHistory}
                showDatabase={!!portalSettings?.portalShowDatabase}
                onAssumptionsSaved={() => { fetchLetter().catch(() => undefined); }}
            />

            {/* Floating "rapport de la veille" — appears from 7:30 each morning. */}
            <DailyReportLauncher />
        </>
    );
}
