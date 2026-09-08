"use client";

import React, { useState, useEffect } from "react";
import { 
    MessageSquare, 
    Target, 
    HelpCircle, 
    AlertCircle, 
    CheckCircle2, 
    Wand2, 
    Loader2, 
    Copy, 
    Check, 
    Layers, 
    FileText, 
    Sparkles,
    Eye,
    EyeOff
} from "lucide-react";
import { StrategyArtifactViewer } from "./StrategyArtifactViewer";

export interface ScriptBlockSections {
    intro: string;
    discovery: string;
    objection: string;
    closing: string;
}

interface ScriptBlockEditorProps {
    value: string;
    onChange: (value: string) => void;
    channel?: string;
    clientName?: string;
    icp?: string;
    pitch?: string;
    error?: string;
    className?: string;
    onAiGenerateSection?: (section: "all" | "intro" | "discovery" | "objection" | "closing") => void;
    isGenerating?: boolean;
    generatingSection?: string | null;
}

const SECTIONS_CONFIG: Array<{
    key: keyof ScriptBlockSections;
    label: string;
    stepBadge: string;
    hint: string;
    placeholder: string;
    icon: React.ReactNode;
    colorClasses: {
        border: string;
        borderLeft: string;
        badgeBg: string;
        badgeText: string;
        tagBg: string;
    };
    required?: boolean;
}> = [
    {
        key: "intro",
        label: "1. Introduction & Accroche",
        stepBadge: "Étape 1",
        hint: "Passer le barrage, se présenter, donner le motif de l'appel et obtenir l'accord d'échange.",
        placeholder: "Ex: Bonjour [Prénom], c'est [Votre Nom] de [Votre Entreprise]. Je vous contacte car nous accompagnons des dirigeants de votre secteur sur... Avez-vous 2 minutes ?",
        icon: <Target className="w-4 h-4 text-indigo-600" />,
        colorClasses: {
            border: "border-indigo-100",
            borderLeft: "border-l-indigo-500",
            badgeBg: "bg-indigo-50",
            badgeText: "text-indigo-700",
            tagBg: "bg-indigo-100 text-indigo-700",
        },
        required: true,
    },
    {
        key: "discovery",
        label: "2. Découverte & Qualification",
        stepBadge: "Étape 2",
        hint: "Questions ouvertes pour identifier les défis actuels, l'organisation et le niveau d'intérêt.",
        placeholder: "Ex: Aujourd'hui, comment vos équipes gèrent-elles [sujet clé] ? Quels sont vos principaux axes d'amélioration ce trimestre ?",
        icon: <HelpCircle className="w-4 h-4 text-sky-600" />,
        colorClasses: {
            border: "border-sky-100",
            borderLeft: "border-l-sky-500",
            badgeBg: "bg-sky-50",
            badgeText: "text-sky-700",
            tagBg: "bg-sky-100 text-sky-700",
        },
    },
    {
        key: "objection",
        label: "3. Traitement des Objections",
        stepBadge: "Optionnel",
        hint: "Réponses aux refus types : « pas le temps », « déjà équipé », « envoyez un email », etc.",
        placeholder: "Ex: 'Je n'ai pas le temps' → 'Je comprends tout à fait, justement notre but est de vous faire gagner 5h/semaine. C'est pourquoi je vous propose un simple créneau de 15 min...'",
        icon: <AlertCircle className="w-4 h-4 text-amber-600" />,
        colorClasses: {
            border: "border-amber-100",
            borderLeft: "border-l-amber-500",
            badgeBg: "bg-amber-50",
            badgeText: "text-amber-700",
            tagBg: "bg-amber-100 text-amber-700",
        },
    },
    {
        key: "closing",
        label: "4. Closing & Prise de Rendez-vous",
        stepBadge: "Étape 3",
        hint: "Proposition directe et engageante pour valider une date et heure de visio ou démo.",
        placeholder: "Ex: Parfait ! Je vous propose de caler un échange de 20 minutes avec notre spécialiste. Êtes-vous plutôt disponible mardi matin ou jeudi après-midi ?",
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
        colorClasses: {
            border: "border-emerald-100",
            borderLeft: "border-l-emerald-500",
            badgeBg: "bg-emerald-50",
            badgeText: "text-emerald-700",
            tagBg: "bg-emerald-100 text-emerald-700",
        },
    },
];

/**
 * Parses script string into the 4 structured sections
 */
