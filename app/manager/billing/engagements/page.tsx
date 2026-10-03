"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
    CalendarDays,
    Plus,
    Loader2,
    X,
    Edit2,
    Eye,
    Repeat,
    AlertTriangle,
} from "lucide-react";
import { Button, Input, Card, PageHeader, Badge } from "@/components/ui";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Engagement {
    id: string;
    clientId: string;
    clientName: string;
    offreTarifId: string;
    offreName: string;
    fixeMensuel: number;
    prixParRdv: number;
    fixeOverride: number | null;
    rdvOverride: number | null;
    dureeMois: number;
    debut: string;
    fin: string;
    statut: string;
    penaliteResiliation: string | null;
    renouvellement: string | null;
    createdAt: string;
    updatedAt: string;
}

interface ClientOption {
    id: string;
    name: string;
}

interface OffreOption {
    id: string;
    nom: string;
    fixeMensuel: number;
    prixParRdv: number;
    statut: string;
}

const STATUT_LABEL: Record<string, string> = {
    BROUILLON: "Brouillon",
    ACTIF: "Actif",
    EXPIRE: "Expiré",
    RENOUVELE: "Renouvelé",
    RESILIE: "Résilié",
    ARCHIVE: "Archivé",
};

export default function EngagementsPage() {
    const { success, error: showError } = useToast();
    const router = useRouter();
    const [engagements, setEngagements] = useState<Engagement[]>([]);
    const [clients, setClients] = useState<ClientOption[]>([]);
    const [offres, setOffres] = useState<OffreOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        clientId: "",
        offreTarifId: "",
        fixeOverride: "",
        rdvOverride: "",
        dureeMois: "6",
        debut: format(new Date(), "yyyy-MM-dd"),
        penaliteResiliation: "",
    });

    const fetchEngagements = useCallback(async () => {
        try {
            const res = await fetch("/api/billing/engagements");
            const json = await res.json();
            if (json.success) setEngagements(json.data);
            else showError("Erreur", json.error);
        } catch {
            showError("Erreur", "Impossible de charger les engagements");
        } finally {
            setIsLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        fetchEngagements();
    }, [fetchEngagements]);

    useEffect(() => {
        Promise.all([
            fetch("/api/clients?limit=200").then((r) => r.json()),
            fetch("/api/billing/offres?includeArchived=false").then((r) => r.json()),
        ]).then(([clientsRes, offresRes]) => {
            if (clientsRes.success) setClients(clientsRes.data ?? []);
            if (offresRes.success) setOffres(offresRes.data ?? []);
        });
    }, []);

    const openCreate = () => {
        setForm({
            clientId: "",
            offreTarifId: "",
            fixeOverride: "",
            rdvOverride: "",
            dureeMois: "6",
            debut: format(new Date(), "yyyy-MM-dd"),
            penaliteResiliation: "",
        });
        setShowModal(true);
    };

    const closeModal = () => setShowModal(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.clientId || !form.offreTarifId) {
            showError("Validation", "Client et offre sont requis");
            return;
        }
        const duree = parseInt(form.dureeMois, 10) || 6;
        if (duree < 1 || duree > 120) {
            showError("Validation", "Durée invalide (1–120 mois)");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch("/api/billing/engagements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clientId: form.clientId,
                    offreTarifId: form.offreTarifId,
                    fixeOverride: form.fixeOverride ? parseFloat(form.fixeOverride) : null,
                    rdvOverride: form.rdvOverride ? parseFloat(form.rdvOverride) : null,
                    dureeMois: duree,
                    debut: new Date(form.debut).toISOString(),
                    penaliteResiliation: form.penaliteResiliation.trim() || null,
                }),
            });
            const json = await res.json();
            if (json.success) {
                success("Engagement créé", "L'engagement a été créé en brouillon.");
                closeModal();
                fetchEngagements();
                router.push(`/manager/billing/engagements/${json.data.id}`);
            } else {
                showError("Erreur", json.error);
            }
        } catch {
            showError("Erreur", "Impossible de créer l'engagement");
        } finally {
            setSaving(false);
        }
    };

    const selectedOffre = offres.find((o) => o.id === form.offreTarifId);
    const effectiveFixe = form.fixeOverride !== "" && form.fixeOverride !== undefined
        ? parseFloat(form.fixeOverride)
        : selectedOffre?.fixeMensuel ?? 0;
    const effectiveRdv = form.rdvOverride !== "" && form.rdvOverride !== undefined
        ? parseFloat(form.rdvOverride)
        : selectedOffre?.prixParRdv ?? 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <PageHeader
                    title="Engagements clients"
                    subtitle="Contrats et conditions tarifaires par client"
                />
                <Button onClick={openCreate}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nouvel engagement
                </Button>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                </div>
            ) : engagements.length === 0 ? (
                <Card className="p-12 text-center">
                    <CalendarDays className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">Aucun engagement</h3>
                    <p className="text-slate-600 mb-4">
                        Créez un engagement pour associer un client à une offre et activer la facturation.
                    </p>
                    <Button onClick={openCreate}>
                        <Plus className="w-4 h-4 mr-2" />
                        Nouvel engagement
                    </Button>
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/80">
                                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Client</th>
                                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Offre</th>
                                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tarif effectif</th>
                                    <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Durée</th>
                                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Période</th>
                                    <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Statut</th>
                                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {engagements.map((e) => {
                                    const fixe = e.fixeOverride ?? e.fixeMensuel;
                                    const rdv = e.rdvOverride ?? e.prixParRdv;
                                    const hasOverride = e.fixeOverride != null || e.rdvOverride != null;
                                    return (
                                        <tr
                                            key={e.id}
                                            className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 cursor-pointer"
                                            onClick={() => router.push(`/manager/billing/engagements/${e.id}`)}
                                        >
                                            <td className="px-5 py-4">
                                                <div className="font-semibold text-slate-900">{e.clientName}</div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="text-slate-700">{e.offreName}</span>
                                                {hasOverride && (
                                                    <span className="ml-1.5 text-xs text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded">
                                                        Personnalisé
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-right px-5 py-4 text-sm">
                                                {fixe > 0 && <span>{fixe} €/mois</span>}
                                                {fixe > 0 && rdv > 0 && <span className="text-slate-400"> + </span>}
                                                {rdv > 0 && <span>{rdv} €/rdv</span>}
                                            </td>
                                            <td className="text-center px-5 py-4 text-slate-700">{e.dureeMois} mois</td>
                                            <td className="px-5 py-4 text-sm text-slate-600">
                                                {format(new Date(e.debut), "dd MMM yyyy", { locale: fr })} → {format(new Date(e.fin), "dd MMM yyyy", { locale: fr })}
                                            </td>
                                            <td className="text-center px-5 py-4">
                                                <Badge
                                                    variant={e.statut === "ACTIF" ? "default" : "outline"}
                                                    className={
                                                        e.statut === "EXPIRE" ? "bg-amber-50 text-amber-700" :
                                                        e.statut === "RESILIE" ? "bg-red-50 text-red-700" :
                                                        e.statut === "BROUILLON" ? "bg-slate-100 text-slate-600" : ""
                                                    }
                                                >
                                                    {STATUT_LABEL[e.statut] ?? e.statut}
                                                </Badge>
                                            </td>
                                            <td className="text-right px-5 py-4" onClick={(ev) => ev.stopPropagation()}>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => router.push(`/manager/billing/engagements/${e.id}`)}
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            <div className="flex items-center gap-2 text-sm text-slate-500">
                <Link href="/manager/billing" className="text-primary-600 hover:text-primary-700">
                    Retour Facturation
                </Link>
            </div>

            {/* Modal Nouvel engagement */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
                            <h2 className="text-lg font-bold text-slate-900">Nouvel engagement</h2>
                            <button type="button" onClick={closeModal} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Client</label>
                                <select
                                    value={form.clientId}
                                    onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                                    required
                                >
                                    <option value="">Sélectionner un client</option>
                                    {clients.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Offre tarifaire</label>
                                <select
                                    value={form.offreTarifId}
                                    onChange={(e) => setForm((f) => ({ ...f, offreTarifId: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                                    required
                                >
                                    <option value="">Sélectionner une offre</option>
                                    {offres.map((o) => (
                                        <option key={o.id} value={o.id}>
                                            {o.nom} — {o.fixeMensuel} € + {o.prixParRdv} €/rdv
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {(form.fixeOverride !== "" || form.rdvOverride !== "" || selectedOffre) && (
                                <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Edit2 className="w-4 h-4 text-amber-600" />
                                        <span className="text-sm font-semibold text-amber-800">Personnaliser le tarif</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-amber-700 mb-1">Forfait mensuel (€)</label>
                                            <Input
                                                type="number"
                                                min={0}
                                                step={0.01}
                                                value={form.fixeOverride}
                                                onChange={(e) => setForm((f) => ({ ...f, fixeOverride: e.target.value }))}
                                                placeholder={selectedOffre ? String(selectedOffre.fixeMensuel) : "0"}
                                            />
                                            {selectedOffre && (
                                                <p className="text-xs text-amber-600 mt-0.5">
                                                    Base : {selectedOffre.fixeMensuel} €
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-amber-700 mb-1">Prix par RDV (€)</label>
                                            <Input
                                                type="number"
                                                min={0}
                                                step={0.01}
                                                value={form.rdvOverride}
                                                onChange={(e) => setForm((f) => ({ ...f, rdvOverride: e.target.value }))}
                                                placeholder={selectedOffre ? String(selectedOffre.prixParRdv) : "0"}
                                            />
                                            {selectedOffre && (
                                                <p className="text-xs text-amber-600 mt-0.5">
                                                    Base : {selectedOffre.prixParRdv} €
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Durée (mois)</label>
                                    <select
                                        value={form.dureeMois}
                                        onChange={(e) => setForm((f) => ({ ...f, dureeMois: e.target.value }))}
                                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                                    >
                                        <option value="3">3 mois</option>
                                        <option value="6">6 mois</option>
                                        <option value="12">12 mois</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Date de début</label>
                                    <Input
                                        type="date"
                                        value={form.debut}
                                        onChange={(e) => setForm((f) => ({ ...f, debut: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Pénalité de résiliation</label>
                                <Input
                                    value={form.penaliteResiliation}
                                    onChange={(e) => setForm((f) => ({ ...f, penaliteResiliation: e.target.value }))}
                                    placeholder="Ex: 2 mois de forfait"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                                <Button type="button" variant="secondary" onClick={closeModal}>Annuler</Button>
                                <Button type="submit" disabled={saving}>
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                    Créer l&apos;engagement
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
