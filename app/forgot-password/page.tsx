"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    Mail,
    ArrowLeft,
    ArrowRight,
    AlertCircle,
    CheckCircle2,
    Loader2,
    Shield,
    KeyRound
} from "lucide-react";
import { brand } from "@/lib/brand";

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!email.trim()) {
            setError("Veuillez renseigner votre identifiant ou adresse email.");
            return;
        }

        setIsLoading(true);

        try {
            const res = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim().toLowerCase() }),
            });

            if (!res.ok) {
                throw new Error("Erreur serveur");
            }

            setSuccess(true);
        } catch {
            setError("Une erreur est survenue lors de la demande. Veuillez réessayer.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col justify-between bg-inverse text-slate-100 font-sans selection:bg-primary-500/30 relative overflow-hidden">
            {/* Top Security Header */}
            <header className="relative z-10 w-full border-b border-inverse-line bg-inverse-raised px-6 py-3.5">
                <div className="max-w-7xl mx-auto flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-md bg-primary-600/20 border border-primary-500/40 flex items-center justify-center">
                            <Shield className="w-3.5 h-3.5 text-primary-400" />
                        </div>
                        <span className="font-semibold tracking-wider uppercase text-slate-300 text-[11px]">
                            {brand.name} <span className="text-slate-500 font-normal">| Récupération d&apos;Accès</span>
                        </span>
                    </div>

                    <div className="hidden sm:flex items-center gap-2 text-slate-400 text-[11px]">
                        <span>Lien valable 1 heure</span>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
                <div
                    className={`w-full max-w-[430px] transition-all duration-300 ${
                        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
                    }`}
                >
                    <div className="bg-inverse-raised border border-inverse-line rounded-xl shadow-2xl shadow-black/60 overflow-hidden relative">
                        <div className="h-[2px] w-full bg-primary-500 opacity-80" />

                        <div className="p-7 sm:p-8">
                            {/* Brand Header */}
                            <div className="flex flex-col items-center text-center mb-6">
                                <div className="w-10 h-10 rounded-lg bg-primary-950/70 border border-primary-700/60 flex items-center justify-center mb-3">
                                    <KeyRound className="w-5 h-5 text-primary-400" />
                                </div>
                                <h1 className="text-lg font-semibold tracking-tight text-white">
                                    Réinitialisation du mot de passe
                                </h1>
                                <p className="text-xs text-slate-400 mt-1 max-w-[290px]">
                                    Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation.
                                </p>
                            </div>

                            {/* Error Alert */}
                            {error && (
                                <div
                                    role="alert"
                                    className="mb-5 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-start gap-2.5 animate-fadeIn"
                                >
                                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                    <div className="flex-1 leading-relaxed">{error}</div>
                                </div>
                            )}

                            {success ? (
                                <div className="space-y-4">
                                    <div className="p-4 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs flex items-start gap-3">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                                        <div className="leading-relaxed">
                                            Si un compte actif est associé à cet identifiant, un lien de réinitialisation sécurisé vient d&apos;être transmis. Pensez à vérifier vos courriers indésirables.
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => router.push("/login")}
                                        className="w-full h-10 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-medium text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                        <span>Retour à la connexion</span>
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="fp-email"
                                            className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300"
                                        >
                                            Identifiant ou Email
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                                <Mail className="w-4 h-4" />
                                            </div>
                                            <input
                                                id="fp-email"
                                                type="email"
                                                placeholder="nom.prenom@entreprise.com"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                disabled={isLoading}
                                                autoComplete="email"
                                                autoFocus
                                                required
                                                className="w-full h-10 pl-9 pr-3 bg-slate-950/90 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all font-mono"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full h-10 rounded-lg font-medium text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-500 text-white shadow-sm active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                <span>Envoi…</span>
                                            </>
                                        ) : (
                                            <>
                                                <span>Envoyer le lien</span>
                                                <ArrowRight className="w-4 h-4" />
                                            </>
                                        )}
                                    </button>

                                    <div className="pt-2 text-center">
                                        <button
                                            type="button"
                                            onClick={() => router.push("/login")}
                                            className="text-xs text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <ArrowLeft className="w-3.5 h-3.5" />
                                            <span>Retour à la connexion</span>
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Bottom Footer */}
            <footer className="relative z-10 w-full border-t border-inverse-line bg-inverse-raised px-6 py-3">
                <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-slate-500">
                    <p>© {new Date().getFullYear()} {brand.productName}</p>
                </div>
            </footer>
        </div>
    );
}
