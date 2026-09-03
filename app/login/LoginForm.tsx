"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, Shield, Loader2, Zap } from "lucide-react";

export default function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
    const errorCode = searchParams.get("error");

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [emailFocused, setEmailFocused] = useState(false);
    const [passFocused, setPassFocused] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

    const errorMessage = errorCode
        ? errorCode.includes("verrouillé") || errorCode.includes("Trop")
            ? errorCode
            : errorCode === "CredentialsSignin"
                ? "Email ou mot de passe incorrect"
                : "Une erreur est survenue"
        : "";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        await signIn("credentials", { email, password, callbackUrl });
        // Reached only if signIn itself throws before redirecting
        setIsLoading(false);
    };

    return (
        <>
            <style>{`
                .lp {
                    --cp950: #1a1757; --cp700: #322da0; --cp600: #3f39c5;
                    --cp500: #4f46e5; --cp400: #6b67e6; --cp200: #b9b6f7;
                    --ink: #0e0f12; --ink2: rgba(34,36,43,.72); --ink3: rgba(74,77,88,.72);
                    --ink4: rgba(142,145,157,.95); --ink5: rgba(217,219,226,.95);
                    --t: 0.18s cubic-bezier(.4,0,.2,1);
                    --spring: 0.5s cubic-bezier(.22,1,.36,1);

                    font-family: "Inter Tight", -apple-system, Helvetica, Arial, sans-serif;
                    -webkit-font-smoothing: antialiased;
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 24px 16px;
                    position: relative;
                    overflow: hidden;

                    background:
                        radial-gradient(55.87% 55.87% at 35.49% -18.37%, #eeeefd 0%, rgba(255,255,255,0) 100%),
                        radial-gradient(70.81% 48.44% at -24.53% -16.02%, #dcdbfb 0%, rgba(255,255,255,0) 100%),
                        radial-gradient(91.61% 92.58% at 104.86% -43.36%, #b9b6f7 0%, rgba(255,255,255,0) 100%),
                        radial-gradient(50.59% 55.55% at -2.99% -8.69%, #f3f3f6 9.06%, rgba(255,255,255,0) 100%),
                        #f7f6f2;
                }

                .lp::before {
                    content: '';
                    position: fixed; inset: 0;
                    background: transparent;
                    pointer-events: none;
                }

                .lp-card {
                    position: relative; z-index: 1;
                    width: 100%; max-width: 360px;
                    padding: 32px 28px 28px;
                    border-radius: 22px;
                    background: rgba(255,255,255,.82);
                    backdrop-filter: blur(20px) saturate(150%);
                    -webkit-backdrop-filter: blur(20px) saturate(150%);
                    border: 1px solid rgba(255,255,255,.9);
                    box-shadow:
                        rgba(50, 50, 93, 0.25) 0px 50px 100px -20px,
                        rgba(0, 0, 0, 0.3) 0px 30px 60px -30px,
                        inset 0 1px 0 rgba(255,255,255,.95);
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
                .lp-card.show .lp-inner > *:nth-child(8) { animation-delay:.39s }
                .lp-card.show .lp-inner > *:nth-child(9) { animation-delay:.44s }

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
                    height: 42px; border-radius: 10px;
                    border: 1px solid var(--ink5);
                    background: rgba(255,255,255,.55);
                    transition: border-color var(--t), box-shadow var(--t), background var(--t);
                }
                .lp-wrap:hover { border-color: #b7b9c2; }
                .lp-wrap.f {
                    border-color: var(--cp500);
                    box-shadow: 0 0 0 4px rgba(79,70,229,.18);
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
                    font-family: inherit; font-size: 14px; font-weight: 400;
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

                .lp-forgot-row { width: 100%; display: flex; justify-content: flex-end; margin-bottom: 18px; }
                .lp-forgot {
                    font-family: inherit; font-size: 12px; font-weight: 500;
                    color: var(--cp500); background: none; border: none;
                    cursor: pointer; padding: 0; transition: color var(--t);
                }
                .lp-forgot:hover { color: var(--cp700); }

                .lp-err {
                    width: 100%; display: flex; align-items: center; gap: 8px;
                    padding: 10px 12px; border-radius: 10px; margin-bottom: 14px;
                    background: #fef2f2; border: 1px solid #fecaca;
                    color: #dc2626; font-size: 12.5px; font-weight: 500;
                    animation: lpShake .4s ease;
                }

                .lp-btn {
                    width: 100%; height: 48px; border-radius: 10px; border: none;
                    background: var(--cp500);
                    box-shadow: none;
                    color: #fff; font-family: inherit; font-weight: 600;
                    font-size: 14px; letter-spacing: .01em;
                    cursor: pointer; display: flex; align-items: center;
                    justify-content: center; gap: 7px;
                    transition: filter var(--t), transform var(--t), box-shadow var(--t);
                    margin-bottom: 20px;
                }
                .lp-btn:hover:not(:disabled) {
                    background: var(--cp600);
                    transform: translateY(-1px);
                    filter: none;
                    box-shadow: none;
                }
                .lp-btn:active:not(:disabled) { background: var(--cp700); transform: translateY(0); }
                .lp-btn:focus-visible { outline: none; box-shadow: 0 0 0 4px rgba(79,70,229,.18); }
                .lp-btn:disabled { opacity: .55; cursor: not-allowed; }
                .lp-btn svg { transition: transform var(--t); }
                .lp-btn:hover:not(:disabled) svg { transform: translateX(2px); }

                .lp-div {
                    width: 100%; display: flex; align-items: center; gap: 10px;
                    margin-bottom: 16px;
                }
                .lp-div::before, .lp-div::after {
                    content: ''; flex: 1; height: 1px; background: var(--ink5);
                }
                .lp-div span {
                    font-size: 10px; font-weight: 600; letter-spacing: .06em;
                    text-transform: uppercase; color: var(--ink4);
                }

                .lp-badges { display: flex; align-items: center; justify-content: center; gap: 20px; }
                .lp-badge { display: flex; flex-direction: column; align-items: center; gap: 4px; }
                .lp-badge-ico {
                    width: 28px; height: 28px; border-radius: 8px;
                    background: var(--ink5); display: flex; align-items: center;
                    justify-content: center; color: var(--ink3);
                }
                .lp-badge-lbl {
                    font-size: 8.5px; font-weight: 600; color: var(--ink4);
                    text-transform: uppercase; letter-spacing: .07em;
                }

                .lp-footer {
                    position: relative; z-index: 1;
                    font-size: 11px; color: var(--ink4); text-align: center;
                    margin-top: 20px; font-family: inherit;
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
                    <form onSubmit={handleSubmit} className="lp-inner" noValidate>

                        {/* Logo */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logocaptainblue-rose.png"
                            alt="Captain Prospect"
                            className="lp-logo"
                            draggable={false}
                        />

                        {/* Heading */}
                        <div className="lp-head">
                            <h1>Bienvenue</h1>
                            <p>Connectez-vous à votre espace de travail</p>
                        </div>

                        {/* Email */}
                        <div className="lp-field">
                            <label className="lp-label" htmlFor="lp-email">Email</label>
                            <div className={`lp-wrap${emailFocused ? " f" : ""}${errorMessage ? " err" : ""}`}>
                                <div className="lp-ico"><Mail size={15} /></div>
                                <input
                                    id="lp-email"
                                    className="lp-in"
                                    type="email"
                                    placeholder="votre@email.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    onFocus={() => setEmailFocused(true)}
                                    onBlur={() => setEmailFocused(false)}
                                    required
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div className="lp-field">
                            <label className="lp-label" htmlFor="lp-pass">Mot de passe</label>
                            <div className={`lp-wrap${passFocused ? " f" : ""}${errorMessage ? " err" : ""}`}>
                                <div className="lp-ico"><Lock size={15} /></div>
                                <input
                                    id="lp-pass"
                                    className="lp-in"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    onFocus={() => setPassFocused(true)}
                                    onBlur={() => setPassFocused(false)}
                                    required
                                    autoComplete="current-password"
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

                        {/* Forgot */}
                        <div className="lp-forgot-row">
                            <button
                                type="button"
                                className="lp-forgot"
                                onClick={() => router.push("/forgot-password")}
                            >
                                Mot de passe oublié ?
                            </button>
                        </div>

                        {/* Error */}
                        {errorMessage && (
                            <div className="lp-err">
                                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                                <span>{errorMessage}</span>
                            </div>
                        )}

                        {/* Submit */}
                        <button type="submit" className="lp-btn" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 size={15} className="animate-spin" />
                                    <span>Connexion...</span>
                                </>
                            ) : (
                                <>
                                    <span>Se connecter</span>
                                    <ArrowRight size={15} />
                                </>
                            )}
                        </button>

                        {/* Divider */}
                        <div className="lp-div"><span>Accès réservé</span></div>

                        {/* Security badges */}
                        <div className="lp-badges">
                            <div className="lp-badge">
                                <div className="lp-badge-ico"><Shield size={13} /></div>
                                <span className="lp-badge-lbl">SSL</span>
                            </div>
                            <div className="lp-badge">
                                <div className="lp-badge-ico"><Lock size={13} /></div>
                                <span className="lp-badge-lbl">Chiffré</span>
                            </div>
                            <div className="lp-badge">
                                <div className="lp-badge-ico"><Zap size={13} /></div>
                                <span className="lp-badge-lbl">2FA</span>
                            </div>
                        </div>
                    </form>
                </div>

                <p className="lp-footer">
                    Captain Prospect &copy; {new Date().getFullYear()}
                </p>
            </div>
        </>
    );
}
