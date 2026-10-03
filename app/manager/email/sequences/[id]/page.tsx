"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    ArrowLeft,
    Plus,
    Trash2,
    Clock,
    Mail,
    Save,
    Loader2,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    Play,
    Pause,
    Users,
    BarChart3,
    Settings,
    UserPlus,
    CheckCircle,
    XCircle,
    Reply,
    AlertTriangle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

// ============================================
// TYPES
// ============================================

interface SequenceStep {
    id: string;
    order: number;
    subject: string;
    bodyHtml: string;
    delayDays: number;
    delayHours: number;
    skipIfOpened: boolean;
    skipIfClicked: boolean;
    skipIfReplied: boolean;
    sentCount: number;
    openCount: number;
    clickCount: number;
    replyCount: number;
    isExpanded: boolean;
    isNew?: boolean;
}

interface Enrollment {
    id: string;
    contact: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
        company?: { name: string };
    };
    status: string;
    currentStepOrder: number;
    nextStepAt: string | null;
    completedAt: string | null;
    createdAt: string;
}

interface Sequence {
    id: string;
    name: string;
    description: string | null;
    status: string;
    mailboxId: string;
    campaignId: string | null;
    stopOnReply: boolean;
    stopOnBounce: boolean;
    sendOnWeekends: boolean;
    sendWindowStart: string;
    sendWindowEnd: string;
    totalEnrolled: number;
    totalCompleted: number;
    totalReplied: number;
    totalBounced: number;
    mailbox: { id: string; email: string; displayName: string | null };
    campaign: { id: string; name: string } | null;
    steps: SequenceStep[];
    enrollments: Enrollment[];
}

// ============================================
// STEP EDITOR COMPONENT
// ============================================

