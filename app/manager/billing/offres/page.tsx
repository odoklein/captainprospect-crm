"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui";
import {
    Tag,
    Plus,
    Edit2,
    Archive,
    Loader2,
    X,
} from "lucide-react";
import { Button, Input, Card, PageHeader, Badge } from "@/components/ui";
import Link from "next/link";

interface OffreTarif {
    id: string;
    nom: string;
    fixeMensuel: number;
    prixParRdv: number;
    description: string | null;
    statut: "ACTIF" | "ARCHIVE";
    clientsActifs: number;
    createdAt: string;
    updatedAt: string;
}

const STATUT_LABEL: Record<string, string> = {
    ACTIF: "Actif",
    ARCHIVE: "Archivé",
};

export default function OffresPage() {
    const { success, error: showError } = useToast();
    const [offres, setOffres] = useState<OffreTarif[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showArchived, setShowArchived] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        nom: "",
        fixeMensuel: "",
        prixParRdv: "",
        description: "",
    });
    const [archivingId, setArchivingId] = useState<string | null>(null);

    const fetchOffres = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (showArchived) params.set("includeArchived", "true");
            const res = await fetch(`/api/billing/offres?${params.toString()}`);
            const json = await res.json();
            if (json.success) setOffres(json.data);
            else showError("Erreur", json.error);
        } catch {
            showError("Erreur", "Impossible de charger les offres");
        } finally {
            setIsLoading(false);
        }
    }, [showArchived, showError]);

    useEffect(() => {
        fetchOffres();
    }, [fetchOffres]);

    const openCreate = () => {
        setEditingId(null);
        setForm({ nom: "", fixeMensuel: "", prixParRdv: "", description: "" });
        setShowModal(true);
    };

    const openEdit = (o: OffreTarif) => {
        setEditingId(o.id);
        setForm({
            nom: o.nom,
            fixeMensuel: String(o.fixeMensuel),
            prixParRdv: String(o.prixParRdv),
            description: o.description ?? "",
        });
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const fixe = parseFloat(form.fixeMensuel) || 0;
        const rdv = parseFloat(form.prixParRdv) || 0;
        if (!form.nom.trim()) {
            showError("Validation", "Le nom est requis");
            return;
        }
        setSaving(true);
        try {
            if (editingId) {
                const res = await fetch(`/api/billing/offres/${editingId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        nom: form.nom.trim(),
                        fixeMensuel: fixe,
                        prixParRdv: rdv,
                        description: form.description.trim() || null,
                    }),
                });
                const json = await res.json();
                if (json.success) {
                    success("Offre mise à jour", "L'offre a été modifiée.");
                    closeModal();
                    fetchOffres();
                } else {
                    showError("Erreur", json.error);
                }
            } else {
                const res = await fetch("/api/billing/offres", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        nom: form.nom.trim(),
                        fixeMensuel: fixe,
                        prixParRdv: rdv,
                        description: form.description.trim() || null,
                    }),
                });
                const json = await res.json();
                if (json.success) {
                    success("Offre créée", "L'offre a été créée.");
                    closeModal();
                    fetchOffres();
                } else {
                    showError("Erreur", json.error);
                }
            }
        } catch {
            showError("Erreur", "Impossible d'enregistrer l'offre");
        } finally {
            setSaving(false);
        }
    };

    const handleArchive = async (id: string) => {
        if (!confirm("Archiver cette offre ? Les engagements existants restent inchangés.")) return;
        setArchivingId(id);
        try {
            const res = await fetch(`/api/billing/offres/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ statut: "ARCHIVE" }),
            });
            const json = await res.json();
            if (json.success) {
                success("Offre archivée", "L'offre a été archivée.");
                fetchOffres();
            } else {
                showError("Erreur", json.error);
            }
        } catch {
            showError("Erreur", "Impossible d'archiver l'offre");
        } finally {
            setArchivingId(null);
        }
    };

    const formatCurrency = (n: number) =>
        n > 0 ? `${n} €` : "—";

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <PageHeader
                    title="Offres & Tarifs"
                    subtitle="Modèles de tarification pour les engagements clients"
                />
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showArchived}
                            onChange={(e) => setShowArchived(e.target.checked)}
                            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                        />
                        Afficher archivées
                    </label>
                    <Button onClick={openCreate}>
                        <Plus className="w-4 h-4 mr-2" />
                        Nouvelle offre
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                </div>
            ) : offres.length === 0 ? (
                <Card className="p-12 text-center">
                    <Tag className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">Aucune offre</h3>
                    <p className="text-slate-600 mb-4">
                        Créez votre premier modèle de tarification (forfait mensuel + prix par RDV).
                    </p>
                    <Button onClick={openCreate}>
                        <Plus className="w-4 h-4 mr-2" />
                        Nouvelle offre
                    </Button>
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/80">
                                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Offre</th>
                                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Fixe mensuel</th>
                                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Prix / RDV</th>
                                    <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Clients actifs</th>
                                    <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Statut</th>
                                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {offres.map((o) => (
                                    <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                                        <td className="px-5 py-4">
                                            <div className="font-semibold text-slate-900">{o.nom}</div>
                                            {o.description && (
                                                <div className="text-sm text-slate-500 mt-0.5">{o.description}</div>
                                            )}
                                        </td>
                                        <td className="text-right px-5 py-4 font-medium text-slate-900">
                                            {formatCurrency(o.fixeMensuel)}
                                        </td>
                                        <td className="text-right px-5 py-4 font-medium text-slate-900">
                                            {formatCurrency(o.prixParRdv)}
                                        </td>
                                        <td className="text-center px-5 py-4 text-slate-700">
                                            {o.clientsActifs}
                                        </td>
                                        <td className="text-center px-5 py-4">
                                            <Badge
                                                variant={o.statut === "ACTIF" ? "default" : "outline"}
                                                className={o.statut === "ARCHIVE" ? "bg-slate-100 text-slate-600" : ""}
                                            >
                                                {STATUT_LABEL[o.statut] ?? o.statut}
                                            </Badge>
                                        </td>
                                        <td className="text-right px-5 py-4">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => openEdit(o)}
                                                    className="text-slate-600"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </Button>
                                                {o.statut === "ACTIF" && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleArchive(o.id)}
                                                        disabled={archivingId === o.id}
                                                        className="text-amber-600 hover:text-amber-700"
                                                    >
                                                        {archivingId === o.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Archive className="w-4 h-4" />
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
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

            {/* Modal Create / Edit */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
                            <h2 className="text-lg font-bold text-slate-900">
                                {editingId ? "Modifier l'offre" : "Nouvelle offre"}
                            </h2>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nom de l'offre</label>
                                <Input
                                    value={form.nom}
                                    onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                                    placeholder="Ex: Pack Standard"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
                                <textarea
                                    value={form.description}
                                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                    placeholder="Brève description"
                                    rows={2}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Forfait mensuel (€)</label>
                                    <Input
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        value={form.fixeMensuel}
                                        onChange={(e) => setForm((f) => ({ ...f, fixeMensuel: e.target.value }))}
                                        placeholder="0"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Laisser 0 si pas de forfait</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Prix par RDV (€)</label>
                                    <Input
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        value={form.prixParRdv}
                                        onChange={(e) => setForm((f) => ({ ...f, prixParRdv: e.target.value }))}
                                        placeholder="0"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Laisser 0 si pas de variable</p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                                <Button type="button" variant="secondary" onClick={closeModal}>
                                    Annuler
                                </Button>
                                <Button type="submit" disabled={saving}>
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                    {editingId ? "Enregistrer" : "Créer l'offre"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
