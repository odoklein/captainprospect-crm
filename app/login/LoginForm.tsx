"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import {
    Eye,
    EyeOff,
    AlertCircle,
    ArrowRight,
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

    const inputCls =
        "w-full h-11 px-3.5 bg-white border border-neutral-200 rounded-lg text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/5 transition disabled:bg-neutral-50 disabled:text-neutral-500";

    const renderPasswordField = (id: string) => (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <label htmlFor={id} className="text-sm font-medium text-neutral-800">
                    Mot de passe
                </label>
                <button
                    type="button"
                    onClick={() => router.push("/forgot-password")}
                    className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
                >
                    Mot de passe oublié ?
                </button>
            </div>
            <div className="relative">
                <input
                    ref={passwordInputRef}
                    id={id}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={handleKeyUp}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading || isSuccess}
                    autoComplete="current-password"
                    required
                    className={`${inputCls} pr-11`}
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 px-3.5 flex items-center text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
                    tabIndex={-1}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            </div>
            {capsLockActive && (
                <p className="text-xs text-amber-600 pt-0.5">Verrouillage majuscule activé</p>
            )}
        </div>
    );

    const submitButton = (
        <button
            type="submit"
            disabled={isLoading || isSuccess}
            className={`w-full h-11 rounded-lg text-[15px] font-medium transition flex items-center justify-center gap-2 cursor-pointer ${
                isSuccess
                    ? "bg-emerald-600 text-white"
                    : "bg-neutral-900 hover:bg-neutral-800 text-white active:translate-y-px disabled:opacity-60 disabled:cursor-not-allowed"
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
                <>
                    <span>Se connecter</span>
                    <ArrowRight className="w-4 h-4" />
                </>
            )}
        </button>
    );

    const isQuickConnect = !isManualMode && !!activeAccount;

    return (
        <div
            className="min-h-screen w-full flex flex-col bg-white text-neutral-900 antialiased"
            style={{ fontFamily: "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif" }}
        >
            <header className="px-6 sm:px-10 py-6">
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

            <main className="flex-1 flex items-center justify-center px-4 pb-16">
                <div
                    key={shakeKey}
                    className={`w-full max-w-[380px] transition-all duration-300 ${
                        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                    } ${shakeKey > 0 ? "animate-[shake_0.35s_ease-in-out]" : ""}`}
                >
                    <div className="mb-8">
                        <h1 className="text-[28px] leading-tight font-semibold tracking-tight">
                            {isQuickConnect ? "Bon retour" : "Connexion"}
                        </h1>
                        <p className="mt-2 text-[15px] text-neutral-500">
                            {isQuickConnect
                                ? "Saisissez votre mot de passe pour continuer."
                                : "Accédez à votre espace Captain Prospect."}
                        </p>
                    </div>

                    {errorMessage && (
                        <div
                            role="alert"
                            className="mb-5 px-3.5 py-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm flex items-start gap-2.5 animate-fadeIn"
                        >
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div className="flex-1 leading-relaxed">{errorMessage}</div>
                        </div>
                    )}

                    {isQuickConnect && activeAccount ? (
                        <form onSubmit={handleSubmit} noValidate className="space-y-5">
                            {/* Active saved profile */}
                            <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/60 flex items-center gap-3">
                                <div className="relative shrink-0">
                                    <div className="w-10 h-10 rounded-full bg-neutral-900 text-white flex items-center justify-center text-sm font-medium">
                                        {getInitials(activeAccount.name, activeAccount.email)}
                                    </div>
                                    {activeMeta && (
                                        <span
                                            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${activeMeta.dotCls}`}
                                        />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium truncate">{activeAccount.name}</div>
                                    <div className="text-[13px] text-neutral-500 truncate">
                                        {activeAccount.email}
                                        {activeMeta && <> · {activeMeta.label}</>}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => removeSavedAccount(activeAccount.email, e)}
                                    className="text-neutral-400 hover:text-neutral-900 p-1.5 rounded-md hover:bg-neutral-100 transition-colors cursor-pointer"
                                    title={`Oublier ce profil · dernière connexion ${formatTimeAgo(activeAccount.lastLogin)}`}
                                    aria-label="Oublier ce profil"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {savedAccounts.length > 1 && (
                                <div className="flex flex-wrap gap-1.5 -mt-2">
                                    {savedAccounts.map((acc) => {
                                        const isCurrent = acc.email.toLowerCase() === activeAccount.email.toLowerCase();
                                        return (
                                            <button
                                                key={acc.email}
                                                type="button"
                                                onClick={() => selectSavedAccount(acc)}
                                                className={`text-[13px] px-2.5 py-1 rounded-full border transition cursor-pointer max-w-[160px] truncate ${
                                                    isCurrent
                                                        ? "bg-neutral-900 border-neutral-900 text-white"
                                                        : "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400"
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

                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsManualMode(true);
                                        setEmail("");
                                        setPassword("");
                                        setErrorMessage("");
                                        setTimeout(() => emailInputRef.current?.focus(), 50);
                                    }}
                                    className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
                                >
                                    Utiliser un autre compte
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleSubmit} noValidate className="space-y-5">
                            <div className="space-y-1.5">
                                <label htmlFor="lp-email" className="block text-sm font-medium text-neutral-800">
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

                            <label className="flex items-center gap-2.5 text-sm text-neutral-600 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={rememberDevice}
                                    onChange={(e) => setRememberDevice(e.target.checked)}
                                    className="w-4 h-4 rounded border-neutral-300 accent-neutral-900 cursor-pointer"
                                />
                                Se souvenir de moi
                            </label>

                            {submitButton}

                            {savedAccounts.length > 0 && (
                                <div className="text-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsManualMode(false);
                                            setActiveAccount(savedAccounts[0]);
                                            setEmail(savedAccounts[0].email);
                                            setPassword("");
                                            setErrorMessage("");
                                        }}
                                        className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
                                    >
                                        ← Continuer en tant que {savedAccounts[0].name}
                                    </button>
                                </div>
                            )}
                        </form>
                    )}
                </div>
            </main>

            <footer className="px-6 sm:px-10 py-6 text-[13px] text-neutral-400">
                © {new Date().getFullYear()} Captain Prospect
            </footer>
        </div>
    );
}
