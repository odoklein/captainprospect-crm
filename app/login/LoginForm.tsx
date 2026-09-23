"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import {
    Shield,
    Lock,
    Mail,
    Eye,
    EyeOff,
    AlertCircle,
    ArrowRight,
    Loader2,
    CheckCircle2,
    User,
    UserPlus,
    X,
    Laptop,
    KeyRound,
    Building2,
    Check
} from "lucide-react";

interface SavedAccount {
    email: string;
    name: string;
    role: string;
    lastLogin: number;
}

const STORAGE_KEY = "cp_enterprise_saved_accounts";

const ROLE_METADATA: Record<string, { label: string; badgeCls: string; dotCls: string }> = {
    MANAGER: {
        label: "Direction & Management",
        badgeCls: "bg-indigo-950/70 text-indigo-300 border-indigo-700/60",
        dotCls: "bg-indigo-400",
    },
    SDR: {
        label: "Sales Development Rep",
        badgeCls: "bg-blue-950/70 text-blue-300 border-blue-700/60",
        dotCls: "bg-blue-400",
    },
    BOOKER: {
        label: "Prise de Rendez-vous",
        badgeCls: "bg-cyan-950/70 text-cyan-300 border-cyan-700/60",
        dotCls: "bg-cyan-400",
    },
    BUSINESS_DEVELOPER: {
        label: "Business Development",
        badgeCls: "bg-purple-950/70 text-purple-300 border-purple-700/60",
        dotCls: "bg-purple-400",
    },
    CLIENT: {
        label: "Espace Client Partenaire",
        badgeCls: "bg-emerald-950/70 text-emerald-300 border-emerald-700/60",
        dotCls: "bg-emerald-400",
    },
    COMMERCIAL: {
        label: "Commercial Partenaire",
        badgeCls: "bg-amber-950/70 text-amber-300 border-amber-700/60",
        dotCls: "bg-amber-400",
    },
    DEVELOPER: {
        label: "Ingénierie & Système",
        badgeCls: "bg-rose-950/70 text-rose-300 border-rose-700/60",
        dotCls: "bg-rose-400",
    },
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

    return (
        <div className="min-h-screen w-full flex flex-col justify-between bg-[#080c14] text-slate-100 font-sans selection:bg-indigo-500/30 relative overflow-hidden">
            {/* Enterprise structural background */}
            <div className="fixed inset-0 pointer-events-none">
                {/* Micro-grid texture */}
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)`,
                        backgroundSize: "32px 32px",
                    }}
                />
                {/* Subtle deep ambient glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-indigo-950/20 blur-[130px] rounded-full" />
                <div className="absolute -bottom-20 right-0 w-[500px] h-[300px] bg-slate-800/10 blur-[120px] rounded-full" />
            </div>

            {/* Top Enterprise Security Banner */}
            <header className="relative z-10 w-full border-b border-slate-800/70 bg-[#090e18]/80 backdrop-blur-md px-6 py-3.5">
                <div className="max-w-7xl mx-auto flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-md bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center">
                            <Shield className="w-3.5 h-3.5 text-indigo-400" />
                        </div>
                        <span className="font-semibold tracking-wider uppercase text-slate-300 text-[11px]">
                            Captain Prospect <span className="text-slate-500 font-normal">| Console Entreprise</span>
                        </span>
                    </div>

                    <div className="hidden sm:flex items-center gap-4 text-slate-400 text-[11px]">
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-slate-300 font-medium">Systèmes nominaux</span>
                        </div>
                        <span className="text-slate-700">|</span>
                        <span>TLS 1.3 / Chiffrement SHA-256</span>
                        <span className="text-slate-700">|</span>
                        <span className="text-slate-500 font-mono">v3.4.1</span>
                    </div>
                </div>
            </header>

            {/* Main Center Console */}
            <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
                <div
                    key={shakeKey}
                    className={`w-full max-w-[430px] transition-all duration-300 ${
                        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
                    } ${shakeKey > 0 ? "animate-[shake_0.35s_ease-in-out]" : ""}`}
                >
                    {/* Console Card */}
                    <div className="bg-[#0e1422]/95 border border-slate-800/90 rounded-xl shadow-2xl shadow-black/80 overflow-hidden relative backdrop-blur-xl">
                        {/* Top decorative status line */}
                        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-80" />

                        <div className="p-7 sm:p-8">
                            {/* Brand Header */}
                            <div className="flex flex-col items-center text-center mb-6">
                                <div className="mb-3.5 relative">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src="/logocaptainblue-rose.png"
                                        alt="Captain Prospect"
                                        className="h-9 w-auto object-contain filter drop-shadow-[0_2px_8px_rgba(99,102,241,0.2)]"
                                        onError={(e) => {
                                            (e.target as HTMLElement).style.display = "none";
                                        }}
                                    />
                                </div>
                                <h1 className="text-lg font-semibold tracking-tight text-white">
                                    Authentification Terminal
                                </h1>
                                <p className="text-xs text-slate-400 mt-1 max-w-[280px]">
                                    Accès contrôlé au CRM opérationnel & espace d&apos;analyse
                                </p>
                            </div>

                            {/* Error Alert Box */}
                            {errorMessage && (
                                <div
                                    role="alert"
                                    className="mb-5 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-start gap-2.5 animate-fadeIn"
                                >
                                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                    <div className="flex-1 leading-relaxed">{errorMessage}</div>
                                </div>
                            )}

                            {/* MODE 1: QUICK CONNECT (Returning User) */}
                            {!isManualMode && activeAccount ? (
                                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                                    {/* Active Profile Station */}
                                    <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between relative group hover:border-slate-700/80 transition-all">
                                        <div className="flex items-center gap-3 min-w-0">
                                            {/* Avatar with role ring */}
                                            <div className="relative">
                                                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm tracking-wider text-slate-200">
                                                    {getInitials(activeAccount.name, activeAccount.email)}
                                                </div>
                                                {activeMeta && (
                                                    <span
                                                        className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full ring-2 ring-[#0e1422] ${activeMeta.dotCls}`}
                                                    />
                                                )}
                                            </div>

                                            {/* Identity Details */}
                                            <div className="min-w-0 text-left">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-slate-100 truncate">
                                                        {activeAccount.name}
                                                    </span>
                                                    {activeMeta && (
                                                        <span
                                                            className={`text-[9.5px] px-1.5 py-0.5 rounded border uppercase tracking-wider font-semibold shrink-0 ${activeMeta.badgeCls}`}
                                                        >
                                                            {activeAccount.role}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                                                    {activeAccount.email}
                                                </div>
                                                <div className="text-[10px] text-slate-500 mt-0.5">
                                                    Dernière session : {formatTimeAgo(activeAccount.lastLogin)}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Remove Profile Button */}
                                        <button
                                            type="button"
                                            onClick={(e) => removeSavedAccount(activeAccount.email, e)}
                                            className="text-slate-500 hover:text-red-400 p-1.5 rounded hover:bg-slate-800/80 transition-colors cursor-pointer"
                                            title="Oublier ce profil sur cet appareil"
                                            aria-label="Oublier ce profil"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    {/* Multi-Account Selector Switcher */}
                                    {savedAccounts.length > 1 && (
                                        <div className="pt-1">
                                            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">
                                                Changer de profil enregistré :
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {savedAccounts.map((acc) => {
                                                    const isCurrent = acc.email.toLowerCase() === activeAccount.email.toLowerCase();
                                                    return (
                                                        <button
                                                            key={acc.email}
                                                            type="button"
                                                            onClick={() => selectSavedAccount(acc)}
                                                            className={`text-xs px-2.5 py-1 rounded-md border flex items-center gap-1.5 transition-all cursor-pointer ${
                                                                isCurrent
                                                                    ? "bg-indigo-950/80 border-indigo-600/70 text-indigo-200 font-medium"
                                                                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                                                            }`}
                                                        >
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                                            <span className="truncate max-w-[130px]">{acc.name}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Password field */}
                                    <div className="space-y-1.5 pt-1">
                                        <div className="flex items-center justify-between">
                                            <label
                                                htmlFor="qc-password"
                                                className="text-[11px] font-semibold uppercase tracking-wider text-slate-300"
                                            >
                                                Mot de passe
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => router.push("/forgot-password")}
                                                className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                                            >
                                                Oublié ?
                                            </button>
                                        </div>

                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                                <KeyRound className="w-4 h-4" />
                                            </div>
                                            <input
                                                ref={passwordInputRef}
                                                id="qc-password"
                                                type={showPassword ? "text" : "password"}
                                                placeholder="••••••••••••"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                onKeyUp={handleKeyUp}
                                                onKeyDown={handleKeyDown}
                                                disabled={isLoading || isSuccess}
                                                autoComplete="current-password"
                                                required
                                                className="w-full h-10 pl-9 pr-10 bg-slate-950/90 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                                                tabIndex={-1}
                                                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                                            >
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>

                                        {/* Caps lock alert */}
                                        {capsLockActive && (
                                            <div className="flex items-center gap-1.5 text-[11px] text-amber-400 pt-0.5">
                                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                <span>Verrouillage majuscule activé</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action button */}
                                    <button
                                        type="submit"
                                        disabled={isLoading || isSuccess}
                                        className={`w-full h-10 rounded-lg font-medium text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
                                            isSuccess
                                                ? "bg-emerald-600 text-white"
                                                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950/50 hover:shadow-indigo-900/40 active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed"
                                        }`}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                <span>Validation du profil...</span>
                                            </>
                                        ) : isSuccess ? (
                                            <>
                                                <Check className="w-4 h-4" />
                                                <span>Accès autorisé • Redirection</span>
                                            </>
                                        ) : (
                                            <>
                                                <span>Déverrouiller la session</span>
                                                <ArrowRight className="w-4 h-4" />
                                            </>
                                        )}
                                    </button>

                                    {/* Switch to manual account */}
                                    <div className="pt-2 text-center">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsManualMode(true);
                                                setEmail("");
                                                setPassword("");
                                                setErrorMessage("");
                                                setTimeout(() => emailInputRef.current?.focus(), 50);
                                            }}
                                            className="text-xs text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                                            <span>Se connecter avec un autre identifiant</span>
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                /* MODE 2: MANUAL CREDENTIAL INPUT */
                                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                                    {/* Email */}
                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="lp-email"
                                            className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300"
                                        >
                                            Identifiant ou Email
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                                <Mail className="w-4 h-4" />
                                            </div>
                                            <input
                                                ref={emailInputRef}
                                                id="lp-email"
                                                type="email"
                                                placeholder="nom.prenom@entreprise.com"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                disabled={isLoading || isSuccess}
                                                autoComplete="username"
                                                required
                                                className="w-full h-10 pl-9 pr-3 bg-slate-950/90 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                                            />
                                        </div>
                                    </div>

                                    {/* Password */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label
                                                htmlFor="lp-password"
                                                className="text-[11px] font-semibold uppercase tracking-wider text-slate-300"
                                            >
                                                Mot de passe
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => router.push("/forgot-password")}
                                                className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                                            >
                                                Oublié ?
                                            </button>
                                        </div>

                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                                <Lock className="w-4 h-4" />
                                            </div>
                                            <input
                                                ref={passwordInputRef}
                                                id="lp-password"
                                                type={showPassword ? "text" : "password"}
                                                placeholder="••••••••••••"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                onKeyUp={handleKeyUp}
                                                onKeyDown={handleKeyDown}
                                                disabled={isLoading || isSuccess}
                                                autoComplete="current-password"
                                                required
                                                className="w-full h-10 pl-9 pr-10 bg-slate-950/90 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                                                tabIndex={-1}
                                                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                                            >
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>

                                        {capsLockActive && (
                                            <div className="flex items-center gap-1.5 text-[11px] text-amber-400 pt-0.5">
                                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                <span>Verrouillage majuscule activé</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Remember device checkbox */}
                                    <div className="flex items-center gap-2 pt-0.5">
                                        <input
                                            id="remember-device"
                                            type="checkbox"
                                            checked={rememberDevice}
                                            onChange={(e) => setRememberDevice(e.target.checked)}
                                            className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
                                        />
                                        <label
                                            htmlFor="remember-device"
                                            className="text-xs text-slate-400 cursor-pointer select-none"
                                        >
                                            Mémoriser ce poste pour la reconnexion rapide
                                        </label>
                                    </div>

                                    {/* Submit button */}
                                    <button
                                        type="submit"
                                        disabled={isLoading || isSuccess}
                                        className={`w-full h-10 rounded-lg font-medium text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
                                            isSuccess
                                                ? "bg-emerald-600 text-white"
                                                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950/50 hover:shadow-indigo-900/40 active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed"
                                        }`}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                <span>Vérification des accès...</span>
                                            </>
                                        ) : isSuccess ? (
                                            <>
                                                <Check className="w-4 h-4" />
                                                <span>Accès autorisé • Redirection</span>
                                            </>
                                        ) : (
                                            <>
                                                <span>Connexion au terminal</span>
                                                <ArrowRight className="w-4 h-4" />
                                            </>
                                        )}
                                    </button>

                                    {/* Return to saved account if exists */}
                                    {savedAccounts.length > 0 && (
                                        <div className="pt-2 text-center">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsManualMode(false);
                                                    setActiveAccount(savedAccounts[0]);
                                                    setEmail(savedAccounts[0].email);
                                                    setPassword("");
                                                    setErrorMessage("");
                                                }}
                                                className="text-xs text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                                            >
                                                <span>← Revenir au profil de {savedAccounts[0].name}</span>
                                            </button>
                                        </div>
                                    )}
                                </form>
                            )}
                        </div>

                        {/* Card bottom security assurance footer */}
                        <div className="px-6 py-3.5 bg-slate-950/70 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                            <div className="flex items-center gap-1.5">
                                <Shield className="w-3.5 h-3.5 text-slate-400" />
                                <span>Contrôle RBAC Actif</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Laptop className="w-3.5 h-3.5 text-slate-400" />
                                <span>Session Protégée</span>
                            </div>
                        </div>
                    </div>

                    {/* Outer Footer Notice */}
                    <div className="mt-4 text-center text-slate-400 text-xs">
                        Usage strictement réservé aux utilisateurs autorisés. Toute tentative d&apos;accès non autorisée est tracée et consignée.
                    </div>
                </div>
            </main>

            {/* Bottom Enterprise Footer */}
            <footer className="relative z-10 w-full border-t border-slate-800/70 bg-[#090e18]/80 backdrop-blur-md px-6 py-3">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
                    <p>© {new Date().getFullYear()} Captain Prospect CRM. Tous droits réservés.</p>
                    <div className="flex items-center gap-4 text-[11px]">
                        <span>Politique de Confidentialité</span>
                        <span className="text-slate-700">•</span>
                        <span>Audits & Conformité</span>
                        <span className="text-slate-700">•</span>
                        <span>Support Technique</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
