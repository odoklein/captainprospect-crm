"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { createMission, CreateMissionInput } from "@/app/actions/mission-wizard";
import { Channel } from "@prisma/client";
import type { MissionStatusValue } from "@/lib/constants/missionStatus";
import {
    X,
    Target,
    MessageSquare,
    CheckCircle2,
    ChevronRight,
    ChevronLeft,
    Phone,
    Mail,
    Linkedin,
    Calendar,
    Loader2,
    Wand2,
    Sparkles,
    Building2,
    FileText,
    Rocket,
    ArrowRight,
    Check,
} from "lucide-react";
import { PitchBlockEditor, StrategyArtifactViewer } from "@/components/strategy";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Client {
    id: string;
    name: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onCreated?: () => void;
}

const CHANNEL_OPTIONS = [
    {
        value: "CALL",
        label: "Appel téléphonique",
        icon: Phone,
        description: "Prospection par téléphone",
        gradient: "from-blue-500 to-indigo-600",
        bgLight: "bg-blue-50",
        border: "border-blue-200",
        text: "text-blue-700",
        selected: "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-500/20",
    },
    {
        value: "EMAIL",
        label: "Email",
        icon: Mail,
        description: "Campagnes email froides",
        gradient: "from-violet-500 to-purple-600",
        bgLight: "bg-violet-50",
        border: "border-violet-200",
        text: "text-violet-700",
        selected: "border-violet-400 bg-violet-50 ring-2 ring-violet-500/20",
    },
    {
        value: "LINKEDIN",
        label: "LinkedIn",
        icon: Linkedin,
        description: "Prospection sociale",
        gradient: "from-sky-500 to-blue-600",
        bgLight: "bg-sky-50",
        border: "border-sky-200",
        text: "text-sky-700",
        selected: "border-sky-400 bg-sky-50 ring-2 ring-sky-500/20",
    },
];

const STEPS = [
    { id: 1, label: "Mission", icon: Building2, description: "Infos générales" },
    { id: 2, label: "Stratégie", icon: Target, description: "ICP & Pitch" },
    { id: 3, label: "Script", icon: MessageSquare, description: "Argumentaire" },
    { id: 4, label: "Lancer", icon: Rocket, description: "Récapitulatif" },
];

