"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Check, Loader2, Lock, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Entry screen of the client portal: "Vérification de votre accès".
 *
 * Every line is a real check, never decoration — a trust screen that could be
 * caught faking it would cost more trust than it earns:
 *  1. the connection is encrypted (the page is served over HTTPS),
 *  2. the session is authenticated and the account still active,
 *  3. the account is attached to an existing client space (its name is shown).
 * 2 and 3 come from /api/client/access-check. Shown once per browser session;
 * the portal keeps loading underneath, so no time is actually lost.
 */

const SEEN_KEY = "cp_portal_access_checked";
/** Long enough to read the three lines, short enough to never feel like a wait. */
const MIN_VISIBLE_MS = 1500;
const STEP_MS = 380;

type StepState = "pending" | "ok" | "fail";
interface Step {
    label: string;
    detail?: string;
    state: StepState;
}

function alreadyCheckedThisSession(): boolean {
    try {
        return sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
        return false;
    }
}

export function PortalAccessGate() {
    const [visible, setVisible] = useState(() => typeof window !== "undefined" && !alreadyCheckedThisSession());
    const [leaving, setLeaving] = useState(false);
    const [steps, setSteps] = useState<Step[]>([
        { label: "Connexion chiffrée", state: "pending" },
        { label: "Session authentifiée", state: "pending" },
        { label: "Accès à votre espace", state: "pending" },
    ]);
    const [outcome, setOutcome] = useState<"checking" | "ok" | "denied" | "error">("checking");

    const setStep = (i: number, patch: Partial<Step>) =>
        setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

    const run = useCallback(async () => {
        setOutcome("checking");
        setSteps((prev) => prev.map((s) => ({ ...s, state: "pending", detail: undefined })));
        const startedAt = Date.now();
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        const pause = (ms: number) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));

        const request = fetch("/api/client/access-check", { cache: "no-store" })
            .then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => null) }))
            .catch(() => null);

        // 1. Encryption — read from the page itself.
        await pause(STEP_MS);
        const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
        const encrypted = window.location.protocol === "https:";
        setStep(0, {
            state: encrypted || isLocal ? "ok" : "fail",
            detail: encrypted ? "HTTPS / TLS" : isLocal ? "Environnement local" : "Connexion non chiffrée",
        });

        const res = await request;
        const data = res?.ok && res.json?.success ? res.json.data : null;

        // 2. Session + active account.
        await pause(STEP_MS);
        if (!res) {
            setStep(1, { state: "fail", detail: "Serveur injoignable" });
            setOutcome("error");
            return;
        }
        const sessionOk = !!data?.sessionValid && !!data?.accountActive;
        setStep(1, { state: sessionOk ? "ok" : "fail", detail: sessionOk ? "Compte actif" : "Session expirée ou compte inactif" });

        // 3. Client space.
        await pause(STEP_MS);
        const spaceName: string | null = data?.clientSpace?.name ?? null;
        setStep(2, { state: spaceName ? "ok" : "fail", detail: spaceName ?? "Aucun espace client rattaché" });

        if (!sessionOk || !spaceName) {
            setOutcome("denied");
            return;
        }

        setOutcome("ok");
        const elapsed = Date.now() - startedAt;
        await pause(Math.max(450, MIN_VISIBLE_MS - elapsed));
        try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* storage unavailable: shown again next load */ }
        setLeaving(true);
        await pause(350);
        setVisible(false);
    }, []);

    useEffect(() => {
        if (visible) void run();
        // Run once on mount; retries call run() directly.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Lock page scroll while the screen is up.
    useEffect(() => {
        if (!visible) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [visible]);

    if (!visible) return null;

    const done = outcome === "ok";

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="portal-gate-title"
            aria-live="polite"
            className={cn(
                "fixed inset-0 z-[200] flex items-center justify-center bg-[#EEF1FB] px-4 transition-opacity duration-300",
                leaving ? "opacity-0" : "opacity-100"
            )}
        >
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-cover bg-bottom opacity-80"
                style={{ backgroundImage: "url('/login-bg.webp')" }}
            />

            <div className="relative w-full max-w-[380px] rounded-2xl border border-[#E4E6EF] bg-white/95 p-6 shadow-[0_12px_40px_-12px_rgba(39,53,95,0.25)] backdrop-blur-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logocaptainblue-rose.png" alt="Captain Prospect" className="mx-auto h-6 w-auto" />

                <div className="mt-6 flex flex-col items-center text-center">
                    <span
                        className={cn(
                            "flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-300",
                            done ? "bg-emerald-50 text-emerald-600" : outcome === "checking" ? "bg-[#27355F]/5 text-[#27355F]" : "bg-red-50 text-red-600"
                        )}
                    >
                        {done ? <ShieldCheck className="h-6 w-6" /> : outcome === "checking" ? <Lock className="h-5 w-5" /> : <X className="h-5 w-5" />}
                    </span>
                    <h1 id="portal-gate-title" className="mt-3 text-[15px] font-semibold text-[#1A1D2E]">
                        {done ? "Accès vérifié" : outcome === "checking" ? "Vérification de votre accès" : outcome === "denied" ? "Accès non autorisé" : "Vérification impossible"}
                    </h1>
                    <p className="mt-1 text-[12.5px] text-[#8A90A8]">
                        {done
                            ? "Bienvenue dans votre espace sécurisé."
                            : outcome === "checking"
                                ? "Nous sécurisons votre connexion à votre espace client."
                                : outcome === "denied"
                                    ? "Votre compte n'a pas accès à cet espace. Contactez votre chargé de compte."
                                    : "Le serveur ne répond pas. Vérifiez votre connexion internet."}
                    </p>
                </div>

                <ul className="mt-5 space-y-2">
                    {steps.map((s) => (
                        <li
                            key={s.label}
                            className="flex items-center gap-3 rounded-xl border border-[#EEF0F6] bg-[#F9FAFD] px-3 py-2.5"
                        >
                            <span
                                className={cn(
                                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                                    s.state === "ok" ? "bg-emerald-500 text-white" : s.state === "fail" ? "bg-red-500 text-white" : "bg-white text-[#A3A8BD] ring-1 ring-[#E4E6EF]"
                                )}
                            >
                                {s.state === "ok" ? <Check className="h-3.5 w-3.5" /> : s.state === "fail" ? <X className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-medium text-[#1A1D2E]">{s.label}</div>
                                {s.detail && <div className="truncate text-[11.5px] text-[#8A90A8]">{s.detail}</div>}
                            </div>
                        </li>
                    ))}
                </ul>

                {outcome === "error" && (
                    <button
                        type="button"
                        onClick={() => void run()}
                        className="mt-5 h-10 w-full rounded-lg bg-[#27355F] text-[13.5px] font-medium text-white hover:bg-[#1E2A4D]"
                    >
                        Réessayer
                    </button>
                )}
                {outcome === "denied" && (
                    <button
                        type="button"
                        onClick={() => void signOut({ callbackUrl: "/login" })}
                        className="mt-5 h-10 w-full rounded-lg border border-[#E4E6EF] bg-white text-[13.5px] font-medium text-[#1A1D2E] hover:bg-[#F6F7FB]"
                    >
                        Se déconnecter
                    </button>
                )}
            </div>
        </div>
    );
}
