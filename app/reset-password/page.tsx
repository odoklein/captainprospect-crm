"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Eye, EyeOff, ArrowLeft, AlertCircle, CheckCircle, Loader2, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { brand } from "@/lib/brand";

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token") || "";
    const email = searchParams.get("email") || "";

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [passFocused, setPassFocused] = useState(false);
    const [confirmFocused, setConfirmFocused] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

    const isInvalid = !token || !email;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (password.length < 6) {
            setError("Le mot de passe doit contenir au moins 6 caractères");
            return;
        }

        if (password !== confirmPassword) {
            setError("Les mots de passe ne correspondent pas");
            return;
        }

        setIsLoading(true);

        try {
            const res = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, email, password }),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                setError(data.error || "Une erreur est survenue");
                setIsLoading(false);
                return;
            }

            setSuccess(true);
        } catch {
            setError("Une erreur est survenue. Veuillez réessayer.");
            setIsLoading(false);
        }
    };

    return (
        <>
            <style>{`
                .lp {
                    --cp950: #1e1b4b; --cp700: #4338ca; --cp600: #4f46e5;
                    --cp500: #6366f1; --cp400: #818cf8; --cp200: #c7d2fe;
                    --ink: #1e1b4b; --ink2: rgba(30,27,75,.52); --ink3: rgba(30,27,75,.32);
                    --ink4: rgba(30,27,75,.18); --ink5: rgba(30,27,75,.08);
                    --t: 0.18s cubic-bezier(.4,0,.2,1);
                    --spring: 0.5s cubic-bezier(.22,1,.36,1);

                    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
                    -webkit-font-smoothing: antialiased;
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 24px 16px;
                    position: relative;
                    overflow: hidden;

                    background: #f7fafc;
                }

                .lp-card {
                    position: relative; z-index: 1;
                    width: 100%; max-width: 360px;
                    padding: 32px 28px 28px;
                    border-radius: 22px;
                    background: #fff;
                    border: 1px solid #e2e8f0;
                    box-shadow:
                        0 1px 2px rgba(15,23,42,.05),
                        0 12px 32px -12px rgba(15,23,42,.18);
                    opacity: 0;
                    transform: translateY(16px) scale(.98);
                    transition: opacity .45s var(--spring, ease), transform .45s var(--spring, ease);
                }
                .lp-card.show {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }

                .lp-inner {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0;
                }

                .lp-card.show .lp-inner > * {
                    animation: lpUp .45s var(--spring, ease) both;
                }
                .lp-card.show .lp-inner > *:nth-child(1) { animation-delay:.04s }
                .lp-card.show .lp-inner > *:nth-child(2) { animation-delay:.09s }
                .lp-card.show .lp-inner > *:nth-child(3) { animation-delay:.14s }
                .lp-card.show .lp-inner > *:nth-child(4) { animation-delay:.19s }
                .lp-card.show .lp-inner > *:nth-child(5) { animation-delay:.24s }
                .lp-card.show .lp-inner > *:nth-child(6) { animation-delay:.29s }
                .lp-card.show .lp-inner > *:nth-child(7) { animation-delay:.34s }

                .lp-logo {
                    margin-bottom: 20px;
                    height: 36px;
                    width: auto;
                    object-fit: contain;
                }

                .lp-head { text-align: center; margin-bottom: 24px; width: 100%; }
                .lp-head h1 {
                    font-weight: 700; font-size: 20px; line-height: 1.25;
                    letter-spacing: -.3px; color: var(--ink); margin: 0;
                }
                .lp-head p {
                    margin: 4px 0 0; font-size: 13px; font-weight: 400;
                    color: var(--ink3);
                }

                .lp-field { width: 100%; margin-bottom: 14px; }
                .lp-label {
                    display: block; font-size: 11px; font-weight: 600;
                    letter-spacing: .05em; text-transform: uppercase;
                    color: var(--ink2); margin-bottom: 6px;
                }

                .lp-wrap {
                    display: flex; align-items: center;
                    height: 46px; border-radius: 12px;
                    border: 1.5px solid var(--ink5);
                    background: rgba(255,255,255,.55);
                    transition: border-color var(--t), box-shadow var(--t), background var(--t);
                }
                .lp-wrap:hover { border-color: var(--ink4); }
                .lp-wrap.f {
                    border-color: var(--cp500);
                    box-shadow: 0 0 0 3px rgba(99,102,241,.10);
                    background: rgba(255,255,255,.8);
                }
                .lp-wrap.err {
                    border-color: #f87171;
                    box-shadow: 0 0 0 3px rgba(248,113,113,.08);
                }

                .lp-ico {
                    display: flex; align-items: center; justify-content: center;
                    width: 42px; height: 100%; flex-shrink: 0;
                    color: var(--ink3); transition: color var(--t);
                }
                .lp-wrap.f .lp-ico { color: var(--cp500); }

                .lp-in {
                    flex: 1; height: 100%; padding: 0 12px 0 0;
                    font-family: inherit; font-size: 13.5px; font-weight: 400;
                    color: var(--ink); background: transparent; border: none; outline: none;
                }
                .lp-in::placeholder { color: var(--ink4); }

                .lp-trail { display: flex; align-items: center; padding-right: 8px; }
                .lp-eye {
                    display: flex; align-items: center; justify-content: center;
                    width: 30px; height: 30px; border-radius: 8px;
                    border: none; background: transparent; color: var(--ink3);
                    cursor: pointer; transition: all var(--t);
                }
                .lp-eye:hover { background: var(--ink5); color: var(--ink2); }

                .lp-err {
                    width: 100%; display: flex; align-items: center; gap: 8px;
                    padding: 10px 12px; border-radius: 10px; margin-bottom: 14px;
                    background: #fef2f2; border: 1px solid #fecaca;
                    color: #dc2626; font-size: 12.5px; font-weight: 500;
                    animation: lpShake .4s ease;
                }

                .lp-success {
                    width: 100%; display: flex; align-items: flex-start; gap: 10px;
                    padding: 14px 16px; border-radius: 12px; margin-bottom: 14px;
                    background: #f0fdf4; border: 1px solid #bbf7d0;
                    color: #15803d; font-size: 13px; font-weight: 500;
                    line-height: 1.5;
                }

                .lp-btn {
                    width: 100%; height: 46px; border-radius: 12px; border: none;
                    background: var(--cp600);
                    box-shadow: 0 1px 2px rgba(15,23,42,.08);
                    color: #fff; font-family: inherit; font-weight: 600;
                    font-size: 14px; letter-spacing: .01em;
                    cursor: pointer; display: flex; align-items: center;
                    justify-content: center; gap: 7px;
                    transition: filter var(--t), transform var(--t), box-shadow var(--t);
                    margin-bottom: 16px;
                }
                .lp-btn:hover:not(:disabled) {
                    background: var(--cp700);
                }
                .lp-btn:active:not(:disabled) { filter: brightness(.96); transform: translateY(0); }
                .lp-btn:disabled { opacity: .55; cursor: not-allowed; }

                .lp-back {
                    display: flex; align-items: center; gap: 6px;
                    font-family: inherit; font-size: 13px; font-weight: 500;
                    color: var(--cp500); background: none; border: none;
                    cursor: pointer; padding: 0; transition: color var(--t);
                }
                .lp-back:hover { color: var(--cp700); }

                .lp-footer {
                    position: relative; z-index: 1;
                    font-size: 11px; color: var(--ink4); text-align: center;
                    margin-top: 20px; font-family: inherit;
                }

                .lp-strength {
                    height: 3px; border-radius: 2px; margin-top: 8px;
                    transition: all var(--t);
                }

                @keyframes lpUp {
                    from { opacity: 0; transform: translateY(14px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes lpShake {
                    0%,100% { transform: translateX(0); }
                    20% { transform: translateX(-5px); }
                    40% { transform: translateX(5px); }
                    60% { transform: translateX(-3px); }
                    80% { transform: translateX(3px); }
                }

                @media (max-width: 400px) {
                    .lp-card { padding: 24px 20px 22px; max-width: 100%; }
                    .lp-head h1 { font-size: 18px; }
                }
            `}</style>

            <div className="lp">
                <div className={`lp-card${mounted ? " show" : ""}`}>
                    <div className="lp-inner">

                        <BrandLogo
                            height={28}
                            priority
                            className="lp-logo"
                        />

                        {isInvalid ? (
                            <>
                                <div className="lp-head">
                                    <h1>Lien invalide</h1>
                                    <p>Ce lien de réinitialisation est invalide ou a expiré</p>
                                </div>
                                <div className="lp-err" style={{ animation: "none" }}>
                                    <AlertCircle size={14} style={{ flexShrink: 0 }} />
                                    <span>Veuillez refaire une demande de réinitialisation depuis la page de connexion.</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "center" }}>
                                    <button
                                        type="button"
                                        className="lp-back"
                                        onClick={() => router.push("/forgot-password")}
                                    >
                                        <ArrowLeft size={14} />
                                        Nouvelle demande
                                    </button>
                                </div>
                            </>
                        ) : success ? (
                            <>
                                <div className="lp-head">
                                    <h1>Mot de passe modifié</h1>
                                </div>
                                <div className="lp-success">
                                    <CheckCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                                    <span>Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.</span>
                                </div>
                                <button
                                    type="button"
                                    className="lp-btn"
                                    onClick={() => router.push("/login")}
                                >
                                    <ShieldCheck size={15} />
                                    <span>Se connecter</span>
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="lp-head">
                                    <h1>Nouveau mot de passe</h1>
                                    <p>Choisissez un nouveau mot de passe pour votre compte</p>
                                </div>

                                <form onSubmit={handleSubmit} style={{ width: "100%" }} noValidate>
                                    <div className="lp-field">
                                        <label className="lp-label" htmlFor="rp-pass">Nouveau mot de passe</label>
                                        <div className={`lp-wrap${passFocused ? " f" : ""}${error ? " err" : ""}`}>
                                            <div className="lp-ico"><Lock size={15} /></div>
                                            <input
                                                id="rp-pass"
                                                className="lp-in"
                                                type={showPassword ? "text" : "password"}
                                                placeholder="Au moins 6 caractères"
                                                value={password}
                                                onChange={e => setPassword(e.target.value)}
                                                onFocus={() => setPassFocused(true)}
                                                onBlur={() => setPassFocused(false)}
                                                required
                                                autoComplete="new-password"
                                                autoFocus
                                            />
                                            <div className="lp-trail">
                                                <button
                                                    type="button"
                                                    className="lp-eye"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    tabIndex={-1}
                                                    aria-label={showPassword ? "Masquer" : "Afficher"}
                                                >
                                                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="lp-field" style={{ marginBottom: 18 }}>
                                        <label className="lp-label" htmlFor="rp-confirm">Confirmer le mot de passe</label>
                                        <div className={`lp-wrap${confirmFocused ? " f" : ""}${error ? " err" : ""}`}>
                                            <div className="lp-ico"><Lock size={15} /></div>
                                            <input
                                                id="rp-confirm"
                                                className="lp-in"
                                                type={showConfirm ? "text" : "password"}
                                                placeholder="Retapez le mot de passe"
                                                value={confirmPassword}
                                                onChange={e => setConfirmPassword(e.target.value)}
                                                onFocus={() => setConfirmFocused(true)}
                                                onBlur={() => setConfirmFocused(false)}
                                                required
                                                autoComplete="new-password"
                                            />
                                            <div className="lp-trail">
                                                <button
                                                    type="button"
                                                    className="lp-eye"
                                                    onClick={() => setShowConfirm(!showConfirm)}
                                                    tabIndex={-1}
                                                    aria-label={showConfirm ? "Masquer" : "Afficher"}
                                                >
                                                    {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {error && (
                                        <div className="lp-err">
                                            <AlertCircle size={14} style={{ flexShrink: 0 }} />
                                            <span>{error}</span>
                                        </div>
                                    )}

                                    <button type="submit" className="lp-btn" disabled={isLoading}>
                                        {isLoading ? (
                                            <>
                                                <Loader2 size={15} className="animate-spin" />
                                                <span>Modification...</span>
                                            </>
                                        ) : (
                                            <>
                                                <ShieldCheck size={15} />
                                                <span>Réinitialiser le mot de passe</span>
                                            </>
                                        )}
                                    </button>

                                    <div style={{ display: "flex", justifyContent: "center" }}>
                                        <button
                                            type="button"
                                            className="lp-back"
                                            onClick={() => router.push("/login")}
                                        >
                                            <ArrowLeft size={14} />
                                            Retour à la connexion
                                        </button>
                                    </div>
                                </form>
                            </>
                        )}
                    </div>
                </div>

                <p className="lp-footer">
                    {brand.name} &copy; {new Date().getFullYear()}
                </p>
            </div>
        </>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-pulse text-slate-500">Chargement...</div>
            </div>
        }>
            <ResetPasswordForm />
        </Suspense>
    );
}
