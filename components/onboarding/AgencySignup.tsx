"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { ArrowRight, Check, Building2 } from "lucide-react";
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

    return <main className="ss-signup">
        <section className="ss-intro">
            <Link href="/login" className="ss-wordmark">{brand.name}<span>Espace client</span></Link>
            <div>
                <p className="ss-eyebrow">Votre prochain chapitre commercial</p>
                <h1>Votre ambition.<br />Notre point de départ.</h1>
                <p className="ss-lede">Créez votre espace, présentez votre projet et préparons ensemble votre prochaine mission de prospection.</p>
                <ol className="ss-steps">
                    <li><span>01</span><div><strong>Un espace à vous</strong><p>Votre entreprise, votre compte et vos missions.</p></div></li>
                    <li><span>02</span><div><strong>Un brief qui donne le cap</strong><p>Vos objectifs, vos cibles et votre offre.</p></div></li>
                    <li><span>03</span><div><strong>Un lancement accompagné</strong><p>L’agence prépare et active votre mission.</p></div></li>
                </ol>
            </div>
            <p className="ss-intro-foot">{brand.name} · Prospection B2B</p>
        </section>
        <section className="ss-signup-content" aria-label="Inscription client">
            <div className="ss-signup-card">
                <Building2 className="ss-section-icon" aria-hidden />
                {linkError ? <><h2>Vérification interrompue</h2><p role="alert">{linkError}</p><Button onClick={() => setRetry((value) => value + 1)}>Réessayer</Button></>
                : available === null || status === "loading" ? <p role="status">Vérification de votre invitation…</p>
                : !available ? <><h2>Invitation indisponible</h2><p>Ce lien a été désactivé ou n’existe pas. Demandez un nouveau lien à votre agence.</p><Link className="ss-text-link" href="/login">J’ai déjà un compte</Link></>
                : created ? <><Check className="text-emerald-600" aria-hidden /><h2>Votre espace est créé</h2><p role="status">{error || "Connexion à votre espace…"}</p><Link className="ss-text-link" href="/login?callbackUrl=%2Fclient%2Fmissions">Accéder à mon espace</Link></>
                : session ? <><h2>Vous êtes déjà connecté</h2>{session.user.role === "CLIENT" ? <><p>Retrouvez vos missions dans votre espace client.</p><Link className="ss-text-link" href="/client/missions">Accéder à mes missions <ArrowRight size={16} /></Link></> : <><p>Cette invitation s’adresse aux nouveaux clients. Déconnectez-vous pour créer un espace client.</p><Button variant="secondary" onClick={() => void signOut({ callbackUrl: `/onboarding/invite/${token}` })}>Se déconnecter</Button></>}</>
                : <><p className="ss-eyebrow">Bienvenue chez {brand.name}</p><h2>Créons votre espace</h2><p>Quelques informations pour commencer. Vous pourrez ensuite créer votre première mission.</p>
                    <form onSubmit={submit} className="ss-form" noValidate>
                        <Input label="Entreprise" name="companyName" autoComplete="organization" maxLength={200} required error={fieldErrors.companyName} />
                        <Input label="Votre nom" name="name" autoComplete="name" maxLength={200} required error={fieldErrors.name} />
                        <Input label="Email professionnel" name="email" type="email" autoComplete="email" maxLength={254} required error={fieldErrors.email} />
                        <Input label="Mot de passe" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={72} hint="Au moins 10 caractères." required error={fieldErrors.password} />
                        {error && <p role="alert" className="ss-error">{error}</p>}
                        <Button type="submit" isLoading={busy} fullWidth rightIcon={<ArrowRight size={16} />}>Créer mon espace client</Button>
                    </form>
                    <p className="ss-signin">Déjà un compte ? <Link href="/login?callbackUrl=%2Fclient%2Fmissions">Se connecter</Link></p>
                </>}
            </div>
        </section>
    </main>;
}