const SCRIPT_SECTIONS = [
    { key: "scriptIntro", label: "Introduction / Accroche", placeholder: "Comment vous présentez-vous et captez l'attention ?", step: "Étape 1", required: true },
    { key: "scriptDiscovery", label: "Phase de découverte", placeholder: "Quelles questions posez-vous pour qualifier le besoin ?", step: "Étape 2", required: false },
    { key: "scriptObjection", label: "Réponses aux objections", placeholder: "Arguments face aux refus les plus courants...", step: "Optionnel", required: false },
    { key: "scriptClosing", label: "Closing / Appel à l'action", placeholder: "Comment proposez-vous le rendez-vous ou l'étape suivante ?", step: "Étape 3", required: false },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export function NewMissionDialog({ isOpen, onClose, onCreated }: Props) {
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [step, setStep] = useState(1);
    const [clients, setClients] = useState<Client[]>([]);
    const [isLoadingClients, setIsLoadingClients] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatingSection, setGeneratingSection] = useState<string | null>(null);
    const [direction, setDirection] = useState<"forward" | "back">("forward");

    const [form, setForm] = useState<CreateMissionInput & { channels?: Channel[] }>({
        name: "",
        objective: "",
        channel: "CALL" as Channel,
        channels: ["CALL"],
        clientId: "",
        startDate: "",
        endDate: "",
        icp: "",
        pitch: "",
        scriptIntro: "",
        scriptDiscovery: "",
        scriptObjection: "",
        scriptClosing: "",
        status: "DRAFT" as MissionStatusValue,
    });

    useEffect(() => {
        if (!isOpen) return;
        setStep(1);
        setForm({
            name: "", objective: "", channel: "CALL" as Channel, channels: ["CALL"],
            clientId: "", startDate: "", endDate: "",
            icp: "", pitch: "",
            scriptIntro: "", scriptDiscovery: "", scriptObjection: "", scriptClosing: "",
            status: "DRAFT" as MissionStatusValue,
        });
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        setIsLoadingClients(true);
        fetch("/api/clients")
            .then(r => r.json())
            .then(json => {
                if (json.success) {
                    setClients(json.data);
                    if (json.data.length === 1) {
                        setForm(prev => ({ ...prev, clientId: json.data[0].id }));
                    }
                }
            })
            .catch(() => { })
            .finally(() => setIsLoadingClients(false));
    }, [isOpen]);

    // ─── Validation ───────────────────────────────────────────────────────────

    const step1Valid = !!form.name.trim() && !!form.clientId && (form.channels?.length ?? 0) > 0;
    const step2Valid = !!form.icp.trim() && !!form.pitch.trim();
    const step3Valid = !!form.scriptIntro.trim();

    const stepValid = (s: number) => {
        if (s === 1) return step1Valid;
        if (s === 2) return step2Valid;
        if (s === 3) return step3Valid;
        return true;
    };

    // ─── Navigation ───────────────────────────────────────────────────────────

    const goNext = () => {
        if (!stepValid(step)) return;
        setDirection("forward");
        setStep(s => Math.min(4, s + 1));
    };

    const goBack = () => {
        setDirection("back");
        setStep(s => Math.max(1, s - 1));
    };

    // ─── AI Generation ───────────────────────────────────────────────────────

    const generateSection = async (section: string) => {
        if (!form.icp.trim() || !form.pitch.trim()) {
            showError("Erreur", "Renseignez d'abord l'ICP et le pitch (étape 2)");
            return;
        }
        setIsGenerating(true);
        setGeneratingSection(section);
        try {
            const res = await fetch("/api/ai/mistral/script", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    channel: form.channel,
                    clientName: clients.find(c => c.id === form.clientId)?.name || "Client",
                    missionName: form.name || "Mission",
                    campaignName: form.name || "Mission",
                    campaignDescription: form.objective,
                    icp: form.icp,
                    pitch: form.pitch,
                    section,
                    suggestionsCount: 1,
                }),
            });
            const json = await res.json();
            if (json.success) {
                const script = json.data?.script || json.data?.suggestions || {};
                const fieldMap: Record<string, keyof CreateMissionInput> = {
                    intro: "scriptIntro",
                    discovery: "scriptDiscovery",
                    objection: "scriptObjection",
                    closing: "scriptClosing",
                    all: "scriptIntro",
                };
                if (section === "all") {
                    setForm(prev => ({
                        ...prev,
                        scriptIntro: (script.intro?.[0] ?? script.intro) || prev.scriptIntro,
                        scriptDiscovery: (script.discovery?.[0] ?? script.discovery) || prev.scriptDiscovery,
                        scriptObjection: (script.objection?.[0] ?? script.objection) || prev.scriptObjection,
                        scriptClosing: (script.closing?.[0] ?? script.closing) || prev.scriptClosing,
                    }));
                    success("IA", "Script généré avec succès !");
                } else {
                    const val = (script[section]?.[0] ?? script[section]) || "";
                    if (val) {
                        setForm(prev => ({ ...prev, [fieldMap[section]]: val }));
                        success("IA", "Section générée !");
                    }
                }
            } else {
                showError("Erreur IA", json.error || "Génération impossible");
            }
        } catch {
            showError("Erreur", "Connexion IA indisponible");
        } finally {
            setIsGenerating(false);
            setGeneratingSection(null);
        }
    };

    // ─── Submit ───────────────────────────────────────────────────────────────

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const res = await createMission(form);
            if (res.success) {
                success("Mission créée 🎉", res.message || "Votre mission est prête !");
                onClose();
                onCreated?.();
                if (res.missionId) router.push(`/manager/missions/${res.missionId}`);
            } else {
                showError("Erreur", res.error || "Impossible de créer la mission");
            }
        } catch {
            showError("Erreur", "Une erreur inattendue est survenue");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const clientName = clients.find(c => c.id === form.clientId)?.name;
    const channelOption = CHANNEL_OPTIONS.find(c => c.value === form.channel);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200/50">

                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-8 pt-8 pb-6 flex-shrink-0">
                    {/* Decorative orbs */}
                    <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-indigo-600/20 blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-12 left-12 w-32 h-32 rounded-full bg-violet-600/15 blur-2xl pointer-events-none" />

                    <div className="relative z-10">
                        <div className="flex items-start justify-between mb-6">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                                        <Rocket className="w-3.5 h-3.5 text-indigo-300" />
                                    </div>
                                    <span className="text-xs font-semibold text-indigo-300 uppercase tracking-widest">Nouvelle mission</span>
                                </div>
                                <h2 className="text-2xl font-bold text-white">
                                    {step === 1 && "Informations générales"}
                                    {step === 2 && "Stratégie de prospection"}
                                    {step === 3 && "Script d'appel"}
                                    {step === 4 && "Prêt à lancer !"}
                                </h2>
                                <p className="text-sm text-slate-400 mt-0.5">
                                    {step === 1 && "Nommez votre mission et choisissez le canal"}
                                    {step === 2 && "Définissez votre cible et votre argumentaire"}
                                    {step === 3 && "Construisez votre script de prospection"}
                                    {step === 4 && "Vérifiez et lancez votre mission"}
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-white/70 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Step indicator */}
                        <div className="flex items-center gap-0">
                            {STEPS.map((s, i) => {
                                const done = step > s.id;
                                const active = step === s.id;
                                const StepIcon = s.icon;
                                return (
                                    <div key={s.id} className="flex items-center flex-1 last:flex-none">
                                        <button
                                            onClick={() => done ? (setDirection(s.id < step ? "back" : "forward"), setStep(s.id)) : undefined}
                                            className={`flex items-center gap-2 ${done ? "cursor-pointer" : "cursor-default"}`}
                                            disabled={!done && !active}
                                        >
                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 text-xs font-bold ${done
                                                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                                                    : active
                                                        ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/40 scale-110"
                                                        : "bg-white/10 text-white/40"
                                                }`}>
                                                {done ? <Check className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                                            </div>
                                            <div className="hidden sm:block">
                                                <p className={`text-xs font-semibold transition-colors ${active ? "text-white" : done ? "text-emerald-300" : "text-white/40"}`}>
                                                    {s.label}
                                                </p>
                                                <p className={`text-[10px] transition-colors ${active ? "text-slate-400" : "text-white/25"}`}>{s.description}</p>
                                            </div>
                                        </button>
                                        {i < STEPS.length - 1 && (
                                            <div className={`flex-1 mx-3 h-px transition-all ${step > s.id ? "bg-emerald-500/50" : "bg-white/15"}`} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ── Body ───────────────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto">
                    <div className="p-8">

                        {/* ── STEP 1: Mission basics ── */}
                        {step === 1 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">

                                {/* Client */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                                        Client <span className="text-red-500">*</span>
                                    </label>
                                    {isLoadingClients ? (
                                        <div className="h-11 bg-slate-100 rounded-xl animate-pulse" />
                                    ) : (
                                        <select
                                            value={form.clientId}
                                            onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}
                                            className="w-full h-11 px-4 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                                        >
                                            <option value="">Sélectionner un client...</option>
                                            {clients.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                {/* Name */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                                        Nom de la mission <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                                        placeholder="Ex: Prospection SaaS B2B Q1 2026"
                                        className="w-full h-11 px-4 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all placeholder:text-slate-400"
                                    />
                                </div>

                                {/* Objective */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Objectif</label>
                                    <textarea
                                        value={form.objective}
                                        onChange={e => setForm(p => ({ ...p, objective: e.target.value }))}
                                        placeholder="Ex: Générer 50 rendez-vous qualifiés en 3 mois..."
                                        rows={3}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all placeholder:text-slate-400 resize-none"
                                    />
                                </div>

                                {/* Channels (multi-select) */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-3">
                                        Canaux <span className="text-red-500">*</span>
                                    </label>
                                    <p className="text-xs text-slate-500 mb-2">Sélectionnez un ou plusieurs canaux pour cette mission (appels, email, LinkedIn peuvent être utilisés ensemble).</p>
                                    <div className="grid grid-cols-3 gap-3">
                                        {CHANNEL_OPTIONS.map(opt => {
                                            const Icon = opt.icon;
                                            const isSelected = form.channels?.includes(opt.value as Channel) ?? form.channel === opt.value;
                                            return (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    onClick={() => {
                                                        const current = form.channels ?? [form.channel];
                                                        const next = isSelected
                                                            ? current.filter(c => c !== opt.value)
                                                            : [...current, opt.value as Channel];
                                                        if (next.length === 0) return;
                                                        setForm(p => ({
                                                            ...p,
                                                            channels: next,
                                                            channel: next[0],
                                                        }));
                                                    }}
                                                    className={`group relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all duration-200 ${isSelected
                                                            ? opt.selected
                                                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                                                        }`}
                                                >
                                                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${opt.gradient} flex items-center justify-center shadow-md group-hover:scale-105 transition-transform ${isSelected ? "scale-110" : ""}`}>
                                                        <Icon className="w-6 h-6 text-white" />
                                                    </div>
                                                    <div className="text-center">
                                                        <p className={`text-sm font-bold ${isSelected ? opt.text : "text-slate-700"}`}>{opt.label}</p>
                                                        <p className="text-[11px] text-slate-400 mt-0.5">{opt.description}</p>
                                                    </div>
                                                    {isSelected && (
                                                        <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                                                            <Check className="w-3 h-3 text-white" />
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Dates */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">Date de début</label>
                                        <input
                                            type="date"
                                            value={form.startDate}
                                            onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                                            className="w-full h-11 px-4 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">Date de fin</label>
                                        <input
                                            type="date"
                                            value={form.endDate}
                                            onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                                            className="w-full h-11 px-4 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Statut initial</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setForm((p) => ({ ...p, status: "DRAFT" as MissionStatusValue }))}
                                            className={`px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${form.status === "DRAFT" ? "border-slate-400 bg-slate-100 text-slate-800" : "border-slate-200 bg-white text-slate-600"}`}
                                        >
                                            Brouillon
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setForm((p) => ({ ...p, status: "ACTIVE" as MissionStatusValue }))}
                                            className={`px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${form.status === "ACTIVE" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"}`}
                                        >
                                            Active
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 2: Strategy ── */}
                        {step === 2 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                {/* Info banner */}
                                <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-2xl">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <Target className="w-4 h-4 text-indigo-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-indigo-900">Pourquoi c'est important ?</p>
                                        <p className="text-xs text-indigo-600 mt-0.5">L'ICP et le pitch alimentent l'IA pour générer votre script et guident vos SDRs pendant les appels.</p>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                        ICP — Profil Client Idéal <span className="text-red-500">*</span>
                                    </label>
                                    <p className="text-xs text-slate-500 mb-2">Qui cherchez-vous à contacter ? Soyez précis : secteur, taille, poste, problème...</p>
                                    <textarea
                                        value={form.icp}
                                        onChange={e => setForm(p => ({ ...p, icp: e.target.value }))}
                                        placeholder="Ex: CEOs et DG de startups B2B SaaS entre 10 et 100 employés en France, dans les secteurs RH et finance, qui cherchent à automatiser leur prospection."
                                        rows={4}
                                        className={`w-full px-4 py-3 border rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all placeholder:text-slate-400 resize-none ${!form.icp && "border-red-300" || "border-slate-200"}`}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                        Pitch Commercial <span className="text-red-500">*</span>
                                    </label>
                                    <p className="text-xs text-slate-500 mb-2">Quelle valeur apportez-vous ? Utilisez les blocs ou le texte libre, et structurez automatiquement en 1 clic.</p>
                                    <PitchBlockEditor
                                        value={form.pitch}
                                        onChange={val => setForm(p => ({ ...p, pitch: val }))}
                                        icp={form.icp}
                                        clientName={clientName}
                                        channel={form.channels?.[0] || form.channel}
                                        placeholder="Ex: Nous aidons les équipes commerciales à multiplier par 3 le nombre de meetings qualifiés..."
                                    />
                                </div>
                            </div>
                        )}

                        {/* ── STEP 3: Script ── */}
                        {step === 3 && (
                            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                                {/* AI generate all button */}
                                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-2xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                                            <Sparkles className="w-4.5 h-4.5 text-white" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-indigo-900">Générer avec l'IA</p>
                                            <p className="text-xs text-indigo-500">Remplir tout le script automatiquement</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => generateSection("all")}
                                        disabled={isGenerating || !form.icp || !form.pitch}
                                        className="flex items-center gap-2 h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold transition-all shadow-md shadow-indigo-500/30"
                                    >
                                        {isGenerating && generatingSection === "all" ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Wand2 className="w-4 h-4" />
                                        )}
                                        Générer tout
                                    </button>
                                </div>

                                {SCRIPT_SECTIONS.map(sec => (
                                    <div key={sec.key}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <label className="text-sm font-semibold text-slate-700">
                                                    {sec.label}
                                                    {sec.required && <span className="text-red-500 ml-1">*</span>}
                                                </label>
                                                <span className={`ml-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${sec.required ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>
                                                    {sec.step}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => generateSection(sec.key.replace("script", "").toLowerCase())}
                                                disabled={isGenerating || !form.icp || !form.pitch}
                                                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:text-slate-400 font-medium transition-colors"
                                            >
                                                {isGenerating && generatingSection === sec.key.replace("script", "").toLowerCase() ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <Wand2 className="w-3 h-3" />
                                                )}
                                                Générer
                                            </button>
                                        </div>
                                        <textarea
                                            value={(form as any)[sec.key]}
                                            onChange={e => setForm(p => ({ ...p, [sec.key]: e.target.value }))}
                                            placeholder={sec.placeholder}
                                            rows={3}
                                            className={`w-full px-4 py-3 border rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all placeholder:text-slate-400 resize-none font-mono ${sec.required && !(form as any)[sec.key] ? "border-red-200 bg-red-50/30" : "border-slate-200"
                                                }`}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ── STEP 4: Review ── */}
                        {step === 4 && (
                            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                                {/* Success banner */}
                                <div className="relative overflow-hidden flex items-center gap-4 p-5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/30">
                                        <CheckCircle2 className="w-7 h-7 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-emerald-900">Tout est prêt !</p>
                                        <p className="text-sm text-emerald-600 mt-0.5">Vérifiez les informations ci-dessous puis lancez votre mission.</p>
                                    </div>
                                </div>

                                {/* Mission card */}
                                <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4">
                                    <div className="flex items-center gap-3 mb-1">
                                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${channelOption?.gradient} flex items-center justify-center text-lg font-bold text-white shadow-md`}>
                                            {clientName?.[0] || "M"}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900">{form.name}</p>
                                            <p className="text-xs text-slate-500">{clientName}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                        {[
                                            { label: "Canal", value: channelOption?.label },
                                            { label: "Période", value: form.startDate ? `${form.startDate} → ${form.endDate || "Ouvert"}` : "Non définie" },
                                        ].map(r => (
                                            <div key={r.label} className="p-3 bg-slate-50 rounded-xl">
                                                <p className="text-slate-400 font-medium uppercase tracking-wide text-[10px]">{r.label}</p>
                                                <p className="text-slate-800 font-semibold mt-0.5">{r.value}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {form.objective && (
                                        <div className="p-3 bg-slate-50 rounded-xl">
                                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">Objectif</p>
                                            <p className="text-sm text-slate-700">{form.objective}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Strategy card */}
                                <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-3">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Stratégie</p>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-semibold uppercase mb-1">ICP</p>
                                        <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl leading-relaxed">{form.icp || "—"}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-semibold uppercase mb-1.5">Pitch Commercial</p>
                                        <StrategyArtifactViewer type="pitch" content={form.pitch} emptyText="Aucun pitch défini" />
                                    </div>
                                </div>

                                {/* Script card */}
                                {form.scriptIntro && (
                                    <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-3">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Script d'appel</p>
                                        <StrategyArtifactViewer
                                            type="script"
                                            content={JSON.stringify({
                                                intro: form.scriptIntro,
                                                discovery: form.scriptDiscovery,
                                                objection: form.scriptObjection,
                                                closing: form.scriptClosing,
                                            })}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Footer ─────────────────────────────────────────────── */}
                <div className="flex-shrink-0 border-t border-slate-100 bg-slate-50/80 px-8 py-5 flex items-center justify-between gap-4">
                    {/* Back */}
                    <button
                        type="button"
                        onClick={step === 1 ? onClose : goBack}
                        className="flex items-center gap-2 h-10 px-5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-all"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        {step === 1 ? "Annuler" : "Retour"}
                    </button>

                    {/* Step pills */}
                    <div className="flex items-center gap-1.5">
                        {STEPS.map(s => (
                            <div
                                key={s.id}
                                className={`rounded-full transition-all duration-300 ${step === s.id
                                        ? "w-6 h-2 bg-indigo-600"
                                        : step > s.id
                                            ? "w-2 h-2 bg-emerald-400"
                                            : "w-2 h-2 bg-slate-200"
                                    }`}
                            />
                        ))}
                    </div>

                    {/* Next / Submit */}
                    {step < 4 ? (
                        <button
                            type="button"
                            onClick={goNext}
                            disabled={!stepValid(step)}
                            className="flex items-center gap-2 h-10 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-md shadow-indigo-500/20"
                        >
                            Suivant
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="flex items-center gap-2 h-10 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-40 text-white text-sm font-bold transition-all shadow-md shadow-emerald-500/30"
                        >
                            {isSubmitting ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Création...</>
                            ) : (
                                <><Rocket className="w-4 h-4" /> Lancer la mission</>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
