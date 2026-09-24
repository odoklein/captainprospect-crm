"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import {
    Eye,
    EyeOff,
    AlertCircle,
    Loader2,
    X,
    Check,
} from "lucide-react";

interface SavedAccount {
    email: string;
    name: string;
    role: string;
    lastLogin: number;
}

const STORAGE_KEY = "cp_enterprise_saved_accounts";

const ROLE_METADATA: Record<string, { label: string; dotCls: string }> = {
    MANAGER: { label: "Manager", dotCls: "bg-indigo-500" },
    SDR: { label: "SDR", dotCls: "bg-blue-500" },
    BOOKER: { label: "Booker", dotCls: "bg-cyan-500" },
    BUSINESS_DEVELOPER: { label: "Business Developer", dotCls: "bg-violet-500" },
    CLIENT: { label: "Client", dotCls: "bg-emerald-500" },
    COMMERCIAL: { label: "Commercial", dotCls: "bg-amber-500" },
    DEVELOPER: { label: "Développeur", dotCls: "bg-rose-500" },
};

function getRoleDashboardPath(role?: string): string {
    switch (role) {
        case "SDR":
        case "BOOKER":
            return "/sdr/action";
        case "MANAGER":
            return "/manager/dashboard";
        case "CLIENT":
            return "/client/portal";
        case "DEVELOPER":
            return "/developer/dashboard";
        case "BUSINESS_DEVELOPER":
            return "/bd/dashboard";
        case "COMMERCIAL":
            return "/commercial/portal";
        default:
            return "/dashboard";
    }
}

function getInitials(name?: string, email?: string): string {
    if (name && name.trim()) {
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    }
    if (email) {
        return email.slice(0, 2).toUpperCase();
    }
    return "CP";
}

function formatTimeAgo(timestamp: number): string {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "à l'instant";
    if (diffMins < 60) return `il y a ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `il y a ${diffHours} h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "hier";
    return `il y a ${diffDays} j`;
}

