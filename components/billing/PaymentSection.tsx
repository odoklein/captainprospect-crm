"use client";

import { useState } from "react";
import { Check, X, Clock, Loader2, Banknote, ArrowRight, ShieldCheck } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { useToast } from "@/components/ui";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Payment {
    id: string;
    amount: number;
    paymentDate: string;
    status: "MATCHED" | "CONFIRMED";
    matchedAt: string;
    confirmedAt?: string | null;
    confirmedBy?: {
        name: string;
    } | null;
}

interface PaymentSectionProps {
    invoiceId: string;
    payments: Payment[];
    invoiceStatus: string;
    onPaymentUpdate: () => void;
}

export function PaymentSection({
    invoiceId,
    payments,
    invoiceStatus,
    onPaymentUpdate,
}: PaymentSectionProps) {
    const { success, error: showError } = useToast();
    const [processing, setProcessing] = useState<string | null>(null);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);

    const handleConfirm = async (paymentId: string) => {
        setProcessing(paymentId);
        try {
            const res = await fetch(`/api/billing/payments/${paymentId}/confirm`, { method: "POST" });
            const json = await res.json();
            if (json.success) {
                success("Paiement confirmé", "Le paiement a été confirmé avec succès");
                onPaymentUpdate();
            } else {
                showError("Erreur", json.error);
            }
        } catch (err) {
            showError("Erreur", "Impossible de confirmer le paiement");
        } finally {
            setProcessing(null);
        }
    };

    const handleReject = async (paymentId: string) => {
        if (!confirm("Êtes-vous sûr de vouloir rejeter ce paiement ?")) return;
        setProcessing(paymentId);
        try {
            const res = await fetch(`/api/billing/payments/${paymentId}/reject`, { method: "POST" });
            const json = await res.json();
            if (json.success) {
                success("Paiement rejeté", "Le paiement a été rejeté");
                onPaymentUpdate();
            } else {
                showError("Erreur", json.error);
            }
        } catch (err) {
            showError("Erreur", "Impossible de rejeter le paiement");
        } finally {
            setProcessing(null);
        }
    };

    const matchedPayments = payments.filter((p) => p.status === "MATCHED");
    const confirmedPayments = payments.filter((p) => p.status === "CONFIRMED");

    // PAID state
    if (invoiceStatus === "PAID" && confirmedPayments.length > 0) {
        const payment = confirmedPayments[0];
        return (
            <div className="relative overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                            <ShieldCheck className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-emerald-900">Facture payée</h4>
                            <p className="text-xs text-emerald-600">Paiement confirmé</p>
                        </div>
                    </div>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                            <span className="text-emerald-700">Montant</span>
                            <span className="font-bold text-emerald-900 tabular-nums">{formatCurrency(payment.amount)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-emerald-700">Date</span>
                            <span className="text-emerald-900">
                                {format(new Date(payment.confirmedAt || payment.paymentDate), "dd MMM yyyy", { locale: fr })}
                            </span>
                        </div>
                        {payment.confirmedBy && (
                            <div className="flex justify-between items-center">
                                <span className="text-emerald-700">Confirmé par</span>
                                <span className="text-emerald-900">{payment.confirmedBy.name}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Matched payments waiting for confirmation
    if (matchedPayments.length > 0) {
        return (
            <div className="space-y-3">
                {matchedPayments.map((payment) => (
                    <div
                        key={payment.id}
                        className="relative overflow-hidden rounded-xl border border-amber-200 bg-amber-50 p-5"
                    >
                        <div className="relative">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                                        <Banknote className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-amber-900">Paiement détecté</h4>
                                        <p className="text-xs text-amber-600">Rapprochement Qonto</p>
                                    </div>
                                </div>
                                <Badge variant="warning">À confirmer</Badge>
                            </div>

                            <div className="space-y-1.5 text-sm mb-4">
                                <div className="flex justify-between">
                                    <span className="text-amber-700">Montant</span>
                                    <span className="font-bold text-amber-900 tabular-nums">{formatCurrency(payment.amount)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-amber-700">Date du paiement</span>
                                    <span className="text-amber-900">{format(new Date(payment.paymentDate), "dd/MM/yyyy")}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-amber-700">Détecté le</span>
                                    <span className="text-amber-900 text-xs">{format(new Date(payment.matchedAt), "dd/MM/yyyy HH:mm")}</span>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onClick={() => handleConfirm(payment.id)}
                                    disabled={processing === payment.id}
                                    className="flex-1"
                                >
                                    {processing === payment.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4 mr-1.5" />
                                            Confirmer
                                        </>
                                    )}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleReject(payment.id)}
                                    disabled={processing === payment.id}
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // No payment
    return (
        <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <Clock className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-500">En attente de paiement</p>
            <p className="text-xs text-slate-400 mt-1">Aucun paiement détecté</p>
        </div>
    );
}
