"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
    ArrowLeft,
    Save,
    Loader2,
    Building2,
    Receipt,
    AlertCircle,
    Landmark,
    Scale,
    CreditCard,
    CheckCircle2,
    Mail,
    Phone,
    Globe,
    Shield,
    Plug,
} from "lucide-react";
import { Button, Input, Badge } from "@/components/ui";
import Link from "next/link";

interface CompanyIssuer {
    id?: string;
    legalName: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
    siret: string;
    vatNumber: string;
    email: string;
    phone: string;
    logo: string;
    legalForm: string;
    capitalSocial: string;
    rcsCity: string;
    rcsNumber: string;
    iban: string;
    bic: string;
    defaultPaymentTermsDays: number;
    defaultLatePenaltyRate: number;
    defaultEarlyPaymentDiscount: string;
}

function SectionCard({ icon: Icon, iconBg, iconColor, title, description, children, badge }: {
    icon: any; iconBg: string; iconColor: string; title: string; description: string; children: React.ReactNode; badge?: React.ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between p-6 pb-0">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${iconColor}`} />
                    </div>
                    <div>
                        <h2 className="font-semibold text-slate-900">{title}</h2>
                        <p className="text-sm text-slate-500">{description}</p>
                    </div>
                </div>
                {badge}
            </div>
            <div className="p-6 pt-5">{children}</div>
        </div>
    );
}

