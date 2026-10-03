"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
    Zap,
    Plus,
    Play,
    Pause,
    Archive,
    Trash2,
    Edit,
    Users,
    Mail,
    BarChart3,
    ChevronRight,
    Loader2,
    Search,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

// ============================================
// TYPES
// ============================================

interface Sequence {
    id: string;
    name: string;
    description: string | null;
    status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
    totalEnrolled: number;
    totalCompleted: number;
    totalReplied: number;
    totalBounced: number;
    createdAt: string;
    mailbox: {
        id: string;
        email: string;
        displayName: string | null;
    };
    campaign: {
        id: string;
        name: string;
    } | null;
    _count: {
        steps: number;
        enrollments: number;
    };
}

// ============================================
// SEQUENCES PAGE
// ============================================

export default function SequencesPage() {
    const [sequences, setSequences] = useState<Sequence[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "active" | "draft" | "paused">("all");
    const [search, setSearch] = useState("");

    // Fetch sequences
    useEffect(() => {
        const fetchSequences = async () => {
            try {
                const params = new URLSearchParams();
                if (filter !== "all") {
                    params.set("status", filter.toUpperCase());
                }
                
                const res = await fetch(`/api/email/sequences?${params}`);
                const json = await res.json();
                if (json.success) {
                    setSequences(json.data);
                }
            } catch (error) {
                console.error("Failed to fetch sequences:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSequences();
    }, [filter]);

    // Update sequence status
    const handleStatusChange = async (sequenceId: string, status: string) => {
        try {
            const res = await fetch(`/api/email/sequences/${sequenceId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
            
            if (res.ok) {
                setSequences(prev => prev.map(s => 
                    s.id === sequenceId ? { ...s, status: status as Sequence["status"] } : s
                ));
            }
        } catch (error) {
            console.error("Failed to update sequence:", error);
        }
    };

    // Delete sequence
    const handleDelete = async (sequenceId: string) => {
        if (!confirm("Êtes-vous sûr de vouloir supprimer cette séquence ?")) return;
        
        try {
            await fetch(`/api/email/sequences/${sequenceId}`, { method: "DELETE" });
            setSequences(prev => prev.filter(s => s.id !== sequenceId));
        } catch (error) {
            console.error("Failed to delete sequence:", error);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "ACTIVE":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Active
                    </span>
                );
            case "DRAFT":
                return (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
                        Brouillon
                    </span>
                );
            case "PAUSED":
                return (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                        En pause
                    </span>
                );
            case "ARCHIVED":
                return (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-500">
                        Archivée
                    </span>
                );
            default:
                return null;
        }
    };

    const filteredSequences = sequences.filter(s => 
        search === "" || 
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.description?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Séquences Email</h1>
                    <p className="text-sm text-slate-500">Suivis email automatisés en plusieurs étapes</p>
                </div>
                <a
                    href="/manager/email/sequences/new"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-500 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Nouvelle séquence
                </a>
            </div>

            {/* Filters & Search */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    {[
                        { value: "all", label: "Toutes" },
                        { value: "active", label: "Actives" },
                        { value: "draft", label: "Brouillons" },
                        { value: "paused", label: "En pause" },
                    ].map((option) => (
                        <button
                            key={option.value}
                            onClick={() => setFilter(option.value as typeof filter)}
                            className={cn(
                                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                                filter === option.value
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-600 hover:text-slate-900"
                            )}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <div className="flex-1 max-w-xs">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Rechercher..."
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                    </div>
                </div>
            </div>

            {/* Sequences List */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
            ) : filteredSequences.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                            <Zap className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">
                            Aucune séquence
                        </h3>
                        <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                            Créez votre première séquence pour automatiser vos suivis email.
                        </p>
                        <a
                            href="/manager/email/sequences/new"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-500 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Créer une séquence
                        </a>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filteredSequences.map((sequence) => (
                        <Card key={sequence.id} className="hover:border-slate-300 transition-colors">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-4">
                                    {/* Icon */}
                                    <div className="w-12 h-12 rounded-xl bg-primary-50 ring-1 ring-inset ring-primary-100 flex items-center justify-center text-primary-600 flex-shrink-0">
                                        <Zap className="w-6 h-6" />
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <a
                                                href={`/manager/email/sequences/${sequence.id}`}
                                                className="text-base font-semibold text-slate-900 hover:text-primary-600 truncate"
                                            >
                                                {sequence.name}
                                            </a>
                                            {getStatusBadge(sequence.status)}
                                        </div>
                                        <p className="text-sm text-slate-500 truncate">
                                            {sequence._count.steps} étapes · {sequence.mailbox.email}
                                            {sequence.campaign && ` · ${sequence.campaign.name}`}
                                        </p>
                                    </div>

                                    {/* Stats */}
                                    <div className="hidden md:flex items-center gap-6 flex-shrink-0">
                                        <div className="text-center">
                                            <p className="text-lg font-semibold text-slate-900">
                                                {sequence.totalEnrolled}
                                            </p>
                                            <p className="text-xs text-slate-500">Inscrits</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-semibold text-emerald-600">
                                                {sequence.totalReplied}
                                            </p>
                                            <p className="text-xs text-slate-500">Réponses</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-semibold text-slate-700">
                                                {sequence.totalCompleted}
                                            </p>
                                            <p className="text-xs text-slate-500">Terminés</p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {sequence.status === "ACTIVE" ? (
                                            <button
                                                onClick={() => handleStatusChange(sequence.id, "PAUSED")}
                                                className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                title="Mettre en pause"
                                            >
                                                <Pause className="w-4 h-4" />
                                            </button>
                                        ) : sequence.status === "PAUSED" || sequence.status === "DRAFT" ? (
                                            <button
                                                onClick={() => handleStatusChange(sequence.id, "ACTIVE")}
                                                className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                title="Activer"
                                            >
                                                <Play className="w-4 h-4" />
                                            </button>
                                        ) : null}
                                        <a
                                            href={`/manager/email/sequences/${sequence.id}`}
                                            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                            title="Modifier"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </a>
                                        <button
                                            onClick={() => handleDelete(sequence.id)}
                                            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Supprimer"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <a
                                            href={`/manager/email/sequences/${sequence.id}`}
                                            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </a>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