function StepEditor({
    step,
    stepNumber,
    onChange,
    onDelete,
    onMoveUp,
    onMoveDown,
    isFirst,
    isLast,
    isEditable,
}: {
    step: SequenceStep;
    stepNumber: number;
    onChange: (updates: Partial<SequenceStep>) => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    isFirst: boolean;
    isLast: boolean;
    isEditable: boolean;
}) {
    return (
        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            {/* Step Header */}
            <div
                className="flex items-center gap-3 px-4 py-3 bg-slate-50 cursor-pointer"
                onClick={() => onChange({ isExpanded: !step.isExpanded })}
            >
                {isEditable && (
                    <div className="flex items-center gap-1 text-slate-400">
                        <button
                            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                            disabled={isFirst}
                            className="p-1 hover:bg-slate-200 rounded disabled:opacity-30"
                        >
                            <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                            disabled={isLast}
                            className="p-1 hover:bg-slate-200 rounded disabled:opacity-30"
                        >
                            <ChevronDown className="w-4 h-4" />
                        </button>
                    </div>
                )}
                
                <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-sm">
                    {stepNumber}
                </div>
                
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                        {step.subject || "Sans sujet"}
                    </p>
                    <p className="text-xs text-slate-500">
                        {stepNumber === 1 ? "Envoi immédiat" : `Après ${step.delayDays}j ${step.delayHours}h`}
                    </p>
                </div>

                {/* Stats */}
                {step.sentCount > 0 && (
                    <div className="hidden md:flex items-center gap-4 text-xs text-slate-500">
                        <span>{step.sentCount} envoyés</span>
                        <span>{step.openCount} ouverts</span>
                        <span>{step.replyCount} réponses</span>
                    </div>
                )}

                {isEditable && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
                
                {step.isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
            </div>

            {/* Step Content */}
            {step.isExpanded && (
                <div className="p-4 space-y-4 border-t border-slate-200">
                    {/* Delay (not for first step) */}
                    {stepNumber > 1 && (
                        <div className="flex items-center gap-4">
                            <Clock className="w-5 h-5 text-slate-400" />
                            <span className="text-sm text-slate-600">Attendre</span>
                            <input
                                type="number"
                                min="0"
                                value={step.delayDays}
                                onChange={(e) => onChange({ delayDays: parseInt(e.target.value) || 0 })}
                                disabled={!isEditable}
                                className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-center disabled:bg-slate-50"
                            />
                            <span className="text-sm text-slate-600">jours</span>
                            <input
                                type="number"
                                min="0"
                                max="23"
                                value={step.delayHours}
                                onChange={(e) => onChange({ delayHours: parseInt(e.target.value) || 0 })}
                                disabled={!isEditable}
                                className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-center disabled:bg-slate-50"
                            />
                            <span className="text-sm text-slate-600">heures</span>
                        </div>
                    )}

                    {/* Subject */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Sujet
                        </label>
                        <input
                            type="text"
                            value={step.subject}
                            onChange={(e) => onChange({ subject: e.target.value })}
                            disabled={!isEditable}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-slate-50"
                        />
                    </div>

                    {/* Body */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Contenu de l'email
                        </label>
                        <textarea
                            value={step.bodyHtml}
                            onChange={(e) => onChange({ bodyHtml: e.target.value })}
                            disabled={!isEditable}
                            rows={8}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none font-mono disabled:bg-slate-50"
                        />
                    </div>

                    {/* Skip conditions */}
                    <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={step.skipIfOpened}
                                onChange={(e) => onChange({ skipIfOpened: e.target.checked })}
                                disabled={!isEditable}
                                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm text-slate-600">Passer si ouvert</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={step.skipIfClicked}
                                onChange={(e) => onChange({ skipIfClicked: e.target.checked })}
                                disabled={!isEditable}
                                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm text-slate-600">Passer si cliqué</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={step.skipIfReplied}
                                onChange={(e) => onChange({ skipIfReplied: e.target.checked })}
                                disabled={!isEditable}
                                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm text-slate-600">Passer si répondu</span>
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================
// ENROLLMENT LIST
// ============================================

function EnrollmentList({ enrollments, sequenceId }: { enrollments: Enrollment[]; sequenceId: string }) {
    const getStatusBadge = (status: string) => {
        switch (status) {
            case "ACTIVE":
                return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">Actif</span>;
            case "COMPLETED":
                return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">Terminé</span>;
            case "REPLIED":
                return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-accent-100 text-accent-700">Répondu</span>;
            case "BOUNCED":
                return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">Bounce</span>;
            case "PAUSED":
                return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">Pausé</span>;
            default:
                return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600">{status}</span>;
        }
    };

    if (enrollments.length === 0) {
        return (
            <div className="text-center py-8 text-slate-500">
                <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">Aucun contact inscrit</p>
            </div>
        );
    }

    return (
        <div className="divide-y divide-slate-100">
            {enrollments.map((enrollment) => (
                <div key={enrollment.id} className="py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-xs font-semibold">
                        {enrollment.contact.firstName?.[0]}{enrollment.contact.lastName?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                            {enrollment.contact.firstName} {enrollment.contact.lastName}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                            {enrollment.contact.email}
                            {enrollment.contact.company && ` · ${enrollment.contact.company.name}`}
                        </p>
                    </div>
                    <div className="text-right">
                        {getStatusBadge(enrollment.status)}
                        <p className="text-xs text-slate-400 mt-1">
                            Étape {enrollment.currentStepOrder}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ============================================
// MAIN PAGE
// ============================================

export default function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sequence, setSequence] = useState<Sequence | null>(null);
    const [activeTab, setActiveTab] = useState<"steps" | "enrollments" | "settings">("steps");
    
    // Editable state
    const [steps, setSteps] = useState<SequenceStep[]>([]);
    const [hasChanges, setHasChanges] = useState(false);

    // Fetch sequence
    useEffect(() => {
        const fetchSequence = async () => {
            try {
                const res = await fetch(`/api/email/sequences/${id}`);
                const json = await res.json();
                
                if (json.success) {
                    setSequence(json.data);
                    setSteps(json.data.steps.map((s: any) => ({ ...s, isExpanded: false })));
                } else {
                    setError(json.error || "Séquence non trouvée");
                }
            } catch (err) {
                setError("Erreur de chargement");
            } finally {
                setIsLoading(false);
            }
        };

        fetchSequence();
    }, [id]);

    // Check if editable (DRAFT or PAUSED)
    const isEditable = sequence?.status === "DRAFT" || sequence?.status === "PAUSED";

    // Update step
    const updateStep = (stepId: string, updates: Partial<SequenceStep>) => {
        setSteps(steps.map(s => s.id === stepId ? { ...s, ...updates } : s));
        setHasChanges(true);
    };

    // Delete step
    const deleteStep = (stepId: string) => {
        if (steps.length <= 1) return;
        const newSteps = steps.filter(s => s.id !== stepId);
        setSteps(newSteps.map((s, i) => ({ ...s, order: i + 1 })));
        setHasChanges(true);
    };

    // Move step
    const moveStep = (stepId: string, direction: 'up' | 'down') => {
        const index = steps.findIndex(s => s.id === stepId);
        if (direction === 'up' && index > 0) {
            const newSteps = [...steps];
            [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
            setSteps(newSteps.map((s, i) => ({ ...s, order: i + 1 })));
            setHasChanges(true);
        } else if (direction === 'down' && index < steps.length - 1) {
            const newSteps = [...steps];
            [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
            setSteps(newSteps.map((s, i) => ({ ...s, order: i + 1 })));
            setHasChanges(true);
        }
    };

    // Add step
    const addStep = () => {
        const newStep: SequenceStep = {
            id: `new-${Date.now()}`,
            order: steps.length + 1,
            subject: "",
            bodyHtml: "",
            delayDays: 2,
            delayHours: 0,
            skipIfOpened: false,
            skipIfClicked: false,
            skipIfReplied: true,
            sentCount: 0,
            openCount: 0,
            clickCount: 0,
            replyCount: 0,
            isExpanded: true,
            isNew: true,
        };
        setSteps([...steps.map(s => ({ ...s, isExpanded: false })), newStep]);
        setHasChanges(true);
    };

    // Save changes
    const handleSave = async () => {
        setIsSaving(true);
        setError(null);

        try {
            const res = await fetch(`/api/email/sequences/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    steps: steps.map(s => ({
                        id: s.isNew ? undefined : s.id,
                        order: s.order,
                        subject: s.subject,
                        bodyHtml: s.bodyHtml,
                        delayDays: s.delayDays,
                        delayHours: s.delayHours,
                        skipIfOpened: s.skipIfOpened,
                        skipIfClicked: s.skipIfClicked,
                        skipIfReplied: s.skipIfReplied,
                    })),
                }),
            });

            const json = await res.json();
            
            if (json.success) {
                setHasChanges(false);
                // Refresh
                const refreshRes = await fetch(`/api/email/sequences/${id}`);
                const refreshJson = await refreshRes.json();
                if (refreshJson.success) {
                    setSequence(refreshJson.data);
                    setSteps(refreshJson.data.steps.map((s: any) => ({ ...s, isExpanded: false })));
                }
            } else {
                setError(json.error || "Erreur lors de la sauvegarde");
            }
        } catch (err) {
            setError("Erreur lors de la sauvegarde");
        } finally {
            setIsSaving(false);
        }
    };

    // Update status
    const handleStatusChange = async (newStatus: string) => {
        try {
            const res = await fetch(`/api/email/sequences/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });

            if (res.ok) {
                setSequence(prev => prev ? { ...prev, status: newStatus } : null);
            }
        } catch (err) {
            console.error("Failed to update status:", err);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
            </div>
        );
    }

    if (!sequence) {
        return (
            <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">{error || "Séquence non trouvée"}</p>
                <button
                    onClick={() => router.back()}
                    className="mt-4 text-primary-600 hover:text-primary-700 text-sm font-medium"
                >
                    Retour
                </button>
            </div>
        );
    }

    const getStatusBadge = () => {
        switch (sequence.status) {
            case "ACTIVE":
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active</span>;
            case "DRAFT":
                return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600">Brouillon</span>;
            case "PAUSED":
                return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">En pause</span>;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push("/manager/email/sequences")}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold text-slate-900">{sequence.name}</h1>
                            {getStatusBadge()}
                        </div>
                        <p className="text-sm text-slate-500">
                            {sequence.mailbox.email}
                            {sequence.campaign && ` · ${sequence.campaign.name}`}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {sequence.status === "ACTIVE" ? (
                        <button
                            onClick={() => handleStatusChange("PAUSED")}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
                        >
                            <Pause className="w-4 h-4" />
                            Mettre en pause
                        </button>
                    ) : (
                        <button
                            onClick={() => handleStatusChange("ACTIVE")}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-xl hover:bg-emerald-400 transition-colors"
                        >
                            <Play className="w-4 h-4" />
                            Activer
                        </button>
                    )}
                    {hasChanges && (
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-500 disabled:opacity-50 transition-colors"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Sauvegarder
                        </button>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                                <Users className="w-5 h-5 text-primary-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{sequence.totalEnrolled}</p>
                                <p className="text-xs text-slate-500">Inscrits</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                <CheckCircle className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{sequence.totalCompleted}</p>
                                <p className="text-xs text-slate-500">Terminés</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-accent-100 flex items-center justify-center">
                                <Reply className="w-5 h-5 text-accent-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{sequence.totalReplied}</p>
                                <p className="text-xs text-slate-500">Réponses</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-red-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{sequence.totalBounced}</p>
                                <p className="text-xs text-slate-500">Bounces</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Error */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                <button
                    onClick={() => setActiveTab("steps")}
                    className={cn(
                        "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                        activeTab === "steps" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    )}
                >
                    Étapes ({steps.length})
                </button>
                <button
                    onClick={() => setActiveTab("enrollments")}
                    className={cn(
                        "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                        activeTab === "enrollments" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    )}
                >
                    Contacts ({sequence.enrollments.length})
                </button>
                <button
                    onClick={() => setActiveTab("settings")}
                    className={cn(
                        "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                        activeTab === "settings" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    )}
                >
                    Paramètres
                </button>
            </div>

            {/* Content */}
            {activeTab === "steps" && (
                <div className="space-y-4">
                    {steps.map((step, index) => (
                        <StepEditor
                            key={step.id}
                            step={step}
                            stepNumber={index + 1}
                            onChange={(updates) => updateStep(step.id, updates)}
                            onDelete={() => deleteStep(step.id)}
                            onMoveUp={() => moveStep(step.id, 'up')}
                            onMoveDown={() => moveStep(step.id, 'down')}
                            isFirst={index === 0}
                            isLast={index === steps.length - 1}
                            isEditable={isEditable}
                        />
                    ))}

                    {isEditable && (
                        <button
                            onClick={addStep}
                            className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50/50 transition-colors flex items-center justify-center gap-2"
                        >
                            <Plus className="w-5 h-5" />
                            Ajouter une étape
                        </button>
                    )}
                </div>
            )}

            {activeTab === "enrollments" && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>Contacts inscrits</CardTitle>
                            <a
                                href={`/manager/email/sequences/${id}/enroll`}
                                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            >
                                <UserPlus className="w-4 h-4" />
                                Inscrire des contacts
                            </a>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <EnrollmentList enrollments={sequence.enrollments} sequenceId={sequence.id} />
                    </CardContent>
                </Card>
            )}

            {activeTab === "settings" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Règles d'arrêt</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-700">Arrêter si réponse reçue</span>
                                <span className={cn("text-sm font-medium", sequence.stopOnReply ? "text-emerald-600" : "text-slate-400")}>
                                    {sequence.stopOnReply ? "Oui" : "Non"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-700">Arrêter si bounce</span>
                                <span className={cn("text-sm font-medium", sequence.stopOnBounce ? "text-emerald-600" : "text-slate-400")}>
                                    {sequence.stopOnBounce ? "Oui" : "Non"}
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Fenêtre d'envoi</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-700">Heures d'envoi</span>
                                <span className="text-sm font-medium text-slate-900">
                                    {sequence.sendWindowStart} - {sequence.sendWindowEnd}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-700">Envoyer le week-end</span>
                                <span className={cn("text-sm font-medium", sequence.sendOnWeekends ? "text-emerald-600" : "text-slate-400")}>
                                    {sequence.sendOnWeekends ? "Oui" : "Non"}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