export default function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
    const initialErrorCode = searchParams.get("error");

    // Form inputs
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [rememberDevice, setRememberDevice] = useState(true);

    // States
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [errorMessage, setErrorMessage] = useState(
        initialErrorCode === "CredentialsSignin"
            ? "Identifiant ou mot de passe incorrect."
            : initialErrorCode
                ? "Échec de l'authentification. Veuillez réessayer."
                : ""
    );
    const [showPassword, setShowPassword] = useState(false);
    const [capsLockActive, setCapsLockActive] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [shakeKey, setShakeKey] = useState(0);

    // Saved accounts & mode
    const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
    const [activeAccount, setActiveAccount] = useState<SavedAccount | null>(null);
    const [isManualMode, setIsManualMode] = useState(false);

    const passwordInputRef = useRef<HTMLInputElement>(null);
    const emailInputRef = useRef<HTMLInputElement>(null);

    // Load saved accounts from localStorage
    useEffect(() => {
        setMounted(true);
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed: SavedAccount[] = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setSavedAccounts(parsed);
                    setActiveAccount(parsed[0]);
                    setEmail(parsed[0].email);
                } else {
                    setIsManualMode(true);
                }
            } else {
                setIsManualMode(true);
            }
        } catch {
            setIsManualMode(true);
        }
    }, []);

    // Auto-focus password on Quick Connect
    useEffect(() => {
        if (!isManualMode && activeAccount && passwordInputRef.current) {
            passwordInputRef.current.focus();
        }
    }, [isManualMode, activeAccount]);

    // Handle Caps Lock detection
    const handleKeyUp = (e: React.KeyboardEvent) => {
        setCapsLockActive(e.getModifierState("CapsLock"));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        setCapsLockActive(e.getModifierState("CapsLock"));
        if (e.key === "Escape") {
            setErrorMessage("");
        }
    };

    // Save account helper
    const persistAccount = useCallback((accountToSave: SavedAccount) => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            let accounts: SavedAccount[] = raw ? JSON.parse(raw) : [];
            // Remove existing entry if any
            accounts = accounts.filter(
                (a) => a.email.toLowerCase() !== accountToSave.email.toLowerCase()
            );
            // Prepend updated
            accounts.unshift(accountToSave);
            // Keep at most 5 accounts
            accounts = accounts.slice(0, 5);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
            setSavedAccounts(accounts);
        } catch (err) {
            console.error("Failed to save account to localStorage", err);
        }
    }, []);

    // Remove single saved account
    const removeSavedAccount = (accountEmail: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const updated = savedAccounts.filter(
                (a) => a.email.toLowerCase() !== accountEmail.toLowerCase()
            );
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            setSavedAccounts(updated);

            if (updated.length === 0) {
                setActiveAccount(null);
                setIsManualMode(true);
                setEmail("");
            } else if (activeAccount?.email.toLowerCase() === accountEmail.toLowerCase()) {
                setActiveAccount(updated[0]);
                setEmail(updated[0].email);
            }
        } catch (err) {
            console.error("Error removing account", err);
        }
    };

    // Select a saved account
    const selectSavedAccount = (acc: SavedAccount) => {
        setActiveAccount(acc);
        setEmail(acc.email);
        setPassword("");
        setErrorMessage("");
        if (passwordInputRef.current) {
            passwordInputRef.current.focus();
        }
    };

    // Submit handler
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage("");

        const targetEmail = (isManualMode ? email : activeAccount?.email || email).trim().toLowerCase();

        if (!targetEmail) {
            setErrorMessage("Veuillez renseigner votre identifiant professionnel.");
            setShakeKey((k) => k + 1);
            return;
        }

        if (!password) {
            setErrorMessage("Veuillez saisir votre mot de passe.");
            setShakeKey((k) => k + 1);
            if (passwordInputRef.current) passwordInputRef.current.focus();
            return;
        }

        setIsLoading(true);

        try {
            const result = await signIn("credentials", {
                redirect: false,
                email: targetEmail,
                password,
                callbackUrl,
            });

            if (!result || result.error) {
                setIsLoading(false);
                setShakeKey((k) => k + 1);
                if (result?.error?.includes("verrouillé") || result?.error?.includes("Trop")) {
                    setErrorMessage(result.error);
                } else if (result?.error?.includes("désactivé")) {
                    setErrorMessage("Ce compte a été suspendu par l'administrateur.");
                } else {
                    setErrorMessage("Identifiant ou mot de passe incorrect.");
                }
                if (passwordInputRef.current) {
                    passwordInputRef.current.focus();
                    passwordInputRef.current.select();
                }
                return;
            }

            // Success state
            setIsSuccess(true);

            // Fetch session to determine role and profile name
            let destination = callbackUrl;
            try {
                const sessionRes = await fetch("/api/auth/session");
                if (sessionRes.ok) {
                    const sessionData = await sessionRes.json();
                    if (sessionData?.user) {
                        const userRole = sessionData.user.role;
                        const userName = sessionData.user.name || targetEmail.split("@")[0];

                        // Persist if rememberDevice is checked
                        if (rememberDevice) {
                            persistAccount({
                                email: targetEmail,
                                name: userName,
                                role: userRole,
                                lastLogin: Date.now(),
                            });
                        }

                        // Determine destination
                        if (callbackUrl === "/dashboard" || !callbackUrl) {
                            destination = getRoleDashboardPath(userRole);
                        }
                    }
                }
            } catch {
                // If session fetch fails, default to callbackUrl or /dashboard
            }

            // Prefetch and navigate
            router.prefetch(destination);
            setTimeout(() => {
                router.push(destination);
            }, 350);
        } catch {
            setIsLoading(false);
            setShakeKey((k) => k + 1);
            setErrorMessage("Erreur de connexion au serveur d'authentification.");
        }
    };

    const activeMeta = activeAccount?.role ? ROLE_METADATA[activeAccount.role] : null;

    // Compact, airy card: small type, hairline borders, one strong brand button.
    const inputCls =
        "w-full h-10 px-3 bg-white border border-[#E4E6EF] rounded-lg text-[13.5px] text-[#1A1D2E] placeholder:text-[#A3A8BD] focus:outline-none focus:border-[#27355F] focus:ring-4 focus:ring-[#27355F]/10 transition disabled:bg-[#F6F7FB] disabled:text-[#8A90A8]";
    const labelCls = "block text-[12.5px] font-medium text-[#1A1D2E] mb-1.5";
    const secondaryLinkCls =
        "block text-left text-[12.5px] font-medium text-[#1A1D2E] hover:text-[#C44E8A] transition-colors cursor-pointer";

    const renderPasswordField = (id: string) => (
        <div>
            <label htmlFor={id} className={labelCls}>
                Mot de passe
            </label>
            <div className="relative">
                <input
                    ref={passwordInputRef}
                    id={id}
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={handleKeyUp}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading || isSuccess}
                    autoComplete="current-password"
                    required
                    className={`${inputCls} pr-10`}
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-[#A3A8BD] hover:text-[#27355F] transition-colors cursor-pointer"
                    tabIndex={-1}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            </div>
            {capsLockActive && (
                <p className="text-[11.5px] text-amber-600 pt-1">Verrouillage majuscule activé</p>
            )}
        </div>
    );

    const submitButton = (
        <button
            type="submit"
            disabled={isLoading || isSuccess}
            className={`w-full h-10 rounded-lg text-[13.5px] font-medium transition flex items-center justify-center gap-2 cursor-pointer shadow-[0_1px_2px_rgba(39,53,95,0.2)] ${
                isSuccess
                    ? "bg-emerald-600 text-white"
                    : "bg-[#27355F] hover:bg-[#1E2A4D] text-white active:translate-y-px disabled:opacity-60 disabled:cursor-not-allowed"
            }`}
        >
            {isLoading ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Connexion…</span>
                </>
            ) : isSuccess ? (
                <>
                    <Check className="w-4 h-4" />
                    <span>Connecté</span>
                </>
            ) : (
                <span>Se connecter</span>
            )}
        </button>
    );

    const forgotPasswordLink = (
        <button type="button" onClick={() => router.push("/forgot-password")} className={secondaryLinkCls}>
            Mot de passe oublié ?
        </button>
    );

    const isQuickConnect = !isManualMode && !!activeAccount;

    return (
        <div
            className="relative min-h-screen w-full flex flex-col items-center text-[#1A1D2E] antialiased overflow-hidden bg-[#EEF1FB]"
            style={{ fontFamily: "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif" }}
        >
            {/* Misty mountains, anchored to the bottom. The image already fades to white
                at the top; a light wash keeps the card readable on short screens. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-cover bg-bottom"
                style={{ backgroundImage: "url('/login-bg.webp')" }}
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0) 100%)" }}
            />

            <header className="relative z-10 pt-12 sm:pt-16 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/logocaptainblue-rose.png"
                    alt="Captain Prospect"
                    className="h-7 w-auto object-contain"
                    onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                    }}
                />
            </header>

            <main className="relative z-10 flex-1 w-full flex items-center justify-center px-4 py-10">
                <div
                    key={shakeKey}
                    className={`w-full max-w-[360px] rounded-xl border border-[#E4E6EF] bg-white/95 backdrop-blur-sm p-5 sm:p-6 shadow-[0_1px_2px_rgba(26,29,46,0.04),0_12px_32px_-12px_rgba(39,53,95,0.18)] transition-all duration-300 ${
                        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                    } ${shakeKey > 0 ? "animate-[shake_0.35s_ease-in-out]" : ""}`}
                >
                    <div className="mb-5">
                        <h1 className="text-[15px] font-semibold tracking-tight">
                            {isQuickConnect ? "Bon retour" : "Connexion"}
                        </h1>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-[#8A90A8]">
                            {isQuickConnect
                                ? "Saisissez votre mot de passe pour continuer."
                                : "Accédez à votre espace Captain Prospect."}
                        </p>
                    </div>

                    {errorMessage && (
                        <div
                            role="alert"
                            className="mb-4 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100 text-red-700 text-[12.5px] flex items-start gap-2 animate-fadeIn"
                        >
                            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                            <div className="flex-1 leading-relaxed">{errorMessage}</div>
                        </div>
                    )}

                    {isQuickConnect && activeAccount ? (
                        <form onSubmit={handleSubmit} noValidate className="space-y-4">
                            {/* Active saved profile */}
                            <div className="p-2.5 rounded-lg border border-[#E4E6EF] bg-[#F6F7FB] flex items-center gap-2.5">
                                <div className="relative shrink-0">
                                    <div className="w-9 h-9 rounded-full bg-[#27355F] text-white flex items-center justify-center text-[12.5px] font-medium">
                                        {getInitials(activeAccount.name, activeAccount.email)}
                                    </div>
                                    {activeMeta && (
                                        <span
                                            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${activeMeta.dotCls}`}
                                        />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[13px] font-medium truncate">{activeAccount.name}</div>
                                    <div className="text-[12px] text-[#8A90A8] truncate">
                                        {activeAccount.email}
                                        {activeMeta && <> · {activeMeta.label}</>}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => removeSavedAccount(activeAccount.email, e)}
                                    className="text-[#A3A8BD] hover:text-[#1A1D2E] p-1.5 rounded-md hover:bg-white transition-colors cursor-pointer"
                                    title={`Oublier ce profil · dernière connexion ${formatTimeAgo(activeAccount.lastLogin)}`}
                                    aria-label="Oublier ce profil"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {savedAccounts.length > 1 && (
                                <div className="flex flex-wrap gap-1.5 -mt-1">
                                    {savedAccounts.map((acc) => {
                                        const isCurrent = acc.email.toLowerCase() === activeAccount.email.toLowerCase();
                                        return (
                                            <button
                                                key={acc.email}
                                                type="button"
                                                onClick={() => selectSavedAccount(acc)}
                                                className={`text-[12px] px-2.5 py-1 rounded-full border transition cursor-pointer max-w-[150px] truncate ${
                                                    isCurrent
                                                        ? "bg-[#27355F] border-[#27355F] text-white"
                                                        : "bg-white border-[#E4E6EF] text-[#5B6180] hover:border-[#A3A8BD]"
                                                }`}
                                            >
                                                {acc.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {renderPasswordField("qc-password")}
                            {submitButton}

                            <div className="space-y-2 pt-1">
                                {forgotPasswordLink}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsManualMode(true);
                                        setEmail("");
                                        setPassword("");
                                        setErrorMessage("");
                                        setTimeout(() => emailInputRef.current?.focus(), 50);
                                    }}
                                    className={secondaryLinkCls}
                                >
                                    Utiliser un autre compte
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleSubmit} noValidate className="space-y-4">
                            <div>
                                <label htmlFor="lp-email" className={labelCls}>
                                    Email
                                </label>
                                <input
                                    ref={emailInputRef}
                                    id="lp-email"
                                    type="email"
                                    placeholder="vous@entreprise.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={isLoading || isSuccess}
                                    autoComplete="username"
                                    required
                                    className={inputCls}
                                />
                            </div>

                            {renderPasswordField("lp-password")}

                            {/* Switch-style "remember me" (still a real checkbox for a11y) */}
                            <label className="flex items-center gap-2.5 text-[12.5px] font-medium text-[#1A1D2E] cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={rememberDevice}
                                    onChange={(e) => setRememberDevice(e.target.checked)}
                                    className="peer sr-only"
                                />
                                <span
                                    aria-hidden="true"
                                    className="relative inline-flex h-[18px] w-8 shrink-0 rounded-full bg-[#E4E6EF] transition-colors peer-checked:bg-[#27355F] peer-focus-visible:ring-4 peer-focus-visible:ring-[#27355F]/15 after:absolute after:top-[2px] after:left-[2px] after:h-[14px] after:w-[14px] after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-[14px]"
                                />
                                Se souvenir de moi
                            </label>

                            {submitButton}

                            <div className="space-y-2 pt-1">
                                {forgotPasswordLink}
                                {savedAccounts.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsManualMode(false);
                                            setActiveAccount(savedAccounts[0]);
                                            setEmail(savedAccounts[0].email);
                                            setPassword("");
                                            setErrorMessage("");
                                        }}
                                        className={secondaryLinkCls}
                                    >
                                        Continuer en tant que {savedAccounts[0].name}
                                    </button>
                                )}
                            </div>
                        </form>
                    )}
                </div>
            </main>

            <footer className="relative z-10 pb-8 text-[12px] text-[#5B6180]">
                © {new Date().getFullYear()} Captain Prospect
            </footer>
        </div>
    );
}
