"use client";

import React, { useState } from "react";
import {
    Mail,
    Inbox,
    Users,
    Workflow,
    Shield,
    ArrowRight,
    ArrowLeft,
    CheckCircle2,
    Loader2,
    Server,
    AlertCircle,
    Eye,
    EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";

// ============================================
// TYPES
// ============================================

interface EmailOnboardingProps {
    onMailboxConnected?: () => void;
}

type ProviderType = "gmail" | "outlook" | "imap" | null;

// ============================================
// PROVIDER CARDS DATA
// ============================================

const PROVIDERS = [
    {
        id: "gmail" as const,
        name: "Gmail",
        description: "Connexion via Google OAuth",
        icon: "/icons/gmail.svg",
        color: "bg-red-500",
        bgColor: "bg-red-50",
        borderColor: "border-red-200 hover:border-red-400",
        selectedBorder: "border-red-400 ring-2 ring-red-400/20",
        features: ["Synchronisation automatique", "OAuth sécurisé", "Labels Gmail"],
    },
    {
        id: "outlook" as const,
        name: "Outlook / Microsoft 365",
        description: "Connexion via Microsoft OAuth",
        icon: "/icons/outlook.svg",
        color: "bg-blue-500",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-200 hover:border-blue-400",
        selectedBorder: "border-blue-400 ring-2 ring-blue-400/20",
        features: ["Synchronisation automatique", "OAuth sécurisé", "Catégories Outlook"],
    },
    {
        id: "imap" as const,
        name: "IMAP / SMTP",
        description: "Configuration manuelle",
        icon: null,
        color: "bg-slate-600",
        bgColor: "bg-slate-50",
        borderColor: "border-slate-200 hover:border-slate-400",
        selectedBorder: "border-slate-400 ring-2 ring-slate-400/20",
        features: ["Compatible tous fournisseurs", "Yahoo, iCloud, etc.", "Configuration personnalisée"],
    },
];

const FEATURES = [
    {
        icon: Inbox,
        title: "Boîte de réception unifiée",
        description: "Tous vos emails au même endroit",
    },
    {
        icon: Users,
        title: "Lien CRM automatique",
        description: "Associez les emails à vos clients",
    },
    {
        icon: Workflow,
        title: "Séquences automatisées",
        description: "Automatisez vos campagnes email",
    },
    {
        icon: Shield,
        title: "Connexion sécurisée",
        description: "Tokens chiffrés, OAuth2 sécurisé",
    },
];

// ============================================
// STEP INDICATOR
// ============================================

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
    return (
        <div className="flex items-center gap-2 mb-6">
            {Array.from({ length: totalSteps }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                    <div
                        className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-all duration-300",
                            i < currentStep
                                ? "bg-emerald-500 text-white"
                                : i === currentStep
                                    ? "bg-primary-600 text-white"
                                    : "bg-slate-100 text-slate-400"
                        )}
                    >
                        {i < currentStep ? (
                            <CheckCircle2 className="w-4 h-4" />
                        ) : (
                            i + 1
                        )}
                    </div>
                    {i < totalSteps - 1 && (
                        <div className={cn(
                            "w-8 h-0.5 rounded-full transition-all duration-300",
                            i < currentStep ? "bg-emerald-400" : "bg-slate-200"
                        )} />
                    )}
                </div>
            ))}
        </div>
    );
}

// ============================================
// IMAP FORM
// ============================================

interface ImapFormData {
    email: string;
    password: string;
    imapHost: string;
    imapPort: string;
    smtpHost: string;
    smtpPort: string;
    displayName: string;
}

