"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import {
    Activity,
    Coins,
    Cpu,
    Loader2,
    LogOut,
    Sparkles,
    TrendingDown,
    Zap,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import type { UserAiUsageSummary } from "@/lib/ai/usage";

interface LogoutConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function LogoutConfirmModal({ isOpen, onClose }: LogoutConfirmModalProps) {
    const [usage, setUsage] = useState<UserAiUsageSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        let active = true;
        setLoading(true);

        fetch("/api/ai/usage")
            .then((res) => (res.ok ? res.json() : null))
            .then((payload) => {
                if (!active || !payload) return;
                const data = payload.data ?? payload;
                setUsage(data);
            })
            .catch(() => {
                // Silently fallback if usage cannot be fetched
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [isOpen]);

    const handleConfirmLogout = async () => {
        setLoggingOut(true);
        await signOut({ callbackUrl: "/login" });
    };

    const formatTokens = (num: number) => {
        return new Intl.NumberFormat("fr-FR").format(num);
    };

    const formatEuros = (cost: number) => {
        if (cost < 0.01 && cost > 0) {
            return `${cost.toFixed(4).replace(".", ",")} €`;
        }
        return new Intl.NumberFormat("fr-FR", {
            style: "currency",
            currency: "EUR",
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
        }).format(cost);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Confirmation de déconnexion"
            size="md"
        >
            <div className="space-y-4">
                <p className="text-sm text-slate-600">
                    Voici le bilan de votre consommation d&apos;intelligence artificielle OpenAI avant de vous déconnecter :
                </p>

                {loading ? (
                    <div className="flex h-36 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/50">
                        <div className="flex items-center gap-2.5 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin text-accent-600" />
                            <span>Calcul de la consommation en cours…</span>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Highlights row */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* Today tokens */}
                            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3.5 shadow-sm">
                                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                                    <span>Tokens aujourd&apos;hui</span>
                                </div>
                                <div className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
                                    {formatTokens(usage?.today.tokens ?? 0)}
                                </div>
                                <div className="mt-1 text-[11px] text-slate-500">
                                    {usage?.today.requestCount ?? 0} requête{(usage?.today.requestCount ?? 0) > 1 ? "s" : ""}
                                </div>
                            </div>

                            {/* Cost in EUR */}
                            <div className="rounded-xl border border-rose-200/70 bg-gradient-to-br from-rose-50/40 via-white to-white p-3.5 shadow-sm">
                                <div className="flex items-center gap-2 text-xs font-medium text-rose-700">
                                    <Coins className="h-3.5 w-3.5 text-rose-600" />
                                    <span>Coût aujourd&apos;hui</span>
                                </div>
                                <div className="mt-1.5 text-xl font-bold tracking-tight text-rose-600">
                                    {formatEuros(usage?.today.costEur ?? 0)}
                                </div>
                                <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                                    <TrendingDown className="h-3 w-3" />
                                    <span>Tarif Low-Cost OpenAI</span>
                                </div>
                            </div>
                        </div>

                        {/* Total Account Consumption */}
                        <div className="rounded-xl border border-slate-200/90 bg-white p-3 text-xs text-slate-600 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 font-medium text-slate-700">
                                    <Activity className="h-3.5 w-3.5 text-slate-400" />
                                    Consommation cumulée totale
                                </span>
                                <span className="font-semibold text-slate-900">
                                    {formatTokens(usage?.total.tokens ?? 0)} tokens ({formatEuros(usage?.total.costEur ?? 0)})
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                                <span className="flex items-center gap-1.5">
                                    <Cpu className="h-3.5 w-3.5 text-slate-400" />
                                    Modèle optimisé
                                </span>
                                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-slate-700">
                                    {usage?.defaultModel ?? "gpt-4o-mini"}
                                </span>
                            </div>
                        </div>

                        {/* Low-cost notice */}
                        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-800 border border-emerald-200/60">
                            <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            <span>
                                Modèle <strong>gpt-4o-mini</strong> à 0,15 $ / 1M d&apos;entrée : vos requêtes sont ~95% plus économiques qu&apos;avec GPT-4o.
                            </span>
                        </div>
                    </div>
                )}

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={loggingOut}
                    >
                        Annuler
                    </Button>
                    <Button
                        type="button"
                        variant="danger"
                        onClick={handleConfirmLogout}
                        disabled={loggingOut}
                        icon={loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                    >
                        {loggingOut ? "Déconnexion…" : "Confirmer la déconnexion"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