function FormField({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
                {label} {required && <span className="text-red-400">*</span>}
            </label>
            {children}
            {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
        </div>
    );
}

export default function BillingSettingsPage() {
    const { success, error: showError } = useToast();
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [issuer, setIssuer] = useState<CompanyIssuer>({
        legalName: "", address: "", city: "", postalCode: "", country: "France",
        siret: "", vatNumber: "", email: "", phone: "", logo: "",
        legalForm: "", capitalSocial: "", rcsCity: "", rcsNumber: "",
        iban: "", bic: "",
        defaultPaymentTermsDays: 30, defaultLatePenaltyRate: 0,
        defaultEarlyPaymentDiscount: "Pas d'escompte pour paiement anticipé",
    });
    const [isConfigured, setIsConfigured] = useState(false);

    useEffect(() => { fetchIssuer(); }, []);

    const fetchIssuer = async () => {
        try {
            const res = await fetch("/api/billing/company-issuer");
            const json = await res.json();
            if (json.success) {
                setIssuer({
                    id: json.data.id,
                    legalName: json.data.legalName || "", address: json.data.address || "",
                    city: json.data.city || "", postalCode: json.data.postalCode || "",
                    country: json.data.country || "France", siret: json.data.siret || "",
                    vatNumber: json.data.vatNumber || "", email: json.data.email || "",
                    phone: json.data.phone || "", logo: json.data.logo || "",
                    legalForm: json.data.legalForm || "", capitalSocial: json.data.capitalSocial || "",
                    rcsCity: json.data.rcsCity || "", rcsNumber: json.data.rcsNumber || "",
                    iban: json.data.iban || "", bic: json.data.bic || "",
                    defaultPaymentTermsDays: json.data.defaultPaymentTermsDays ?? 30,
                    defaultLatePenaltyRate: Number(json.data.defaultLatePenaltyRate ?? 0),
                    defaultEarlyPaymentDiscount: json.data.defaultEarlyPaymentDiscount || "Pas d'escompte pour paiement anticipé",
                });
                setIsConfigured(true);
            }
        } catch {} finally { setIsLoading(false); }
    };

    const handleSave = async () => {
        if (!issuer.legalName || !issuer.address || !issuer.city || !issuer.postalCode || !issuer.siret) {
            showError("Erreur", "Veuillez remplir tous les champs obligatoires"); return;
        }
        setIsSaving(true);
        try {
            const res = await fetch("/api/billing/company-issuer", {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(issuer),
            });
            const json = await res.json();
            if (json.success) {
                success("Sauvegardé", "Configuration mise à jour");
                setIsConfigured(true);
                if (json.data.id) setIssuer((prev) => ({ ...prev, id: json.data.id }));
            } else showError("Erreur", json.error);
        } catch { showError("Erreur", "Impossible de sauvegarder"); }
        finally { setIsSaving(false); }
    };

    // Completeness check
    const completeness = (() => {
        const fields = [
            issuer.legalName, issuer.address, issuer.city, issuer.postalCode, issuer.siret,
            issuer.vatNumber, issuer.legalForm, issuer.capitalSocial, issuer.rcsCity,
            issuer.iban, issuer.bic, issuer.email,
        ];
        const filled = fields.filter(Boolean).length;
        return Math.round((filled / fields.length) * 100);
    })();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            {/* Header */}
            <div>
                <Link href="/manager/billing" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-3">
                    <ArrowLeft className="w-4 h-4" />
                    Facturation
                </Link>
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
                        <p className="text-sm text-slate-500 mt-1">Informations entreprise - Conformité EU 2026</p>
                    </div>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        Enregistrer
                    </Button>
                </div>
            </div>

            {/* Completeness bar */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    completeness === 100 ? "bg-emerald-100" : "bg-amber-100"
                }`}>
                    {completeness === 100 ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                        <Shield className="w-5 h-5 text-amber-600" />
                    )}
                </div>
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-slate-900">
                            {completeness === 100 ? "Configuration complète" : "Configuration en cours"}
                        </p>
                        <span className="text-xs font-semibold text-slate-500">{completeness}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ${
                                completeness === 100 ? "bg-emerald-500" : completeness >= 70 ? "bg-primary-500" : "bg-amber-500"
                            }`}
                            style={{ width: `${completeness}%` }}
                        />
                    </div>
                </div>
            </div>

            {!isConfigured && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-amber-900">Configuration requise</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                            Configurez votre entreprise avant de créer des factures conformes Factur-X EN16931.
                        </p>
                    </div>
                </div>
            )}

            {/* Company Identity */}
            <SectionCard
                icon={Receipt}
                iconBg="bg-primary-50 ring-1 ring-inset ring-primary-100"
                iconColor="text-primary-600"
                title="Identité de l'entreprise"
                description="Informations qui apparaîtront sur vos factures"
                badge={isConfigured ? <Badge variant="success">Configuré</Badge> : undefined}
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Raison sociale" required>
                            <Input value={issuer.legalName} onChange={(e) => setIssuer({ ...issuer, legalName: e.target.value })} placeholder="Nom légal" />
                        </FormField>
                        <FormField label="Forme juridique" hint="SAS, SARL, EURL, SA...">
                            <Input value={issuer.legalForm} onChange={(e) => setIssuer({ ...issuer, legalForm: e.target.value })} placeholder="SAS" />
                        </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Capital social">
                            <Input value={issuer.capitalSocial} onChange={(e) => setIssuer({ ...issuer, capitalSocial: e.target.value })} placeholder="10 000 €" />
                        </FormField>
                        <FormField label="Pays">
                            <Input value={issuer.country} onChange={(e) => setIssuer({ ...issuer, country: e.target.value })} placeholder="France" />
                        </FormField>
                    </div>
                    <FormField label="Adresse" required>
                        <Input value={issuer.address} onChange={(e) => setIssuer({ ...issuer, address: e.target.value })} placeholder="Adresse du siège social" />
                    </FormField>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Code postal" required>
                            <Input value={issuer.postalCode} onChange={(e) => setIssuer({ ...issuer, postalCode: e.target.value })} placeholder="75001" />
                        </FormField>
                        <FormField label="Ville" required>
                            <Input value={issuer.city} onChange={(e) => setIssuer({ ...issuer, city: e.target.value })} placeholder="Paris" />
                        </FormField>
                    </div>
                </div>
            </SectionCard>

            {/* Fiscal Information */}
            <SectionCard
                icon={Scale}
                iconBg="bg-emerald-50 ring-1 ring-inset ring-emerald-100"
                iconColor="text-emerald-600"
                title="Informations fiscales"
                description="Mentions légales obligatoires"
            >
                <div className="space-y-4">
                    <FormField label="SIRET" required hint="Numéro à 14 chiffres (SIREN + NIC)">
                        <Input value={issuer.siret} onChange={(e) => setIssuer({ ...issuer, siret: e.target.value })} placeholder="12345678901234" />
                    </FormField>
                    <FormField label="TVA intracommunautaire">
                        <Input value={issuer.vatNumber} onChange={(e) => setIssuer({ ...issuer, vatNumber: e.target.value })} placeholder="FR12345678901" />
                    </FormField>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Ville du RCS">
                            <Input value={issuer.rcsCity} onChange={(e) => setIssuer({ ...issuer, rcsCity: e.target.value })} placeholder="Paris" />
                        </FormField>
                        <FormField label="Numéro RCS">
                            <Input value={issuer.rcsNumber} onChange={(e) => setIssuer({ ...issuer, rcsNumber: e.target.value })} placeholder="Paris B 123 456 789" />
                        </FormField>
                    </div>
                </div>
            </SectionCard>

            {/* Bank Details */}
            <SectionCard
                icon={CreditCard}
                iconBg="bg-accent-50 ring-1 ring-inset ring-accent-100"
                iconColor="text-accent-600"
                title="Coordonnées bancaires"
                description="Pour le paiement par virement"
            >
                <div className="space-y-4">
                    <FormField label="IBAN">
                        <Input value={issuer.iban} onChange={(e) => setIssuer({ ...issuer, iban: e.target.value })} placeholder="FR76 1234 5678 9012 3456 7890 123" />
                    </FormField>
                    <FormField label="BIC / SWIFT">
                        <Input value={issuer.bic} onChange={(e) => setIssuer({ ...issuer, bic: e.target.value })} placeholder="BNPAFRPPXXX" />
                    </FormField>
                </div>
            </SectionCard>

            {/* Default Invoice Settings */}
            <SectionCard
                icon={Landmark}
                iconBg="bg-amber-50 ring-1 ring-inset ring-amber-100"
                iconColor="text-amber-600"
                title="Paramètres par défaut"
                description="Pénalités, escompte, délais"
            >
                <div className="space-y-4">
                    <FormField label="Délai de paiement (jours)" hint="Délai légal max : 60j ou 45j fin de mois">
                        <Input
                            type="number" min="0" max="365"
                            value={issuer.defaultPaymentTermsDays}
                            onChange={(e) => setIssuer({ ...issuer, defaultPaymentTermsDays: parseInt(e.target.value) || 30 })}
                            placeholder="30"
                        />
                    </FormField>
                    <FormField label="Taux pénalités de retard (%)" hint="Si 0, la mention &quot;3x le taux légal&quot; sera affichée. L'indemnité de 40€ est toujours mentionnée.">
                        <Input
                            type="number" step="0.01" min="0" max="100"
                            value={issuer.defaultLatePenaltyRate}
                            onChange={(e) => setIssuer({ ...issuer, defaultLatePenaltyRate: parseFloat(e.target.value) || 0 })}
                            placeholder="3.75"
                        />
                    </FormField>
                    <FormField label="Escompte paiement anticipé" hint="Mention obligatoire même si aucun escompte n'est accordé">
                        <Input
                            value={issuer.defaultEarlyPaymentDiscount}
                            onChange={(e) => setIssuer({ ...issuer, defaultEarlyPaymentDiscount: e.target.value })}
                            placeholder="Pas d'escompte pour paiement anticipé"
                        />
                    </FormField>
                </div>
            </SectionCard>

            {/* Contact */}
            <SectionCard
                icon={Building2}
                iconBg="bg-slate-100"
                iconColor="text-slate-600"
                title="Contact"
                description="Coordonnées de l'entreprise"
            >
                <div className="space-y-4">
                    <FormField label="Email">
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                type="email"
                                value={issuer.email}
                                onChange={(e) => setIssuer({ ...issuer, email: e.target.value })}
                                placeholder="facturation@entreprise.com"
                                className="pl-10"
                            />
                        </div>
                    </FormField>
                    <FormField label="Téléphone">
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                value={issuer.phone}
                                onChange={(e) => setIssuer({ ...issuer, phone: e.target.value })}
                                placeholder="+33 1 23 45 67 89"
                                className="pl-10"
                            />
                        </div>
                    </FormField>
                </div>
            </SectionCard>

            {/* Integrations */}
            <SectionCard
                icon={Plug}
                iconBg="bg-cyan-50 ring-1 ring-inset ring-cyan-100"
                iconColor="text-cyan-600"
                title="Intégrations"
                description="Services connectés"
            >
                <div className="space-y-3">
                    {[
                        {
                            name: "Qonto",
                            desc: "Rapprochement automatique des paiements",
                            enabled: process.env.NEXT_PUBLIC_QONTO_ENABLED === "true",
                        },
                        {
                            name: "Pappers",
                            desc: "Recherche d'entreprises françaises",
                            enabled: process.env.NEXT_PUBLIC_PAPPERS_ENABLED === "true",
                        },
                    ].map((integration) => (
                        <div
                            key={integration.name}
                            className="flex items-center justify-between p-4 rounded-xl bg-slate-50/80 hover:bg-slate-50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                                    <Globe className="w-4 h-4 text-slate-500" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-900">{integration.name}</p>
                                    <p className="text-xs text-slate-500">{integration.desc}</p>
                                </div>
                            </div>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                                integration.enabled
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-slate-100 text-slate-500"
                            }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${integration.enabled ? "bg-emerald-500" : "bg-slate-300"}`} />
                                {integration.enabled ? "Connecté" : "Non configuré"}
                            </span>
                        </div>
                    ))}
                </div>
            </SectionCard>

            {/* Bottom Save */}
            <div className="flex gap-3 pb-8">
                <Link href="/manager/billing" className="flex-1">
                    <Button variant="secondary" className="w-full">Annuler</Button>
                </Link>
                <Button onClick={handleSave} disabled={isSaving} className="flex-[2]">
                    {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Enregistrer les modifications
                </Button>
            </div>
        </div>
    );
}