function ImapConfigForm({
    onSubmit,
    onBack,
    isLoading,
    error,
}: {
    onSubmit: (data: ImapFormData) => void;
    onBack: () => void;
    isLoading: boolean;
    error: string | null;
}) {
    const [formData, setFormData] = useState<ImapFormData>({
        email: "",
        password: "",
        imapHost: "",
        imapPort: "993",
        smtpHost: "",
        smtpPort: "587",
        displayName: "",
    });
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    const updateField = (field: keyof ImapFormData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // Auto-fill server suggestions based on email domain
    const handleEmailChange = (email: string) => {
        updateField("email", email);
        const domain = email.split("@")[1]?.toLowerCase();
        if (domain) {
            const serverMap: Record<string, { imap: string; smtp: string }> = {
                "gmail.com": { imap: "imap.gmail.com", smtp: "smtp.gmail.com" },
                "yahoo.com": { imap: "imap.mail.yahoo.com", smtp: "smtp.mail.yahoo.com" },
                "yahoo.fr": { imap: "imap.mail.yahoo.com", smtp: "smtp.mail.yahoo.com" },
                "outlook.com": { imap: "outlook.office365.com", smtp: "smtp.office365.com" },
                "hotmail.com": { imap: "outlook.office365.com", smtp: "smtp.office365.com" },
                "icloud.com": { imap: "imap.mail.me.com", smtp: "smtp.mail.me.com" },
                "orange.fr": { imap: "imap.orange.fr", smtp: "smtp.orange.fr" },
                "free.fr": { imap: "imap.free.fr", smtp: "smtp.free.fr" },
                "sfr.fr": { imap: "imap.sfr.fr", smtp: "smtp.sfr.fr" },
                "laposte.net": { imap: "imap.laposte.net", smtp: "smtp.laposte.net" },
            };
            const match = serverMap[domain];
            if (match && !formData.imapHost) {
                setFormData(prev => ({
                    ...prev,
                    email,
                    imapHost: match.imap,
                    smtpHost: match.smtp,
                }));
                return;
            }
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5">
                    <AlertCircle className="w-4.5 h-4.5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[13px] text-red-700">{error}</p>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                    <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                        Adresse email
                    </label>
                    <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                        placeholder="vous@example.com"
                    />
                </div>

                <div className="col-span-2">
                    <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                        Nom d&apos;affichage
                    </label>
                    <input
                        type="text"
                        value={formData.displayName}
                        onChange={(e) => updateField("displayName", e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                        placeholder="Prénom Nom"
                    />
                </div>

                <div className="col-span-2">
                    <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                        Mot de passe / App Password
                    </label>
                    <div className="relative">
                        <input
                            type={showPassword ? "text" : "password"}
                            required
                            value={formData.password}
                            onChange={(e) => updateField("password", e.target.value)}
                            className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                            placeholder="••••••••"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                        Pour Gmail, utilisez un mot de passe d&apos;application
                    </p>
                </div>

                <div>
                    <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                        Serveur IMAP
                    </label>
                    <input
                        type="text"
                        required
                        value={formData.imapHost}
                        onChange={(e) => updateField("imapHost", e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                        placeholder="imap.example.com"
                    />
                </div>

                <div>
                    <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                        Port IMAP
                    </label>
                    <input
                        type="text"
                        required
                        value={formData.imapPort}
                        onChange={(e) => updateField("imapPort", e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                        placeholder="993"
                    />
                </div>

                <div>
                    <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                        Serveur SMTP
                    </label>
                    <input
                        type="text"
                        required
                        value={formData.smtpHost}
                        onChange={(e) => updateField("smtpHost", e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                        placeholder="smtp.example.com"
                    />
                </div>

                <div>
                    <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                        Port SMTP
                    </label>
                    <input
                        type="text"
                        required
                        value={formData.smtpPort}
                        onChange={(e) => updateField("smtpPort", e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                        placeholder="587"
                    />
                </div>
            </div>

            <div className="flex gap-3 pt-2">
                <button
                    type="button"
                    onClick={onBack}
                    disabled={isLoading}
                    className="flex items-center justify-center gap-2 flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm transition-colors disabled:opacity-50"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Retour
                </button>
                <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 text-white font-semibold text-sm hover:bg-primary-500 transition-colors disabled:opacity-50"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Connexion...
                        </>
                    ) : (
                        <>
                            Connecter
                            <ArrowRight className="w-4 h-4" />
                        </>
                    )}
                </button>
            </div>
        </form>
    );
}

// ============================================
// MAIN ONBOARDING COMPONENT
// ============================================

export function EmailOnboarding({ onMailboxConnected }: EmailOnboardingProps) {
    const [selectedProvider, setSelectedProvider] = useState<ProviderType>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);

    const currentStep = selectedProvider === "imap" ? 1 : 0;

    const handleProviderSelect = async (providerId: ProviderType) => {
        setError(null);

        if (providerId === "gmail") {
            window.location.href = "/api/email/oauth/gmail/connect";
        } else if (providerId === "outlook") {
            window.location.href = "/api/email/oauth/outlook/connect";
        } else if (providerId === "imap") {
            setSelectedProvider("imap");
        }
    };

    const handleImapSubmit = async (data: ImapFormData) => {
        setIsLoading(true);
        setError(null);

        try {
            const testResponse = await fetch("/api/email/mailboxes/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: data.email,
                    password: data.password,
                    imapHost: data.imapHost,
                    imapPort: parseInt(data.imapPort),
                    smtpHost: data.smtpHost,
                    smtpPort: parseInt(data.smtpPort),
                }),
            });

            const testResult = await testResponse.json();

            if (!testResult.success) {
                let errorMsg = "Échec de la connexion: ";
                if (!testResult.imapOk) errorMsg += "IMAP échoué. ";
                if (!testResult.smtpOk) errorMsg += "SMTP échoué. ";
                if (testResult.error) errorMsg += testResult.error;
                throw new Error(errorMsg);
            }

            const response = await fetch("/api/email/mailboxes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: "CUSTOM",
                    email: data.email,
                    displayName: data.displayName || data.email.split("@")[0],
                    password: data.password,
                    imapHost: data.imapHost,
                    imapPort: parseInt(data.imapPort),
                    smtpHost: data.smtpHost,
                    smtpPort: parseInt(data.smtpPort),
                }),
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || "Erreur lors de la création de la boîte mail");
            }

            // Show success state briefly
            setIsSuccess(true);
            setTimeout(() => {
                onMailboxConnected?.();
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur lors de la connexion");
        } finally {
            setIsLoading(false);
        }
    };

    // Success state
    if (isSuccess) {
        return (
            <div className="h-full flex items-center justify-center p-6">
                <div className="text-center animate-in zoom-in-95 fade-in duration-300">
                    <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-emerald-50 flex items-center justify-center">
                        <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Boîte mail connectée !</h2>
                    <p className="text-sm text-slate-500">Synchronisation en cours...</p>
                    <div className="mt-4">
                        <Loader2 className="w-5 h-5 text-primary-500 animate-spin mx-auto" />
                    </div>
                </div>
            </div>
        );
    }

    // IMAP Configuration View
    if (selectedProvider === "imap") {
        return (
            <div className="h-full flex items-center justify-center p-6">
                <div className="w-full max-w-lg">
                    <div className="flex justify-center">
                        <StepIndicator currentStep={currentStep} totalSteps={2} />
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 animate-in slide-in-from-right-3 fade-in duration-300">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-xl bg-slate-600 flex items-center justify-center">
                                <Server className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Configuration IMAP/SMTP</h2>
                                <p className="text-sm text-slate-500">Entrez les paramètres de votre serveur mail</p>
                            </div>
                        </div>

                        <ImapConfigForm
                            onSubmit={handleImapSubmit}
                            onBack={() => {
                                setSelectedProvider(null);
                                setError(null);
                            }}
                            isLoading={isLoading}
                            error={error}
                        />
                    </div>
                </div>
            </div>
        );
    }

    // Main Onboarding View
    return (
        <div className="h-full flex flex-col items-center justify-center p-6 overflow-y-auto">
            <div className="w-full max-w-3xl">
                <div className="flex justify-center">
                    <StepIndicator currentStep={0} totalSteps={2} />
                </div>

                {/* Header */}
                <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-3 duration-500">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary-600 flex items-center justify-center">
                        <Mail className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">
                        Bienvenue dans Email Hub
                    </h1>
                    <p className="text-slate-500 max-w-md mx-auto">
                        Connectez votre boîte mail pour commencer à gérer vos emails directement depuis {brand.name}
                    </p>
                </div>

                {/* Provider Selection */}
                <div className="mb-8">
                    <h2 className="text-sm font-semibold text-slate-700 mb-3">
                        Choisissez votre fournisseur email
                    </h2>
                    <div className="grid gap-3">
                        {PROVIDERS.map((provider, idx) => (
                            <button
                                key={provider.id}
                                onClick={() => handleProviderSelect(provider.id)}
                                className={cn(
                                    "group relative flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all",
                                    provider.borderColor,
                                    provider.bgColor,
                                    "hover:shadow-md"
                                )}
                                style={{ animationDelay: `${idx * 100}ms` }}
                            >
                                <div className={cn(
                                    "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                                    provider.color
                                )}>
                                    {provider.icon ? (
                                        <img src={provider.icon} alt={provider.name} className="w-6 h-6" />
                                    ) : (
                                        <Server className="w-6 h-6 text-white" />
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-slate-900">{provider.name}</h3>
                                        {provider.id !== "imap" && (
                                            <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-700 rounded-full">
                                                Recommandé
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-slate-500 mb-2">{provider.description}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {provider.features.map((feature, fidx) => (
                                            <span
                                                key={fidx}
                                                className="inline-flex items-center gap-1 text-xs text-slate-600"
                                            >
                                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                                {feature}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-1 transition-all flex-shrink-0" />
                            </button>
                        ))}
                    </div>
                </div>

                {/* Features */}
                <div className="border-t border-slate-200 pt-6">
                    <h2 className="text-sm font-semibold text-slate-700 mb-4 text-center">
                        Ce que vous pouvez faire avec Email Hub
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {FEATURES.map((feature, idx) => (
                            <div key={idx} className="text-center p-3 rounded-xl hover:bg-slate-50 transition-colors">
                                <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-primary-50 flex items-center justify-center">
                                    <feature.icon className="w-5 h-5 text-primary-600" />
                                </div>
                                <h3 className="text-sm font-medium text-slate-900 mb-0.5">
                                    {feature.title}
                                </h3>
                                <p className="text-xs text-slate-500">
                                    {feature.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default EmailOnboarding;
