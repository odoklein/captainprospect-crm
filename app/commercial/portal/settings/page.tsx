"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2, Check, Link2, User, MapPin, Briefcase, Building2 } from "lucide-react";
import { useToast } from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface BookingLink {
    label: string;
    url: string;
    durationMinutes?: number;
}

interface CommercialProfile {
    id: string;
    firstName: string;
    lastName: string;
    title?: string | null;
    department?: string | null;
    territory?: string | null;
    emails: Array<string | { label?: string; value?: string; isPrimary?: boolean }>;
    phones: Array<string | { label?: string; value?: string; isPrimary?: boolean }>;
    bookingLinks: BookingLink[];
    notes?: string | null;
    client: { id: string; name: string; logo?: string | null };
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function CommercialSettingsPage() {
    const toast = useToast();
    const [profile, setProfile] = useState<CommercialProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Editable fields
    const [title, setTitle] = useState("");
    const [department, setDepartment] = useState("");
    const [territory, setTerritory] = useState("");
    const [bookingLinks, setBookingLinks] = useState<BookingLink[]>([]);
    const [isDirty, setIsDirty] = useState(false);

    const extractPrimaryValue = useCallback(
        (items: Array<string | { label?: string; value?: string; isPrimary?: boolean }> | null | undefined): string => {
            if (!Array.isArray(items) || items.length === 0) return "";
            const objectItems = items.filter(
                (item): item is { label?: string; value?: string; isPrimary?: boolean } =>
                    typeof item === "object" && item !== null
            );
            const primaryObject = objectItems.find((item) => item.isPrimary && typeof item.value === "string");
            if (primaryObject?.value) return primaryObject.value;
            const firstObjectWithValue = objectItems.find((item) => typeof item.value === "string" && item.value.trim().length > 0);
            if (firstObjectWithValue?.value) return firstObjectWithValue.value;
            const firstString = items.find((item): item is string => typeof item === "string" && item.trim().length > 0);
            return firstString ?? "";
        },
        []
    );

    const fetchProfile = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/commercial/settings");
            const json = await res.json();
            if (json.success) {
                const p: CommercialProfile = json.data;
                setProfile(p);
                setTitle(p.title ?? "");
                setDepartment(p.department ?? "");
                setTerritory(p.territory ?? "");
                setBookingLinks(Array.isArray(p.bookingLinks) ? p.bookingLinks : []);
            }
        } catch {
            toast.error("Erreur", "Impossible de charger le profil");
        } finally {
            setIsLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    // Track dirty state
    useEffect(() => {
        if (!profile) return;
        const changed =
            title !== (profile.title ?? "") ||
            department !== (profile.department ?? "") ||
            territory !== (profile.territory ?? "") ||
            JSON.stringify(bookingLinks) !== JSON.stringify(profile.bookingLinks);
        setIsDirty(changed);
    }, [title, department, territory, bookingLinks, profile]);

    const handleSave = async () => {
        // Validate booking links
        for (const link of bookingLinks) {
            if (!link.label.trim() || !link.url.trim()) {
                toast.error("Champs requis", "Chaque lien doit avoir un titre et une URL");
                return;
            }
        }

        setIsSaving(true);
        try {
            const res = await fetch("/api/commercial/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, department, territory, bookingLinks }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            toast.success("Enregistré", "Vos paramètres ont été mis à jour");
            // Update local profile to reset dirty state
            setProfile((prev) => prev ? {
                ...prev,
                title: title || null,
                department: department || null,
                territory: territory || null,
                bookingLinks,
            } : prev);
        } catch {
            toast.error("Erreur", "Impossible d'enregistrer les modifications");
        } finally {
            setIsSaving(false);
        }
    };

    const addBookingLink = () => {
        setBookingLinks((prev) => [...prev, { label: "", url: "", durationMinutes: 30 }]);
    };

    const updateBookingLink = (idx: number, field: keyof BookingLink, value: string | number) => {
        setBookingLinks((prev) =>
            prev.map((l, i) => i === idx ? { ...l, [field]: value } : l)
        );
    };

    const removeBookingLink = (idx: number) => {
        setBookingLinks((prev) => prev.filter((_, i) => i !== idx));
    };

    if (isLoading) {
        return (
            <div className="min-h-full bg-surface-2 p-4 md:p-6">
                <div className="animate-pulse space-y-6">
                    <div className="h-8 w-48 bg-gray-200 rounded-lg" />
                    <div className="h-40 bg-white rounded-2xl border border-line" />
                    <div className="h-64 bg-white rounded-2xl border border-line" />
                </div>
            </div>
        );
    }

    if (!profile) return null;

    return (
        <div className="min-h-full bg-surface-2 p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-[22px] font-bold text-ink tracking-tight">Paramètres</h1>
                    <p className="text-sm text-ink-3 mt-0.5">Gérez votre profil et vos liens de réservation</p>
                </div>
                {isDirty && (
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-sm"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Enregistrer les modifications
                    </button>
                )}
            </div>

            {/* Identity Card (read-only) */}
            <div className="premium-card p-6">
                <h2 className="text-sm font-semibold text-ink uppercase tracking-wider mb-4 flex items-center gap-2">
                    <User className="w-4 h-4 text-emerald-600" /> Informations de profil
                </h2>

                <div className="flex items-center gap-4 mb-5">
                    <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                        {profile.firstName.charAt(0)}{profile.lastName.charAt(0)}
                    </div>
                    <div>
                        <p className="text-[17px] font-bold text-ink">
                            {profile.firstName} {profile.lastName}
                        </p>
                        <p className="text-sm text-ink-3">{extractPrimaryValue(profile.emails)}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 mb-5 text-sm text-ink-3">
                    <Building2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-medium text-ink-2">{profile.client.name}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-[11px] font-semibold text-ink-3 uppercase tracking-wider mb-1.5">
                            <Briefcase className="w-3 h-3 inline mr-1" />Titre / Poste
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="ex: Directeur commercial"
                            className="w-full text-sm text-ink bg-surface-2 border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-ink-3 uppercase tracking-wider mb-1.5">
                            Département
                        </label>
                        <input
                            type="text"
                            value={department}
                            onChange={(e) => setDepartment(e.target.value)}
                            placeholder="ex: Sales, Marketing..."
                            className="w-full text-sm text-ink bg-surface-2 border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-ink-3 uppercase tracking-wider mb-1.5">
                            <MapPin className="w-3 h-3 inline mr-1" />Territoire / Zone
                        </label>
                        <input
                            type="text"
                            value={territory}
                            onChange={(e) => setTerritory(e.target.value)}
                            placeholder="ex: Île-de-France, France..."
                            className="w-full text-sm text-ink bg-surface-2 border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
                        />
                    </div>
                </div>
            </div>

            {/* Booking Links */}
            <div className="premium-card p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-ink uppercase tracking-wider flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-emerald-600" /> Liens de réservation
                    </h2>
                    <button
                        onClick={addBookingLink}
                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" /> Ajouter un lien
                    </button>
                </div>

                <p className="text-[12px] text-ink-3 mb-4">
                    Ces liens sont utilisés par l&apos;équipe SDR pour réserver des rendez-vous dans votre agenda (Calendly, Cal.com, etc.)
                </p>

                {bookingLinks.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-line rounded-xl">
                        <Link2 className="w-8 h-8 text-ink-4 mx-auto mb-2" />
                        <p className="text-sm font-medium text-ink-3">Aucun lien de réservation</p>
                        <p className="text-xs text-ink-4 mt-0.5">Ajoutez vos liens Calendly, Cal.com, etc.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {bookingLinks.map((link, idx) => (
                            <div
                                key={idx}
                                className="flex items-start gap-3 p-4 bg-surface-2 border border-line rounded-xl"
                            >
                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-[10.5px] font-semibold text-ink-3 uppercase tracking-wider mb-1">
                                            Titre
                                        </label>
                                        <input
                                            type="text"
                                            value={link.label}
                                            onChange={(e) => updateBookingLink(idx, "label", e.target.value)}
                                            placeholder="ex: RDV 30 min"
                                            className="w-full text-sm text-ink bg-white border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
                                        />
                                    </div>
                                    <div className="sm:col-span-1">
                                        <label className="block text-[10.5px] font-semibold text-ink-3 uppercase tracking-wider mb-1">
                                            URL
                                        </label>
                                        <input
                                            type="url"
                                            value={link.url}
                                            onChange={(e) => updateBookingLink(idx, "url", e.target.value)}
                                            placeholder="https://calendly.com/..."
                                            className="w-full text-sm text-ink bg-white border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10.5px] font-semibold text-ink-3 uppercase tracking-wider mb-1">
                                            Durée (min)
                                        </label>
                                        <input
                                            type="number"
                                            value={link.durationMinutes ?? ""}
                                            onChange={(e) => updateBookingLink(idx, "durationMinutes", parseInt(e.target.value) || 30)}
                                            placeholder="30"
                                            min={5}
                                            max={480}
                                            className="w-full text-sm text-ink bg-white border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={() => removeBookingLink(idx)}
                                    className="mt-6 p-1.5 text-ink-4 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Supprimer"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Save button (bottom) */}
            {isDirty && (
                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-sm"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Enregistrer les modifications
                    </button>
                </div>
            )}
        </div>
    );
}
