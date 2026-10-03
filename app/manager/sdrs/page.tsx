"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui";
import {
    Search,
    UserPlus,
    Phone,
    Target,
    RefreshCw,
    Loader2,
    Users,
    Eye,
    X,
    Mail,
} from "lucide-react";

// ============================================
// TYPES
// ============================================

interface SDR {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
    _count: {
        assignedMissions: number;
        actions: number;
    };
}

// ============================================
// SDRS PAGE
// ============================================

export default function SDRsPage() {
    const { success, error: showError } = useToast();
    const [sdrs, setSDRs] = useState<SDR[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    // Create SDR modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
    });
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});

    // ============================================
    // FETCH SDRS
    // ============================================

    const fetchSDRs = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/users?role=SDR");
            const json = await res.json();

            if (json.success) {
                setSDRs(json.data.users || []);
            } else {
                showError("Erreur", json.error);
            }
        } catch (err) {
            console.error("Failed to fetch SDRs:", err);
            showError("Erreur", "Impossible de charger les SDRs");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSDRs();
    }, []);

    // ============================================
    // FILTER SDRS
    // ============================================

    const filteredSDRs = (Array.isArray(sdrs) ? sdrs : []).filter(sdr =>
        sdr.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sdr.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // ============================================
    // STATS
    // ============================================

    const totalSDRs = sdrs.length;
    const totalActions = sdrs.reduce((acc, sdr) => acc + sdr._count.actions, 0);
    const totalMissions = sdrs.reduce((acc, sdr) => acc + sdr._count.assignedMissions, 0);

    // ============================================
    // VALIDATE FORM
    // ============================================

    const validateForm = (): boolean => {
        const errors: Record<string, string> = {};

        if (!formData.name.trim()) {
            errors.name = "Le nom est requis";
        }
        if (!formData.email.trim()) {
            errors.email = "L'email est requis";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            errors.email = "Email invalide";
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // ============================================
    // CREATE SDR
    // ============================================

    const handleCreate = async () => {
        if (!validateForm()) return;

        setIsCreating(true);
        try {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    password: formData.password || undefined,
                    role: "SDR",
                }),
            });

            const json = await res.json();

            if (json.success) {
                success(
                    "SDR créé",
                    json.data.generatedPassword
                        ? `Mot de passe généré: ${json.data.generatedPassword}`
                        : `${formData.name} a été créé`
                );
                setShowCreateModal(false);
                setFormData({ name: "", email: "", password: "" });
                fetchSDRs();
            } else {
                showError("Erreur", json.error);
            }
        } catch (err) {
            showError("Erreur", "Impossible de créer le SDR");
        } finally {
            setIsCreating(false);
        }
    };

    if (isLoading && sdrs.length === 0) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                    <p className="text-sm text-slate-500">Chargement des SDRs...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Premium Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">SDRs</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Gérez votre équipe d'exécution commerciale
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchSDRs}
                        className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 text-slate-500 ${isLoading ? "animate-spin" : ""}`} />
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="mgr-btn-primary flex items-center gap-2 h-10 px-5 text-sm font-medium"
                    >
                        <UserPlus className="w-4 h-4" />
                        Ajouter un SDR
                    </button>
                </div>
            </div>

            {/* Premium Stats */}
            <div className="grid grid-cols-3 gap-5">
                <div className="mgr-stat-card">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                            <Users className="w-6 h-6 text-primary-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{totalSDRs}</p>
                            <p className="text-sm text-slate-500">SDRs</p>
                        </div>
                    </div>
                </div>
                <div className="mgr-stat-card">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <Phone className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{totalActions}</p>
                            <p className="text-sm text-slate-500">Actions totales</p>
                        </div>
                    </div>
                </div>
                <div className="mgr-stat-card">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                            <Target className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{totalMissions}</p>
                            <p className="text-sm text-slate-500">Missions assignées</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Premium Search */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher un SDR..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="mgr-search-input w-full h-11 pl-12 pr-10 text-sm text-slate-900"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full transition-colors"
                        >
                            <X className="w-4 h-4 text-slate-400" />
                        </button>
                    )}
                </div>
            </div>

            {/* Premium SDR List */}
            {filteredSDRs.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                    <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-4">
                        <Users className="w-8 h-8 text-primary-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                        {searchQuery ? "Aucun SDR trouvé" : "Aucun SDR"}
                    </h3>
                    <p className="text-sm text-slate-500 mb-6">
                        {searchQuery ? "Essayez une autre recherche" : "Ajoutez votre premier SDR"}
                    </p>
                    {!searchQuery && (
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="mgr-btn-primary inline-flex items-center gap-2"
                        >
                            <UserPlus className="w-4 h-4" />
                            Ajouter un SDR
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredSDRs.map((sdr, index) => (
                        <div
                            key={sdr.id}
                            className="mgr-mission-card flex items-center gap-4"
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            {/* Avatar */}
                            <div className="relative">
                                <div className="w-14 h-14 rounded-xl bg-primary-100 flex items-center justify-center text-lg font-bold text-primary-600">
                                    {sdr.name.split(" ").map((n) => n[0]).join("")}
                                </div>
                                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white bg-emerald-500" />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-semibold text-slate-900">{sdr.name}</h3>
                                    <span className="mgr-badge-active">Actif</span>
                                </div>
                                <p className="text-sm text-slate-500 flex items-center gap-1.5">
                                    <Mail className="w-3.5 h-3.5" />
                                    {sdr.email}
                                </p>
                            </div>

                            {/* Stats */}
                            <div className="flex items-center gap-6 border-l border-slate-200 pl-6">
                                <div className="text-center">
                                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                                        <Target className="w-4 h-4" />
                                        <span className="text-xs">Missions</span>
                                    </div>
                                    <p className="text-xl font-bold text-slate-900">{sdr._count.assignedMissions || 0}</p>
                                </div>
                                <div className="text-center">
                                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                                        <Phone className="w-4 h-4" />
                                        <span className="text-xs">Actions</span>
                                    </div>
                                    <p className="text-xl font-bold text-slate-900">{sdr._count.actions || 0}</p>
                                </div>
                            </div>

                            {/* View Button */}
                            <button className="px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors flex items-center gap-2">
                                <Eye className="w-4 h-4" />
                                Détails
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Create SDR Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 dev-modal-overlay z-50 flex items-center justify-center p-4">
                    <div className="dev-modal w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
                                <UserPlus className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Ajouter un SDR</h2>
                                <p className="text-sm text-slate-500">Créez un nouveau compte SDR</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Nom complet *
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Ex: Marie Laurent"
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                                    autoFocus
                                />
                                {formErrors.name && (
                                    <p className="text-sm text-red-500 mt-1">{formErrors.name}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Email *
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                    placeholder="marie.l@suzali.com"
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                                />
                                {formErrors.email && (
                                    <p className="text-sm text-red-500 mt-1">{formErrors.email}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Mot de passe
                                </label>
                                <input
                                    type="text"
                                    value={formData.password}
                                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                    placeholder="Laisser vide pour générer automatiquement"
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                                />
                                <p className="text-xs text-slate-400 mt-1.5">
                                    Un mot de passe sera généré si laissé vide
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="h-10 px-5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={isCreating}
                                className="mgr-btn-primary h-10 px-5 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                            >
                                {isCreating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Création...
                                    </>
                                ) : (
                                    <>
                                        <UserPlus className="w-4 h-4" />
                                        Créer le SDR
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