function parseScriptValue(raw: string): ScriptBlockSections {
    if (!raw || !raw.trim()) {
        return { intro: "", discovery: "", objection: "", closing: "" };
    }

    // 1. Check if JSON
    try {
        const json = JSON.parse(raw);
        if (json && typeof json === "object") {
            return {
                intro: typeof json.intro === "string" ? json.intro : "",
                discovery: typeof json.discovery === "string" ? json.discovery : "",
                objection: typeof json.objection === "string" ? json.objection : "",
                closing: typeof json.closing === "string" ? json.closing : "",
            };
        }
    } catch {
        // Not JSON
    }

    // 2. Check for delimiter format: --- Introduction ---
    if (raw.includes("--- Introduction ---") || raw.includes("--- Decouverte ---") || raw.includes("--- Objections ---") || raw.includes("--- Closing ---")) {
        const parts = raw.split(/---\s*([A-Za-zÀ-ÿ\s/'-]+)\s*---/);
        const result: ScriptBlockSections = { intro: "", discovery: "", objection: "", closing: "" };
        for (let i = 1; i < parts.length; i += 2) {
            const title = (parts[i] || "").toLowerCase();
            const text = (parts[i + 1] || "").trim();
            if (title.includes("intro")) result.intro = text;
            else if (title.includes("decouverte") || title.includes("découverte")) result.discovery = text;
            else if (title.includes("objection")) result.objection = text;
            else if (title.includes("closing") || title.includes("cloture") || title.includes("clôture")) result.closing = text;
        }
        return result;
    }

    // 3. Fallback: place raw string into intro
    return {
        intro: raw,
        discovery: "",
        objection: "",
        closing: "",
    };
}

/**
 * Serializes sections to JSON string for database storage
 */
function serializeScriptSections(sections: ScriptBlockSections): string {
    return JSON.stringify(sections);
}

export function ScriptBlockEditor({
    value,
    onChange,
    channel = "CALL",
    clientName,
    icp,
    pitch,
    error,
    className = "",
    onAiGenerateSection,
    isGenerating = false,
    generatingSection = null,
}: ScriptBlockEditorProps) {
    const [mode, setMode] = useState<"blocks" | "continuous">("blocks");
    const [sections, setSections] = useState<ScriptBlockSections>(() => parseScriptValue(value));
    const [continuousText, setContinuousText] = useState<string>("");
    const [showPreview, setShowPreview] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    // Keep state in sync with external value
    useEffect(() => {
        const parsed = parseScriptValue(value);
        setSections(parsed);
        const text = [
            parsed.intro ? `--- Introduction ---\n${parsed.intro}` : "",
            parsed.discovery ? `--- Decouverte ---\n${parsed.discovery}` : "",
            parsed.objection ? `--- Objections ---\n${parsed.objection}` : "",
            parsed.closing ? `--- Closing ---\n${parsed.closing}` : "",
        ].filter(Boolean).join("\n\n");
        setContinuousText(text || value);
    }, [value]);

    const handleSectionChange = (key: keyof ScriptBlockSections, newText: string) => {
        const updated = { ...sections, [key]: newText };
        setSections(updated);
        onChange(serializeScriptSections(updated));
    };

    const handleContinuousChange = (newText: string) => {
        setContinuousText(newText);
        const parsed = parseScriptValue(newText);
        setSections(parsed);
        onChange(serializeScriptSections(parsed));
    };

    const handleCopySection = async (key: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 2000);
        } catch {
            // fallback
        }
    };

    const insertVariable = (variable: string, targetKey?: keyof ScriptBlockSections) => {
        const key = targetKey || "intro";
        const current = sections[key];
        handleSectionChange(key, (current ? current + " " : "") + variable);
    };

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Header Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setMode("blocks")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                            mode === "blocks"
                                ? "bg-white text-indigo-700 shadow-sm border border-slate-200"
                                : "text-slate-600 hover:text-slate-900"
                        }`}
                    >
                        <Layers className="w-3.5 h-3.5 text-indigo-600" />
                        4 Blocs d'appel séparés
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode("continuous")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                            mode === "continuous"
                                ? "bg-white text-indigo-700 shadow-sm border border-slate-200"
                                : "text-slate-600 hover:text-slate-900"
                        }`}
                    >
                        <FileText className="w-3.5 h-3.5 text-slate-600" />
                        Script continu
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    {onAiGenerateSection && (
                        <button
                            type="button"
                            onClick={() => onAiGenerateSection("all")}
                            disabled={isGenerating || !icp || !pitch}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 shadow-sm shadow-indigo-500/20 transition-all"
                            title="Générer les 4 blocs de script avec l'IA"
                        >
                            {isGenerating && generatingSection === "all" ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Wand2 className="w-3.5 h-3.5" />
                            )}
                            <span>Générer tout (IA)</span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => setShowPreview(!showPreview)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            showPreview
                                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                        title="Aperçu du script formaté"
                    >
                        {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">{showPreview ? "Masquer" : "Aperçu"}</span>
                    </button>
                </div>
            </div>

            {/* Quick Variable tags */}
            <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs text-slate-500">
                <span className="text-[11px] font-medium text-slate-400">Insérer variable :</span>
                {["[Prénom]", "[Nom]", "[Société]", "[Poste]", "[Secteur]"].map(v => (
                    <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(v)}
                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-[11px] font-mono font-medium text-slate-600 border border-slate-200 transition-colors"
                    >
                        +{v}
                    </button>
                ))}
            </div>

            {/* LIVE PREVIEW IF TOGGLED */}
            {showPreview && (
                <div className="p-4 bg-slate-50/70 border border-indigo-100 rounded-2xl animate-in fade-in duration-200">
                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 mb-2">Aperçu pour les SDRs</p>
                    <StrategyArtifactViewer type="script" content={serializeScriptSections(sections)} />
                </div>
            )}

            {/* 4 BLOCKS MODE */}
            {mode === "blocks" && (
                <div className="space-y-4">
                    {SECTIONS_CONFIG.map((sec) => (
                        <div
                            key={sec.key}
                            className={`p-4 bg-white border ${sec.colorClasses.border} border-l-4 ${sec.colorClasses.borderLeft} rounded-xl shadow-xs transition-all hover:shadow-sm`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="p-1 rounded-md bg-slate-100">
                                        {sec.icon}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                                                {sec.label}
                                            </span>
                                            {sec.required && <span className="text-red-500 text-xs font-bold">*</span>}
                                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${sec.colorClasses.tagBg}`}>
                                                {sec.stepBadge}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{sec.hint}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    {onAiGenerateSection && (
                                        <button
                                            type="button"
                                            onClick={() => onAiGenerateSection(sec.key)}
                                            disabled={isGenerating || !icp || !pitch}
                                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:text-slate-400 px-2 py-1 rounded transition-colors"
                                            title="Générer cette section avec l'IA"
                                        >
                                            {isGenerating && generatingSection === sec.key ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <Wand2 className="w-3 h-3" />
                                            )}
                                            <span>IA</span>
                                        </button>
                                    )}

                                    {sections[sec.key] && (
                                        <button
                                            type="button"
                                            onClick={() => handleCopySection(sec.key, sections[sec.key])}
                                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
                                            title="Copier cette section"
                                        >
                                            {copiedKey === sec.key ? (
                                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                            ) : (
                                                <Copy className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* CRITICAL: whitespace-pre-wrap ensures spaces, blank lines, and bullet indentation are kept */}
                            <textarea
                                value={sections[sec.key]}
                                onChange={(e) => handleSectionChange(sec.key, e.target.value)}
                                placeholder={sec.placeholder}
                                rows={sec.key === "intro" ? 3 : 4}
                                className="w-full px-3.5 py-2.5 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 transition-all resize-y font-sans leading-relaxed whitespace-pre-wrap"
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* CONTINUOUS MODE */}
            {mode === "continuous" && (
                <div>
                    <textarea
                        value={continuousText}
                        onChange={(e) => handleContinuousChange(e.target.value)}
                        placeholder="Rédigez le script d'appel complet..."
                        rows={12}
                        className="w-full px-4 py-3 bg-white border border-slate-200 focus:border-indigo-500 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 transition-all resize-y font-mono leading-relaxed whitespace-pre-wrap"
                    />
                    <p className="text-[11px] text-slate-400 mt-1 px-1">
                        Utilisez les délimiteurs <code>--- Introduction ---</code>, <code>--- Decouverte ---</code>, <code>--- Objections ---</code>, <code>--- Closing ---</code> pour découper automatiquement en 4 blocs.
                    </p>
                </div>
            )}

            {error && (
                <p className="text-xs text-red-500 mt-1 font-medium">{error}</p>
            )}
        </div>
    );
}
