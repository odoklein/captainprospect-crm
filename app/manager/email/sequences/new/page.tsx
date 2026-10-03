"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    ArrowLeft,
    Plus,
    Trash2,
    GripVertical,
    Clock,
    Mail,
    Zap,
    Save,
    Loader2,
    ChevronDown,
    ChevronUp,
    AlertCircle,
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
    isExpanded: boolean;
}

interface Mailbox {
    id: string;
    email: string;
    displayName: string | null;
}

interface Campaign {
    id: string;
    name: string;
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
}: {
    step: SequenceStep;
    stepNumber: number;
    onChange: (updates: Partial<SequenceStep>) => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    isFirst: boolean;
    isLast: boolean;
}) {
    return (
        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            {/* Step Header */}
            <div
                className="flex items-center gap-3 px-4 py-3 bg-slate-50 cursor-pointer"
                onClick={() => onChange({ isExpanded: !step.isExpanded })}
            >
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

                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
                
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
                                className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-center"
                            />
                            <span className="text-sm text-slate-600">jours</span>
                            <input
                                type="number"
                                min="0"
                                max="23"
                                value={step.delayHours}
                                onChange={(e) => onChange({ delayHours: parseInt(e.target.value) || 0 })}
                                className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-center"
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
                            placeholder="Re: {{firstName}}, suite à notre échange..."
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                        <p className="mt-1 text-xs text-slate-500">
                            Variables: {"{{firstName}}"}, {"{{lastName}}"}, {"{{company}}"}, {"{{title}}"}
                        </p>
                    </div>

                    {/* Body */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Contenu de l'email
                        </label>
                        <textarea
                            value={step.bodyHtml}
                            onChange={(e) => onChange({ bodyHtml: e.target.value })}
                            placeholder="Bonjour {{firstName}},&#10;&#10;Je me permets de vous relancer concernant..."
                            rows={8}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none font-mono"
                        />
                    </div>

                    {/* Skip conditions */}
                    <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={step.skipIfOpened}
                                onChange={(e) => onChange({ skipIfOpened: e.target.checked })}
                                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm text-slate-600">Passer si ouvert</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={step.skipIfClicked}
                                onChange={(e) => onChange({ skipIfClicked: e.target.checked })}
                                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm text-slate-600">Passer si cliqué</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={step.skipIfReplied}
                                onChange={(e) => onChange({ skipIfReplied: e.target.checked })}
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
// MAIN PAGE
// ============================================

export default function NewSequencePage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Form state
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [mailboxId, setMailboxId] = useState("");
    const [campaignId, setCampaignId] = useState("");
    const [stopOnReply, setStopOnReply] = useState(true);
    const [stopOnBounce, setStopOnBounce] = useState(true);
    const [sendOnWeekends, setSendOnWeekends] = useState(false);
    const [sendWindowStart, setSendWindowStart] = useState("09:00");
    const [sendWindowEnd, setSendWindowEnd] = useState("18:00");
    
    // Steps
    const [steps, setSteps] = useState<SequenceStep[]>([
        {
            id: crypto.randomUUID(),
            order: 1,
            subject: "",
            bodyHtml: "",
            delayDays: 0,
            delayHours: 0,
            skipIfOpened: false,
            skipIfClicked: false,
            skipIfReplied: true,
            isExpanded: true,
        },
    ]);

    // Data for selects
    const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);

    // Fetch mailboxes and campaigns
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [mbRes, campRes] = await Promise.all([
                    fetch("/api/email/mailboxes"),
                    fetch("/api/campaigns"),
                ]);
                
                const mbJson = await mbRes.json();
                const campJson = await campRes.json();
                
                if (mbJson.success) {
                    setMailboxes(mbJson.data);
                    if (mbJson.data.length > 0) {
                        setMailboxId(mbJson.data[0].id);
                    }
                }
                
                if (campJson.data) {
                    setCampaigns(campJson.data);
                }
            } catch (err) {
                console.error("Failed to fetch data:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    // Add step
    const addStep = () => {
        const newStep: SequenceStep = {
            id: crypto.randomUUID(),
            order: steps.length + 1,
            subject: "",
            bodyHtml: "",
            delayDays: 2,
            delayHours: 0,
            skipIfOpened: false,
            skipIfClicked: false,
            skipIfReplied: true,
            isExpanded: true,
        };
        setSteps([...steps.map(s => ({ ...s, isExpanded: false })), newStep]);
    };

    // Update step
    const updateStep = (id: string, updates: Partial<SequenceStep>) => {
        setSteps(steps.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    // Delete step
    const deleteStep = (id: string) => {
        if (steps.length <= 1) return;
        const newSteps = steps.filter(s => s.id !== id);
        setSteps(newSteps.map((s, i) => ({ ...s, order: i + 1 })));
    };

    // Move step
    const moveStep = (id: string, direction: 'up' | 'down') => {
        const index = steps.findIndex(s => s.id === id);
        if (direction === 'up' && index > 0) {
            const newSteps = [...steps];
            [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
            setSteps(newSteps.map((s, i) => ({ ...s, order: i + 1 })));
        } else if (direction === 'down' && index < steps.length - 1) {
            const newSteps = [...steps];
            [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
            setSteps(newSteps.map((s, i) => ({ ...s, order: i + 1 })));
        }
    };

    // Save sequence
    const handleSave = async () => {
        if (!name.trim()) {
            setError("Le nom de la séquence est requis");
            return;
        }
        if (!mailboxId) {
            setError("Veuillez sélectionner une boîte mail");
            return;
        }
        if (steps.some(s => !s.subject.trim())) {
            setError("Tous les emails doivent avoir un sujet");
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const res = await fetch("/api/email/sequences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    description,
                    mailboxId,
                    campaignId: campaignId || undefined,
                    stopOnReply,
                    stopOnBounce,
                    sendOnWeekends,
                    sendWindowStart,
                    sendWindowEnd,
                    steps: steps.map(s => ({
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
                router.push(`/manager/email/sequences/${json.data.id}`);
            } else {
                setError(json.error || "Erreur lors de la création");
            }
        } catch (err) {
            setError("Erreur lors de la création");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Nouvelle séquence</h1>
                        <p className="text-sm text-slate-500">Créez une séquence d'emails automatisée</p>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-500 disabled:opacity-50 transition-colors"
                >
                    {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Save className="w-4 h-4" />
                    )}
                    Créer la séquence
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Settings */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Configuration</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                    Nom de la séquence *
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Ex: Relance prospect froid"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                    Description
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Décrivez l'objectif de cette séquence..."
                                    rows={3}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                    Boîte mail d'envoi *
                                </label>
                                <select
                                    value={mailboxId}
                                    onChange={(e) => setMailboxId(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
                                >
                                    <option value="">Sélectionner...</option>
                                    {mailboxes.map((mb) => (
                                        <option key={mb.id} value={mb.id}>
                                            {mb.displayName || mb.email}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                    Campagne associée
                                </label>
                                <select
                                    value={campaignId}
                                    onChange={(e) => setCampaignId(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
                                >
                                    <option value="">Aucune</option>
                                    {campaigns.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Règles d'arrêt</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={stopOnReply}
                                    onChange={(e) => setStopOnReply(e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm text-slate-700">Arrêter si réponse reçue</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={stopOnBounce}
                                    onChange={(e) => setStopOnBounce(e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm text-slate-700">Arrêter si bounce</span>
                            </label>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Fenêtre d'envoi</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">
                                        Début
                                    </label>
                                    <input
                                        type="time"
                                        value={sendWindowStart}
                                        onChange={(e) => setSendWindowStart(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">
                                        Fin
                                    </label>
                                    <input
                                        type="time"
                                        value={sendWindowEnd}
                                        onChange={(e) => setSendWindowEnd(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                    />
                                </div>
                            </div>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={sendOnWeekends}
                                    onChange={(e) => setSendOnWeekends(e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm text-slate-700">Envoyer le week-end</span>
                            </label>
                        </CardContent>
                    </Card>
                </div>

                {/* Steps */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-900">
                            Étapes ({steps.length})
                        </h2>
                        <button
                            onClick={addStep}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Ajouter une étape
                        </button>
                    </div>

                    <div className="space-y-3">
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
                            />
                        ))}
                    </div>

                    {/* Add step button */}
                    <button
                        onClick={addStep}
                        className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50/50 transition-colors flex items-center justify-center gap-2"
                    >
                        <Plus className="w-5 h-5" />
                        Ajouter une étape
                    </button>
                </div>
            </div>
        </div>
    );
}
