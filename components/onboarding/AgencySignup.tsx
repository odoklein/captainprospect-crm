"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { ArrowRight, Building2 } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useBrand } from "@/lib/brand/client";
import { registrationSchema } from "@/lib/onboarding/self-service-schema";
import "./self-service.css";

export function AgencySignup({ token }: { token: string }) {
    const brand = useBrand();
    const { data: session, status } = useSession();
    const [available, setAvailable] = useState<boolean | null>(null);
    const [linkError, setLinkError] = useState("");
    const [retry, setRetry] = useState(0);
    const [busy, setBusy] = useState(false);
    const [created, setCreated] = useState(false);
    const [error, setError] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        const controller = new AbortController();
        setAvailable(null); setLinkError("");
        fetch(`/api/onboarding/${encodeURIComponent(token)}`, { signal: controller.signal, cache: "no-store" })
            .then(async (response) => {
                const json = await response.json();
                if (controller.signal.aborted) return;
                if (response.status === 404) setAvailable(false);
                else if (!response.ok || !json.success) throw new Error("Impossible de vérifier le lien pour le moment.");
                else setAvailable(true);
            }).catch((error) => { if (!controller.signal.aborted) setLinkError(error.message || "Serveur injoignable."); });
        return () => controller.abort();
    }, [token, retry]);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); setError("");
        const parsed = registrationSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
        if (!parsed.success) {
            setFieldErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path[0], issue.message])));
            return;
        }
        setFieldErrors({}); setBusy(true);
        try {
            const response = await fetch(`/api/onboarding/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
            const json = await response.json();
            if (!response.ok || !json.success) throw new Error(json.error || "Impossible de créer votre espace.");
            // If authentication fails after registration, expose sign-in rather than resubmitting signup.
            setCreated(true);
            const login = await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirect: false });
            if (login?.ok && !login.error) window.location.assign("/client/missions?new=1");
            else setError("Votre compte est créé. Connectez-vous pour retrouver votre espace.");
        } catch (error) { setError(error instanceof Error ? error.message : "Une erreur est survenue."); }
        finally { setBusy(false); }
    }

    // One key per screen state: each change remounts the view, so it reveals again.
    const view = linkError ? "error" : available === null || status === "loading" ? "loading" : !available ? "unavailable" : created ? "created" : session ? "session" : "form";

    return <main className="ss-signup">
        <section className="ss-intro" onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            event.currentTarget.style.setProperty("--ss-mx", `${event.clientX - box.left}px`);
            event.currentTarget.style.setProperty("--ss-my", `${event.clientY - box.top}px`);
        }}>
            <Link href="/login" className="ss-wordmark">{brand.name}<span>Espace client</span></Link>
            <div>
                <p className="ss-eyebrow">Votre prochain chapitre commercial</p>
                <h1 className="ss-title"><span><span>Votre ambition.</span></span> <span><span>Notre point de départ.</span></span></h1>
                <p className="ss-lede">Créez votre espace, présentez votre projet et préparons ensemble votre prochaine mission de prospection.</p>
                <ol className="ss-steps">
                    <li aria-current={view === "created" ? undefined : "step"} data-done={view === "created" || undefined}><span>01</span><div><strong>Un espace à vous</strong><p>Votre entreprise, votre compte et vos missions.</p></div></li>
                    <li aria-current={view === "created" ? "step" : undefined}><span>02</span><div><strong>Un brief qui donne le cap</strong><p>Vos objectifs, vos cibles et votre offre.</p></div></li>
                    <li><span>03</span><div><strong>Un lancement accompagné</strong><p>L’agence prépare et active votre mission.</p></div></li>
                </ol>
            </div>
            <p className="ss-intro-foot">{brand.name} · Prospection B2B</p>
        </section>
        <section className="ss-signup-content" aria-label="Inscription client">
            <div className="ss-signup-card">
                <div key={view} className="ss-view" data-view={view}>
                {view === "created" ? <div className="ss-success-mark" aria-hidden><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M15.5 27.5l7 7 14-15" /></svg></div>
                : <Building2 className="ss-section-icon" aria-hidden />}
                {view === "error" ? <><h2>Vérification interrompue</h2><p role="alert">{linkError}</p><Button onClick={() => setRetry((value) => value + 1)}>Réessayer</Button></>
                : view === "loading" ? <div className="ss-loading" role="status"><p><span className="ss-pulse" aria-hidden />Vérification de votre invitation…</p><span aria-hidden /><span aria-hidden /><span aria-hidden /></div>
                : view === "unavailable" ? <><h2>Invitation indisponible</h2><p>Ce lien a été désactivé ou n’existe pas. Demandez un nouveau lien à votre agence.</p><Link className="ss-text-link" href="/login">J’ai déjà un compte</Link></>
                : view === "created" ? <><h2>Votre espace est créé</h2><p role="status">{error || "Connexion à votre espace…"}</p>{!error && <div className="ss-progress-bar" aria-hidden><span /></div>}<Link className="ss-text-link" href="/login?callbackUrl=%2Fclient%2Fmissions">Accéder à mon espace <ArrowRight size={16} /></Link></>
                : view === "session" && session ? <><h2>Vous êtes déjà connecté</h2>{session.user.role === "CLIENT" ? <><p>Retrouvez vos missions dans votre espace client.</p><Link className="ss-text-link" href="/client/missions">Accéder à mes missions <ArrowRight size={16} /></Link></> : <><p>Cette invitation s’adresse aux nouveaux clients. Déconnectez-vous pour créer un espace client.</p><Button variant="secondary" onClick={() => void signOut({ callbackUrl: `/onboarding/invite/${token}` })}>Se déconnecter</Button></>}</>
                : <><p className="ss-eyebrow">Bienvenue chez {brand.name}</p><h2>Créons votre espace</h2><p>Quelques informations pour commencer. Vous pourrez ensuite créer votre première mission.</p>
                    <form onSubmit={submit} className="ss-form" noValidate>
                        <Input label="Entreprise" name="companyName" autoComplete="organization" maxLength={200} required error={fieldErrors.companyName} />
                        <Input label="Votre nom" name="name" autoComplete="name" maxLength={200} required error={fieldErrors.name} />
                        <Input label="Email professionnel" name="email" type="email" autoComplete="email" maxLength={254} required error={fieldErrors.email} />
                        <Input label="Mot de passe" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={72} hint="Au moins 10 caractères." required error={fieldErrors.password} />
                        {error && <p key={error} role="alert" className="ss-error ss-error-flash">{error}</p>}
                        <Button type="submit" isLoading={busy} fullWidth className="ss-submit" rightIcon={<ArrowRight size={16} />}>Créer mon espace client</Button>
                    </form>
                    <p className="ss-signin">Déjà un compte ? <Link href="/login?callbackUrl=%2Fclient%2Fmissions">Se connecter</Link></p>
                </>}
                </div>
            </div>
        </section>
    </main>;
}
