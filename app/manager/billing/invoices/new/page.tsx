"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
    Save,
    Loader2,
    ArrowLeft,
    Calendar,
    FileText,
    Users,
    ShoppingBag,
    StickyNote,
    CreditCard,
} from "lucide-react";
import { Button, Input } from "@/components/ui";
import { ClientSearch } from "@/components/billing/ClientSearch";
import { InvoiceItemsTable, InvoiceItem } from "@/components/billing/InvoiceItemsTable";
import Link from "next/link";

interface OffreOption {
    id: string;
    nom: string;
    fixeMensuel: number;
    prixParRdv: number;
}

interface BillingClient {
    id?: string;
    legalName: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
    siret?: string | null;
    vatNumber?: string | null;
}

export default function NewInvoicePage() {
    const { success, error: showError } = useToast();
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [companyIssuer, setCompanyIssuer] = useState<any>(null);
    const [selectedClient, setSelectedClient] = useState<BillingClient | null>(null);
    const [items, setItems] = useState<InvoiceItem[]>([
        { description: "", quantity: 1, unitPriceHt: 0, vatRate: 20 },
    ]);
    const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
    const [dueDate, setDueDate] = useState(() => {
        const date = new Date();
        date.setDate(date.getDate() + 30);
        return date.toISOString().split("T")[0];
    });
    const [paymentTermsDays, setPaymentTermsDays] = useState(30);
    const [paymentTermsText, setPaymentTermsText] = useState("");
    const [notes, setNotes] = useState("");
    const [offres, setOffres] = useState<OffreOption[]>([]);
    const [selectedOffreId, setSelectedOffreId] = useState<string>("");

    useEffect(() => {
        fetch("/api/billing/company-issuer")
            .then((res) => res.json())
            .then((json) => {
                if (json.success) {
                    setCompanyIssuer(json.data);
                    if (json.data.defaultPaymentTermsDays) {
                        setPaymentTermsDays(json.data.defaultPaymentTermsDays);
                        const date = new Date();
                        date.setDate(date.getDate() + json.data.defaultPaymentTermsDays);
                        setDueDate(date.toISOString().split("T")[0]);
                    }
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        fetch("/api/billing/offres")
            .then((res) => res.json())
            .then((json) => {
                if (json.success && json.data?.length) {
                    setOffres(json.data.map((o: any) => ({
                        id: o.id,
                        nom: o.nom,
                        fixeMensuel: Number(o.fixeMensuel),
                        prixParRdv: Number(o.prixParRdv),
                    })));
                }
            })
            .catch(() => {});
    }, []);

    const applyOffre = (offreId: string) => {
        setSelectedOffreId(offreId);
        if (!offreId) {
            setItems([{ description: "", quantity: 1, unitPriceHt: 0, vatRate: 20 }]);
            return;
        }
        const o = offres.find((x) => x.id === offreId);
        if (!o) return;
        const fixeHt = o.fixeMensuel;
        const rdvHt = o.prixParRdv;
        const vat = 20;
        setItems([
            {
                description: `${o.nom} — Forfait mensuel`,
                quantity: 1,
                unitPriceHt: fixeHt,
                vatRate: vat,
                totalHt: Math.round(fixeHt * 100) / 100,
                totalVat: Math.round(fixeHt * (vat / 100) * 100) / 100,
                totalTtc: Math.round((fixeHt * (1 + vat / 100)) * 100) / 100,
            },
            {
                description: `${o.nom} — Prestation RDV`,
                quantity: 0,
                unitPriceHt: rdvHt,
                vatRate: vat,
                totalHt: 0,
                totalVat: 0,
                totalTtc: 0,
            },
        ]);
    };

    const handlePaymentTermsChange = (days: number) => {
        setPaymentTermsDays(days);
        const date = new Date(issueDate);
        date.setDate(date.getDate() + days);
        setDueDate(date.toISOString().split("T")[0]);
    };

    const calculateTotals = () => {
        const totals = items.reduce(
            (acc, item) => ({
                totalHt: acc.totalHt + (item.totalHt || 0),
                totalVat: acc.totalVat + (item.totalVat || 0),
                totalTtc: acc.totalTtc + (item.totalTtc || 0),
            }),
            { totalHt: 0, totalVat: 0, totalTtc: 0 }
        );
        return {
            totalHt: Math.round(totals.totalHt * 100) / 100,
            totalVat: Math.round(totals.totalVat * 100) / 100,
            totalTtc: Math.round(totals.totalTtc * 100) / 100,
        };
    };

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);

    const handleSave = async () => {
        if (!selectedClient) { showError("Erreur", "Veuillez sélectionner un client"); return; }
        if (!selectedClient.id) { showError("Erreur", "Le client doit être enregistré"); return; }
        if (!companyIssuer) { showError("Erreur", "Émetteur non configuré. Allez dans Paramètres."); return; }
        if (items.length === 0 || items.some((i) => !i.description)) {
            showError("Erreur", "Veuillez ajouter au moins un article avec une description"); return;
        }

        setIsSaving(true);
        try {
            const res = await fetch("/api/billing/invoices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    billingClientId: selectedClient.id,
                    companyIssuerId: companyIssuer.id,
                    issueDate,
                    dueDate,
                    paymentTermsDays,
                    paymentTermsText: paymentTermsText || undefined,
                    notes: notes || undefined,
                    items: items.map((item) => ({
                        description: item.description,
                        quantity: item.quantity,
                        unitPriceHt: item.unitPriceHt,
                        vatRate: item.vatRate,
                    })),
                }),
            });
            const json = await res.json();
            if (json.success) {
                success("Facture créée", "La facture a été créée avec succès");
                router.push(`/manager/billing/invoices/${json.data.id}`);
            } else {
                showError("Erreur", json.error);
            }
        } catch {
            showError("Erreur", "Impossible de créer la facture");
        } finally {
            setIsSaving(false);
        }
    };

    const totals = calculateTotals();

    // Progress steps
    const steps = [
        { label: "Client", icon: Users, done: !!selectedClient },
        { label: "Articles", icon: ShoppingBag, done: items.some((i) => i.description && i.unitPriceHt > 0) },
        { label: "Dates", icon: Calendar, done: !!issueDate && !!dueDate },
    ];
    const completedSteps = steps.filter((s) => s.done).length;

    return (
        <div className="space-y-6 max-w-[1200px] mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <Link href="/manager/billing/invoices" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-3">
                        <ArrowLeft className="w-4 h-4" />
                        Factures
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900">Nouvelle facture</h1>
                    <p className="text-sm text-slate-500 mt-1">Conforme Factur-X EN16931</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/manager/billing/invoices">
                        <Button variant="ghost">Annuler</Button>
                    </Link>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        Enregistrer
                    </Button>
                </div>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-white border border-slate-200">
                {steps.map((step, idx) => {
                    const Icon = step.icon;
                    return (
                        <div key={idx} className="flex items-center gap-3 flex-1">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                step.done ? "bg-primary-100" : "bg-slate-100"
                            }`}>
                                <Icon className={`w-4 h-4 ${step.done ? "text-primary-600" : "text-slate-400"}`} />
                            </div>
                            <div className="flex-1">
                                <p className={`text-xs font-medium ${step.done ? "text-primary-600" : "text-slate-400"}`}>{step.label}</p>
                                <div className="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-500 ${step.done ? "bg-primary-500 w-full" : "w-0"}`} />
                                </div>
                            </div>
                            {idx < steps.length - 1 && <div className="w-px h-8 bg-slate-100 mx-2" />}
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Main content */}
                <div className="lg:col-span-8 space-y-6">
                    {/* Client */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center">
                                <Users className="w-3.5 h-3.5 text-primary-600" />
                            </div>
                            <h2 className="text-base font-semibold text-slate-900">Client</h2>
                        </div>
                        <ClientSearch onSelect={setSelectedClient} selectedClient={selectedClient} />
                    </div>

                    {/* Items */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-6">
                        <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-accent-100 flex items-center justify-center">
                                    <ShoppingBag className="w-3.5 h-3.5 text-accent-600" />
                                </div>
                                <h2 className="text-base font-semibold text-slate-900">Articles & prestations</h2>
                            </div>
                            {offres.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <label className="text-sm text-slate-500 whitespace-nowrap">Partir d&apos;une offre :</label>
                                    <select
                                        value={selectedOffreId}
                                        onChange={(e) => applyOffre(e.target.value)}
                                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
                                    >
                                        <option value="">— Choisir une offre —</option>
                                        {offres.map((o) => (
                                            <option key={o.id} value={o.id}>
                                                {o.nom} ({o.fixeMensuel} € + {o.prixParRdv} €/RDV)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        <InvoiceItemsTable items={items} onChange={setItems} />
                    </div>

                    {/* Notes */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                                <StickyNote className="w-3.5 h-3.5 text-amber-600" />
                            </div>
                            <h2 className="text-base font-semibold text-slate-900">Notes</h2>
                        </div>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Notes ou commentaires internes (optionnel)..."
                            className="w-full border border-slate-200 rounded-xl p-4 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 min-h-[100px] resize-y transition-all duration-200"
                        />
                    </div>
                </div>

                {/* Right sidebar */}
                <div className="lg:col-span-4 space-y-6">
                    {/* Dates */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                            </div>
                            <h2 className="text-base font-semibold text-slate-900">Dates & échéances</h2>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1.5 block">Date d&apos;émission</label>
                                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1.5 block">Délai de paiement</label>
                                <div className="flex gap-2 items-center">
                                    <Input
                                        type="number"
                                        min="0"
                                        max="365"
                                        value={paymentTermsDays}
                                        onChange={(e) => handlePaymentTermsChange(parseInt(e.target.value) || 30)}
                                    />
                                    <span className="text-sm text-slate-400 whitespace-nowrap">jours</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1.5 block">Date d&apos;échéance</label>
                                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1.5 block">Conditions (texte)</label>
                                <Input
                                    value={paymentTermsText}
                                    onChange={(e) => setPaymentTermsText(e.target.value)}
                                    placeholder={`Paiement à ${paymentTermsDays} jours`}
                                />
                                <p className="text-[11px] text-slate-400 mt-1">Vide = texte par défaut</p>
                            </div>
                        </div>
                    </div>

                    {/* Totals sticky */}
                    <div className="rounded-2xl border border-primary-200 bg-white p-6 sticky top-6">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center">
                                <CreditCard className="w-3.5 h-3.5 text-primary-600" />
                            </div>
                            <h2 className="text-base font-semibold text-slate-900">Récapitulatif</h2>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Total HT</span>
                                <span className="font-medium text-slate-700 tabular-nums">{formatCurrency(totals.totalHt)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">TVA</span>
                                <span className="font-medium text-slate-700 tabular-nums">{formatCurrency(totals.totalVat)}</span>
                            </div>
                            <div className="h-px bg-primary-100" />
                            <div className="flex justify-between items-baseline">
                                <span className="font-bold text-slate-900">Total TTC</span>
                                <span className="text-2xl font-bold text-primary-600 tabular-nums">{formatCurrency(totals.totalTtc)}</span>
                            </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-primary-100">
                            <Button onClick={handleSave} disabled={isSaving} className="w-full">
                                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                Créer la facture
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
